-- QueuedToGo: form builder (Stage 5)
--   save_form_draft  saves a form's draft settings, design and fields in one transaction.
--                    SECURITY INVOKER, so the caller's row level security and column grants apply.

create or replace function public.save_form_draft(p_form uuid, p_data jsonb, p_fields jsonb)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_updated timestamptz;
begin
  if jsonb_typeof(p_data) is distinct from 'object' or jsonb_typeof(p_fields) is distinct from 'array' then
    raise exception 'Invalid form data' using errcode = '22023';
  end if;
  if jsonb_array_length(p_fields) > 200 then
    raise exception 'A form can have up to 200 blocks' using errcode = '22023';
  end if;

  update public.forms f
     set title        = p_data ->> 'title',
         slug         = p_data ->> 'slug',
         event_date   = nullif(p_data ->> 'event_date', '')::date,
         venue        = nullif(p_data ->> 'venue', ''),
         intro        = nullif(p_data ->> 'intro', ''),
         thanks       = nullif(p_data ->> 'thanks', ''),
         submit_label = p_data ->> 'submit_label',
         settings     = coalesce(p_data -> 'settings', '{}'::jsonb),
         design       = coalesce(p_data -> 'design', '{"v": 1}'::jsonb)
   where f.id = p_form
  returning f.org_id, f.updated_at into v_org, v_updated;
  if not found then
    raise exception 'Form not found' using errcode = 'P0002';
  end if;

  delete from public.form_fields ff
   where ff.form_id = p_form
     and ff.id not in (select (e ->> 'id')::uuid from jsonb_array_elements(p_fields) e);

  insert into public.form_fields as ff (id, org_id, form_id, position, type, label, help, placeholder, required, options, config)
  select (e ->> 'id')::uuid, v_org, p_form, (x.ord - 1)::int, e ->> 'type',
         coalesce(e ->> 'label', ''), coalesce(e ->> 'help', ''), coalesce(e ->> 'placeholder', ''),
         coalesce((e ->> 'required')::boolean, false),
         coalesce(e -> 'options', '[]'::jsonb), coalesce(e -> 'config', '{}'::jsonb)
    from jsonb_array_elements(p_fields) with ordinality as x(e, ord)
  on conflict (id) do update
     set position = excluded.position, type = excluded.type, label = excluded.label, help = excluded.help,
         placeholder = excluded.placeholder, required = excluded.required, options = excluded.options,
         config = excluded.config
   where ff.form_id = excluded.form_id;

  -- A field id that belongs to another form is never moved or overwritten.
  if (select count(*) from public.form_fields ff where ff.form_id = p_form) <> jsonb_array_length(p_fields) then
    raise exception 'Some blocks could not be saved' using errcode = '22023';
  end if;

  return v_updated;
end;
$$;
revoke execute on function public.save_form_draft(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_form_draft(uuid, jsonb, jsonb) to authenticated;

