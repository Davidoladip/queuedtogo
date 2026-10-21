-- QueuedToGo: app functions (business creation, invitations, publishing, public reads)

-- ---------------------------------------------------------------------------
-- Default production stages for a new business (from the prototype)
-- ---------------------------------------------------------------------------
create or replace function public.seed_default_stages(p_org uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.workflow_stages (org_id, name, position, color, is_final, notify_customer, message_template) values
    (p_org, 'New order',            0, '#7B8194', false, true,  'Hi {name}, we have your order {order}. Follow it here: {link} - {business}'),
    (p_org, 'Artwork approval',     1, '#9A5BD0', false, true,  'Hi {name}, we are checking the design for order {order}. We will be in touch if anything needs changing. - {business}'),
    (p_org, 'In production',        2, '#3346D3', false, true,  'Good news {name}! Order {order} is being made now. - {business}'),
    (p_org, 'Quality check',        3, '#C9821B', false, false, 'Hi {name}, order {order} is going through quality checks. - {business}'),
    (p_org, 'Ready for collection', 4, '#1D8657', false, true,  'Hi {name}, order {order} is ready to collect. - {business}'),
    (p_org, 'Completed',            5, '#5A6077', true,  false, 'Thanks {name}! Order {order} is complete. - {business}');
$$;
revoke execute on function public.seed_default_stages(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_organization: the only way to create a business. Caller becomes owner.
-- ---------------------------------------------------------------------------
create or replace function public.create_organization(p_name text, p_slug text)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org public.organizations;
begin
  if v_uid is null then
    raise exception 'Sign in to create a business' using errcode = '42501';
  end if;
  if (select count(*) from public.organizations o where o.created_by = v_uid) >= 20 then
    raise exception 'You have reached the limit of 20 businesses' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'Profile missing for this account' using errcode = 'P0001';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (btrim(p_name), lower(btrim(p_slug)), v_uid)
  returning * into v_org;

  insert into public.organization_members (org_id, user_id, role) values (v_org.id, v_uid, 'owner');
  perform public.seed_default_stages(v_org.id);
  return v_org;
end;
$$;
revoke execute on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
create or replace function public.create_invitation(p_org uuid, p_email text, p_role public.org_role default 'member')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_token text;
  v_email text := lower(btrim(p_email));
begin
  if not public.has_org_role(p_org, '{owner,admin}') then
    raise exception 'Only owners and admins can invite people' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'Invite people as admin or member, then make them an owner from the team list' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.organization_members m join public.profiles p on p.id = m.user_id
    where m.org_id = p_org and lower(p.email) = v_email
  ) then
    raise exception 'That person is already on the team' using errcode = 'P0001';
  end if;

  -- One open invitation per email: inviting again replaces the old link (the old link stops working).
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.organization_invitations (org_id, email, role, token_hash, invited_by)
  values (p_org, v_email, p_role, encode(sha256(v_token::bytea), 'hex'), v_uid)
  on conflict (org_id, lower(email)) where accepted_at is null
  do update set role = excluded.role,
                token_hash = excluded.token_hash,
                invited_by = excluded.invited_by,
                expires_at = now() + interval '7 days',
                created_at = now();
  return v_token;
end;
$$;
revoke execute on function public.create_invitation(uuid, text, public.org_role) from public, anon;
grant execute on function public.create_invitation(uuid, text, public.org_role) to authenticated;

-- What a signed-in person sees before accepting.
create or replace function public.get_invitation(p_token text)
returns table (org_name text, org_slug text, email text, role public.org_role, expires_at timestamptz, accepted boolean, email_matches boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name, o.slug, i.email, i.role, i.expires_at, i.accepted_at is not null,
         lower(i.email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  from public.organization_invitations i
  join public.organizations o on o.id = i.org_id
  where (select auth.uid()) is not null
    and char_length(p_token) = 64
    and i.token_hash = encode(sha256(p_token::bytea), 'hex');
$$;
revoke execute on function public.get_invitation(text) from public, anon;
grant execute on function public.get_invitation(text) to authenticated;

create or replace function public.accept_invitation(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  v_inv public.organization_invitations;
  v_slug text;
begin
  if v_uid is null then
    raise exception 'Sign in to accept this invitation' using errcode = '42501';
  end if;
  select * into v_inv from public.organization_invitations i
   where char_length(p_token) = 64 and i.token_hash = encode(sha256(p_token::bytea), 'hex')
   for update;
  if not found then
    raise exception 'This invitation link is not valid' using errcode = 'P0002';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'This invitation has already been used' using errcode = 'P0001';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'This invitation has expired. Ask for a new one.' using errcode = 'P0001';
  end if;
  if lower(v_inv.email) <> v_email then
    raise exception 'This invitation was sent to a different email address' using errcode = '42501';
  end if;

  insert into public.organization_members (org_id, user_id, role)
  values (v_inv.org_id, v_uid, v_inv.role)
  on conflict (org_id, user_id) do nothing;
  update public.organization_invitations set accepted_at = now(), accepted_by = v_uid where id = v_inv.id;
  select o.slug into v_slug from public.organizations o where o.id = v_inv.org_id;
  return v_slug;
end;
$$;
revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

-- ---------------------------------------------------------------------------
-- publish_form: snapshot the saved draft (fields + design) for the public form.
-- ---------------------------------------------------------------------------
create or replace function public.publish_form(p_form uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_form public.forms;
  v_version integer;
begin
  select * into v_form from public.forms f where f.id = p_form for update;
  if not found or not public.is_org_member(v_form.org_id) then
    raise exception 'Form not found' using errcode = 'P0002';
  end if;
  v_version := v_form.published_version + 1;
  update public.forms f
     set published_version = v_version,
         published_at = now(),
         published_config = jsonb_build_object(
           'version', v_version,
           'title', v_form.title,
           'event_date', v_form.event_date,
           'venue', v_form.venue,
           'intro', v_form.intro,
           'thanks', v_form.thanks,
           'submit_label', v_form.submit_label,
           'settings', v_form.settings,
           'design', v_form.design,
           'fields', coalesce((
             select jsonb_agg(jsonb_build_object(
               'id', ff.id, 'type', ff.type, 'label', ff.label, 'help', ff.help, 'placeholder', ff.placeholder,
               'required', ff.required, 'options', ff.options, 'config', ff.config) order by ff.position)
             from public.form_fields ff where ff.form_id = v_form.id), '[]'::jsonb))
   where f.id = v_form.id;
  return v_version;
end;
$$;
revoke execute on function public.publish_form(uuid) from public, anon;
grant execute on function public.publish_form(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Public reads (anonymous visitors never query tables directly)
-- ---------------------------------------------------------------------------
create or replace function public.get_public_form(p_org_slug text, p_form_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'form_id', f.id,
           'org_name', o.name,
           'org_slug', o.slug,
           'status', f.status,
           'config', case when f.status = 'live' then f.published_config else null end)
  from public.forms f
  join public.organizations o on o.id = f.org_id
  where o.slug = p_org_slug and f.slug = p_form_slug
    and f.status in ('live', 'closed') and f.published_config is not null;
$$;
revoke execute on function public.get_public_form(text, text) from public;
grant execute on function public.get_public_form(text, text) to anon, authenticated;

-- Customer tracking page: job status only. No customer details, notes, or staff names.
create or replace function public.get_job_tracking(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'number', j.number,
           'title', j.title,
           'summary', j.summary,
           'due_date', j.due_date,
           'org_name', o.name,
           'form_title', f.title,
           'design', f.published_config -> 'design',
           'current_stage_id', j.stage_id,
           'stages', (select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'position', s.position, 'is_final', s.is_final) order by s.position)
                        from public.workflow_stages s where s.org_id = j.org_id),
           'history', (select coalesce(jsonb_agg(jsonb_build_object('stage_id', e.to_stage_id, 'at', e.created_at) order by e.created_at), '[]'::jsonb)
                         from public.job_events e where e.job_id = j.id and e.type in ('created', 'stage_changed')))
  from public.jobs j
  join public.organizations o on o.id = j.org_id
  left join public.forms f on f.id = j.form_id
  where char_length(p_token) >= 32 and j.tracking_token = p_token;
$$;
revoke execute on function public.get_job_tracking(text) from public;
grant execute on function public.get_job_tracking(text) to anon, authenticated;
