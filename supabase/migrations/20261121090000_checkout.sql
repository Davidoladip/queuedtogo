-- Stage 10, steps 3 and 4: checkout and payment confirmation.
-- A buyer's answers are checked and priced by the server, then a pending paid order holds their tickets while they pay
-- on Stripe Checkout or a Square payment link, on the business's own account, with QueuedToGo's fee attached.
-- Only a confirmed payment (signed webhook, or the return page asking the provider) turns it into a real order:
-- the same customer, submission and production-board job as any other order, with its order number.

-- ---------------------------------------------------------------- paid orders
create table public.paid_orders (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  form_id          uuid not null,
  form_version     integer not null check (form_version >= 1),
  status           text not null default 'pending'
                     check (status in ('pending', 'paid', 'expired', 'canceled', 'refund_due', 'refunded', 'partly_refunded', 'review')),
  provider         text not null check (provider in ('stripe', 'square', 'none')),
  -- The seller's account the checkout was created on (never changed afterwards).
  account_id       text not null check (account_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  currency         text not null default 'usd' check (currency = 'usd'),
  subtotal_cents   integer not null check (subtotal_cents between 0 and 100000000),
  fee_cents        integer not null check (fee_cents >= 0 and fee_cents <= subtotal_cents),
  total_cents      integer not null check (total_cents between 0 and 100000000),
  fee_payer        text not null check (fee_payer in ('guest', 'business')),
  lines            jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) between 1 and 200),
  answers          jsonb not null check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) < 262144),
  customer         jsonb not null default '{}' check (jsonb_typeof(customer) = 'object'),
  consent          boolean not null default false,
  title            text not null check (char_length(title) between 1 and 200),
  summary          text check (summary is null or char_length(summary) <= 500),
  files            jsonb not null default '[]' check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) <= 10),
  source_ip_hash   text check (source_ip_hash is null or char_length(source_ip_hash) <= 128),
  user_agent       text check (user_agent is null or char_length(user_agent) <= 400),
  client_key       text check (client_key is null or client_key ~ '^[A-Za-z0-9_-]{16,80}$'),
  -- Stripe Checkout session id or Square payment link id, and where the buyer pays.
  checkout_id      text check (checkout_id is null or char_length(checkout_id) <= 200),
  checkout_url     text check (checkout_url is null or (checkout_url ~ '^https://' and char_length(checkout_url) <= 1000)),
  -- Stripe payment intent or Square order id.
  payment_ref      text check (payment_ref is null or char_length(payment_ref) <= 200),
  hold_expires_at  timestamptz not null,
  submission_id    uuid,
  paid_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (total_cents = subtotal_cents + case when fee_payer = 'guest' then fee_cents else 0 end),
  unique (id, org_id),
  foreign key (form_id, org_id) references public.forms (id, org_id) on delete cascade,
  foreign key (submission_id, org_id) references public.form_submissions (id, org_id) on delete set null (submission_id)
);
comment on table public.paid_orders is 'One row per checkout. Written by the server only; becomes a real order when the payment is confirmed.';
create index paid_orders_form_status_idx on public.paid_orders (form_id, status, hold_expires_at);
create index paid_orders_org_created_idx on public.paid_orders (org_id, created_at desc);
create index paid_orders_ip_idx on public.paid_orders (source_ip_hash, created_at desc) where source_ip_hash is not null;
create unique index paid_orders_provider_ref_idx on public.paid_orders (provider, payment_ref) where payment_ref is not null;
-- A double tap reuses the open checkout instead of starting a second one.
create unique index paid_orders_live_client_key_idx on public.paid_orders (form_id, client_key)
  where client_key is not null and status in ('pending', 'paid');
create trigger paid_orders_updated_at before update on public.paid_orders for each row execute function public.set_updated_at();

alter table public.paid_orders enable row level security;
create policy "Members can see their business's paid orders" on public.paid_orders
  for select to authenticated using ((select public.is_org_member(org_id)));
