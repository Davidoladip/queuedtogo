-- Stage 10, step 2: prices on order questions and a Tickets question.
-- Prices and ticket types live in each question's config (whole cents); the server prices every order again from
-- the published form. A form with prices or tickets can only be published once the business can take payments.

alter table public.form_fields drop constraint if exists form_fields_type_check;
alter table public.form_fields add constraint form_fields_type_check check (type in (
  'short', 'long', 'email', 'phone', 'number', 'choice', 'multi', 'dropdown', 'sizes', 'date',
  'upload', 'button', 'heading', 'text', 'divider', 'image', 'page', 'submit', 'rsvp', 'tickets'));

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