revoke insert, update, delete, truncate, references, trigger on public.paid_orders from anon, authenticated;
revoke select on public.paid_orders from anon;

-- ---------------------------------------------------------------- tickets taken and left
/** Tickets of one type sold or held on a form (held = a checkout still within its hold). */
create or replace function public.ticket_taken(p_form uuid, p_ticket text, p_except uuid default null)
 returns integer
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(sum((l ->> 'qty')::integer), 0)::integer
    from public.paid_orders o cross join lateral jsonb_array_elements(o.lines) l
   where o.form_id = p_form and o.id is distinct from p_except
     and (o.status = 'paid' or (o.status = 'pending' and o.hold_expires_at > now()))
     and l ->> 'ticket' = p_ticket;
$function$;
revoke all on function public.ticket_taken(uuid, text, uuid) from public, anon, authenticated;

/** The ticket types of a published form that have a limit: id, name and how many can be sold. */
create or replace function public.ticket_limits(p_config jsonb)
 returns table (ticket text, name text, qty integer)
 language sql
 immutable
 set search_path to ''
as $function$
  select t.tt ->> 'id', btrim(coalesce(ff -> 'options' ->> (t.i - 1)::integer, '')), least(greatest(floor((t.tt ->> 'qty')::numeric), 0), 1000000)::integer
    from jsonb_array_elements(case when jsonb_typeof(p_config -> 'fields') = 'array' then p_config -> 'fields' else '[]' end) ff
    cross join lateral jsonb_array_elements(case when ff ->> 'type' = 'tickets' and jsonb_typeof(ff #> '{config,tickets}') = 'array'
                                                 then ff #> '{config,tickets}' else '[]' end) with ordinality t(tt, i)
   where jsonb_typeof(t.tt -> 'qty') = 'number' and (t.tt ->> 'id') is not null;
$function$;
revoke all on function public.ticket_limits(jsonb) from public, anon, authenticated;

/** Tickets left per limited type on a form, for the public form ("12 left", "Sold out"). */
create or replace function public.tickets_left(p_form uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(jsonb_object_agg(l.ticket, greatest(l.qty - public.ticket_taken(p_form, l.ticket), 0)), '{}'::jsonb)
    from public.forms f cross join lateral public.ticket_limits(f.published_config) l
   where f.id = p_form;
$function$;
revoke all on function public.tickets_left(uuid) from public, anon, authenticated;

/** Raises if the tickets in `p_lines` don't fit what's left (not counting `p_except`, the order being checked). */
create or replace function public.check_ticket_room(p_form uuid, p_config jsonb, p_lines jsonb, p_except uuid)
 returns void
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  r record;
  v_want integer;
  v_left integer;
begin
  for r in select * from public.ticket_limits(p_config) loop
    select coalesce(sum((l ->> 'qty')::integer), 0) into v_want from jsonb_array_elements(p_lines) l where l ->> 'ticket' = r.ticket;
    continue when v_want = 0;
    v_left := greatest(r.qty - public.ticket_taken(p_form, r.ticket, p_except), 0);
    if v_want > v_left then
      if v_left = 0 then
        raise exception '% is sold out.', coalesce(nullif(r.name, ''), 'This ticket') using errcode = 'QTG31';
      end if;
      raise exception 'Only % % ticket% left.', v_left, coalesce(nullif(r.name, ''), 'of this'), case when v_left = 1 then '' else 's' end using errcode = 'QTG31';
    end if;
  end loop;
end;
$function$;
revoke all on function public.check_ticket_room(uuid, jsonb, jsonb, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- starting a checkout (server only)
create or replace function public.start_checkout(
  p_order uuid, p_form uuid, p_version integer, p_answers jsonb, p_customer jsonb, p_consent boolean, p_title text, p_summary text,
  p_files jsonb, p_ip_hash text, p_user_agent text, p_client_key text,
  p_lines jsonb, p_subtotal integer, p_fee integer, p_total integer, p_fee_payer text, p_hold_minutes integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_form public.forms;
  v_acct public.payment_accounts;
  v_existing public.paid_orders;
  v_recent integer;
  v_sum bigint := 0;
  l jsonb;
begin
  -- The form row is locked so two buyers racing for the last tickets are counted one after the other.
  select * into v_form from public.forms where id = p_form for update;
  if not found or v_form.status <> 'live' or v_form.published_config is null then
    raise exception 'This form is not taking orders' using errcode = 'QTG01';
  end if;
  if v_form.published_version <> p_version then
    raise exception 'This form was updated. Reload the page and try again.' using errcode = 'QTG02';
  end if;
  if coalesce(v_form.published_config #>> '{settings,mode}', 'order') = 'rsvp' then
    raise exception 'This form can''t take payments.' using errcode = 'QTG01';
  end if;

  if p_client_key is not null then
    select * into v_existing from public.paid_orders o
     where o.form_id = p_form and o.client_key = p_client_key and o.status in ('pending', 'paid');
    if found then
      if v_existing.status = 'paid' or v_existing.hold_expires_at > now() + interval '2 minutes' then
        return jsonb_build_object('order_id', v_existing.id, 'status', v_existing.status, 'checkout_url', v_existing.checkout_url, 'repeat', true);
      end if;
      update public.paid_orders set status = 'expired' where id = v_existing.id;
    end if;
  end if;

  if p_ip_hash is not null then
    select count(*) into v_recent from public.paid_orders where source_ip_hash = p_ip_hash and form_id = p_form and created_at > now() - interval '10 minutes';
    if v_recent >= 10 then
      raise exception 'Too many checkouts from this device. Wait a few minutes and try again.' using errcode = 'QTG03';
    end if;
  end if;
  select count(*) into v_recent from public.paid_orders where form_id = p_form and created_at > now() - interval '1 minute';
  if v_recent >= 120 then
    raise exception 'This form is very busy. Try again in a minute.' using errcode = 'QTG03';
  end if;

  if not public.payments_ready(v_form.org_id) then
    raise exception 'This business isn''t taking payments right now.' using errcode = 'QTG30';
  end if;
  select * into v_acct from public.payment_accounts where org_id = v_form.org_id;

  -- The amounts were worked out by the app from the published form; check they hang together.
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 200 then
    raise exception 'Invalid order' using errcode = '22023';
  end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(l -> 'qty') <> 'number' or jsonb_typeof(l -> 'unit') <> 'number' or jsonb_typeof(l -> 'amount') <> 'number'
       or (l ->> 'qty')::numeric not between 1 and 9999 or (l ->> 'unit')::numeric not between 0 and 1000000
       or (l ->> 'qty')::numeric <> trunc((l ->> 'qty')::numeric) or (l ->> 'unit')::numeric <> trunc((l ->> 'unit')::numeric)
       or (l ->> 'amount')::numeric <> (l ->> 'unit')::numeric * (l ->> 'qty')::numeric then
      raise exception 'Invalid order line' using errcode = '22023';
    end if;
    v_sum := v_sum + (l ->> 'amount')::bigint;
  end loop;
  if v_sum <> p_subtotal or p_fee < 0 or p_fee > p_subtotal
     or p_total <> p_subtotal + (case when p_fee_payer = 'guest' then p_fee else 0 end) then
    raise exception 'Invalid order total' using errcode = '22023';
  end if;

  perform public.check_ticket_room(p_form, v_form.published_config, p_lines, null);

  insert into public.paid_orders (id, org_id, form_id, form_version, provider, account_id, subtotal_cents, fee_cents, total_cents, fee_payer,
                                  lines, answers, customer, consent, title, summary, files, source_ip_hash, user_agent, client_key, hold_expires_at)
  values (p_order, v_form.org_id, p_form, p_version, case when p_total = 0 then 'none' else v_acct.provider end, v_acct.account_id,
          p_subtotal, p_fee, p_total, p_fee_payer, p_lines, p_answers, coalesce(p_customer, '{}'), coalesce(p_consent, false),
          left(coalesce(nullif(btrim(p_title), ''), v_form.title), 200), left(nullif(btrim(p_summary), ''), 500), coalesce(p_files, '[]'),
          left(p_ip_hash, 128), left(p_user_agent, 400), p_client_key,
          now() + make_interval(mins => greatest(5, least(coalesce(p_hold_minutes, 30), 60))));
  return jsonb_build_object('order_id', p_order, 'status', 'pending', 'provider', case when p_total = 0 then 'none' else v_acct.provider end,
                            'account_id', v_acct.account_id, 'location_id', v_acct.location_id, 'repeat', false,
                            'hold_expires_at', (select hold_expires_at from public.paid_orders where id = p_order));
end;
$function$;
revoke all on function public.start_checkout(uuid, uuid, integer, jsonb, jsonb, boolean, text, text, jsonb, text, text, text, jsonb, integer, integer, integer, text, integer) from public, anon, authenticated;
grant execute on function public.start_checkout(uuid, uuid, integer, jsonb, jsonb, boolean, text, text, jsonb, text, text, text, jsonb, integer, integer, integer, text, integer) to service_role;

-- ---------------------------------------------------------------- confirming a payment (server only)
-- Paid orders were checked when the checkout started; once the money is taken the order always goes through
-- (no monthly reply limit, even if the form has since closed or changed).
create or replace function public.form_submissions_reply_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pass public.event_passes;
  v_max integer;
begin
  if not public.billing_enforced() then return new; end if;
  if current_setting('qtg.paid_order', true) = 'on' then return new; end if;
  v_pass := public.form_pass(new.form_id);
  if v_pass.id is not null then
    if v_pass.guest_limit is not null
       and (select count(*) from public.form_submissions s where s.form_id = new.form_id and s.created_at >= v_pass.paid_at) >= v_pass.guest_limit then
      raise exception 'This invitation has reached its limit of % replies. Please contact the host.', v_pass.guest_limit using errcode = 'QTG20';
    end if;
    return new;
  end if;
  v_max := (public.plan_limits(public.effective_plan(new.org_id)) ->> 'monthly_replies')::integer;
  if v_max is not null and public.org_month_replies(new.org_id) >= v_max then
    raise exception 'This form can''t take more replies this month. Please contact the business.' using errcode = 'QTG20';
  end if;
  return new;
end;
$$;
revoke execute on function public.form_submissions_reply_limit() from public, anon, authenticated;

/**
 * Turns a pending paid order into a real order once the provider confirms the payment. Idempotent: a repeated
 * confirmation returns the same order. The amount, currency and seller account must match the checkout.
 * Returns status 'paid' (with the order number), 'refund' (the hold had lapsed and the tickets were sold in the
 * meantime: the payment must be refunded) or the order's current status when it can't be confirmed.
 */
create or replace function public.confirm_paid_order(p_order uuid, p_amount integer, p_currency text, p_account text, p_payment_ref text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  o public.paid_orders;
  v_form public.forms;
  v_job public.jobs;
  v_customer uuid;
  v_stage uuid;
  v_email text;
  v_phone text;
  v_name text;
  v_channel public.notify_channel;
  f jsonb;
begin
  select * into o from public.paid_orders where id = p_order for update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  if o.status = 'paid' then
    select * into v_job from public.jobs where submission_id = o.submission_id;
    return jsonb_build_object('status', 'paid', 'repeat', true, 'number', v_job.number, 'tracking_token', v_job.tracking_token, 'org_id', o.org_id);
  end if;
  if o.status not in ('pending', 'expired') then
    return jsonb_build_object('status', o.status, 'org_id', o.org_id);
  end if;
  if p_amount is distinct from o.total_cents or lower(coalesce(p_currency, '')) <> o.currency or p_account is distinct from o.account_id then
    update public.paid_orders set status = 'review', payment_ref = coalesce(payment_ref, left(p_payment_ref, 200)) where id = o.id;
    return jsonb_build_object('status', 'review', 'org_id', o.org_id);
  end if;

  -- Lock the form like a new checkout would, then make sure tickets are still there if the hold had lapsed.
  select * into v_form from public.forms where id = o.form_id for update;
  if o.hold_expires_at <= now() then
    begin
      perform public.check_ticket_room(o.form_id, v_form.published_config, o.lines, o.id);
    exception when sqlstate 'QTG31' then
      update public.paid_orders set status = 'refund_due', payment_ref = coalesce(payment_ref, left(p_payment_ref, 200)) where id = o.id;
      return jsonb_build_object('status', 'refund', 'org_id', o.org_id);
    end;
  end if;

  perform set_config('qtg.paid_order', 'on', true);
  v_email := nullif(lower(btrim(o.customer ->> 'email')), '');
  v_phone := nullif(btrim(o.customer ->> 'phone'), '');
  v_name := nullif(btrim(o.customer ->> 'name'), '');
  if v_email is not null or v_phone is not null or v_name is not null then
    v_channel := case when (o.customer ->> 'channel') in ('sms', 'whatsapp', 'email') then (o.customer ->> 'channel')::public.notify_channel end;
    if v_email is not null then
      select id into v_customer from public.customers where org_id = o.org_id and lower(email) = v_email;
    end if;
    if v_customer is null and v_phone is not null then
      select id into v_customer from public.customers where org_id = o.org_id and phone = v_phone order by created_at limit 1;
    end if;
    if v_customer is null then
      insert into public.customers (org_id, name, email, phone, preferred_channel, consent_updates, consent_at)
      values (o.org_id, v_name, v_email, v_phone, v_channel, o.consent, case when o.consent then now() end)
      returning id into v_customer;
    else
      update public.customers c
         set name = coalesce(v_name, c.name), email = coalesce(c.email, v_email), phone = coalesce(v_phone, c.phone),
             preferred_channel = coalesce(v_channel, c.preferred_channel),
             consent_updates = case when o.consent then true else c.consent_updates end,
             consent_at = case when o.consent then now() else c.consent_at end
       where c.id = v_customer;
    end if;
  end if;

  insert into public.form_submissions (id, org_id, form_id, form_version, answers, customer_id, consent, source_ip_hash, user_agent, client_key)
  values (o.id, o.org_id, o.form_id, o.form_version, o.answers, v_customer, o.consent, o.source_ip_hash, o.user_agent, o.client_key);
  for f in select * from jsonb_array_elements(o.files) loop
    insert into public.files (org_id, bucket, path, kind, mime_type, size_bytes, original_name, form_id, submission_id)
    values (o.org_id, 'submission-uploads', f ->> 'path', 'submission_upload', f ->> 'mime', (f ->> 'size')::integer, left(f ->> 'name', 255), o.form_id, o.id);
  end loop;
  select id into v_stage from public.workflow_stages where org_id = o.org_id order by position limit 1;
  if v_stage is null then
    raise exception 'This business has no production stages' using errcode = 'QTG01';
  end if;
  insert into public.jobs (org_id, stage_id, form_id, submission_id, customer_id, title, summary)
  values (o.org_id, v_stage, o.form_id, o.id, v_customer, o.title, o.summary)
  returning * into v_job;

  update public.paid_orders
     set status = 'paid', paid_at = now(), submission_id = o.id, payment_ref = coalesce(left(p_payment_ref, 200), payment_ref)
   where id = o.id;
  return jsonb_build_object('status', 'paid', 'repeat', false, 'number', v_job.number, 'tracking_token', v_job.tracking_token, 'org_id', o.org_id);
end;
$function$;
revoke all on function public.confirm_paid_order(uuid, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.confirm_paid_order(uuid, integer, text, text, text) to service_role;

-- ---------------------------------------------------------------- publishing: paid forms are order forms
create or replace function public.publish_form(p_form uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_form public.forms;
  v_version integer;
  v_bad text;
  v_paid boolean;
begin
  select * into v_form from public.forms f where f.id = p_form for update;
  if not found or not public.is_org_member(v_form.org_id) then
    raise exception 'Form not found' using errcode = 'P0002';
  end if;
  -- Forms are for orders and RSVPs; questions asking for secrets are how forms get used for phishing.
  select ff.label into v_bad from public.form_fields ff
   where ff.form_id = v_form.id and (public.sensitive_field_label(ff.label) or public.sensitive_field_label(ff.placeholder))
   order by ff.position limit 1;
  if v_bad is not null then
    raise exception 'Forms can''t ask for passwords, card numbers, bank details or social security numbers. Change or remove the question "%".', left(v_bad, 80)
      using errcode = 'P0001';
  end if;
  -- Forms with prices or tickets take payments: only once the business can sell (payments switched on for it by
  -- QueuedToGo and its own Stripe or Square account approved). Read from the raw saved JSON, so it is at least as
  -- strict as the app: any ticket question, or any option price above zero, counts.
  select exists (
    select 1 from public.form_fields ff
     where ff.form_id = v_form.id
       and (ff.type = 'tickets'
            or (ff.type in ('choice', 'multi', 'dropdown', 'sizes')
                -- A JSON path never errors on odd shapes (prices that aren't a list, or aren't numbers).
                and jsonb_path_exists(ff.config, '$.prices[*] ? (@.type() == "number" && @ > 0)')))) into v_paid;
  if v_paid and coalesce(v_form.settings #>> '{mode}', 'order') = 'rsvp' then
    raise exception 'RSVP forms can''t take payments. Make this an order form (Settings → Form type) to sell tickets or items.'
      using errcode = 'P0001';
  end if;
  if v_paid and not public.payments_ready(v_form.org_id) then
    raise exception 'This form has prices or tickets. Connect your Stripe or Square account on the Get paid page (and wait for it to be approved) before publishing it.'
      using errcode = 'P0001';
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
$function$;
revoke execute on function public.publish_form(uuid) from public, anon;
grant execute on function public.publish_form(uuid) to authenticated;

-- ---------------------------------------------------------------- public form: tickets left
create or replace function public.get_public_form(p_org_slug text, p_form_slug text)
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
  select jsonb_build_object(
           'form_id', f.id,
           'org_name', o.name,
           'org_slug', o.slug,
           'timezone', o.timezone,
           'status', f.status,
           'version', case when f.status = 'live' then f.published_version end,
           'config', case when f.status = 'live' then f.published_config else null end,
           'free_plan', public.effective_plan(o.id) = 'free',
           -- Paid forms: tickets left per ticket type that has a limit (held tickets count as taken).
           'tickets_left', case when f.status = 'live' then public.tickets_left(f.id) end,
           'rsvp', case when (f.published_config #>> '{settings,mode}') = 'rsvp' then jsonb_build_object(
             'closed', public.rsvp_deadline_passed(f.published_config, o.timezone),
             'full', public.rsvp_capacity(f.published_config) is not null
                     and (f.published_config #>> '{settings,rsvp,waitlist}') is distinct from 'true'
                     and public.rsvp_headcount(f.id) >= public.rsvp_capacity(f.published_config)) end)
  from public.forms f
  join public.organizations o on o.id = f.org_id
  where o.slug = p_org_slug and f.slug = p_form_slug
    and f.status in ('live', 'closed') and f.published_config is not null;
$function$;
