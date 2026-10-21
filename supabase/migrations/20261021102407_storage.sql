-- QueuedToGo: storage buckets and policies

-- ---------------------------------------------------------------------------
-- Storage: two buckets. Paths always start with the business id: {org_id}/...
--   form-assets         public, artwork shown on published forms
--   submission-uploads  private, customer files; read through short-lived signed URLs
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('form-assets', 'form-assets', true, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']),
  ('submission-uploads', 'submission-uploads', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create or replace function public.storage_org_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end;
$$;
grant execute on function public.storage_org_id(text) to authenticated;

create policy "Members can upload form assets to their business folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'form-assets' and (select public.is_org_member(public.storage_org_id(name))));
create policy "Members can replace form assets in their business folder" on storage.objects
  for update to authenticated
  using (bucket_id = 'form-assets' and (select public.is_org_member(public.storage_org_id(name))))
  with check (bucket_id = 'form-assets' and (select public.is_org_member(public.storage_org_id(name))));
create policy "Members can delete form assets in their business folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'form-assets' and (select public.is_org_member(public.storage_org_id(name))));
create policy "Members can list form assets in their business folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'form-assets' and (select public.is_org_member(public.storage_org_id(name))));

-- Customer uploads arrive through the server (service role). Members can read them to create signed URLs.
create policy "Members can read customer uploads for their business" on storage.objects
  for select to authenticated
  using (bucket_id = 'submission-uploads' and (select public.is_org_member(public.storage_org_id(name))));
create policy "Owners and admins can delete customer uploads" on storage.objects
  for delete to authenticated
  using (bucket_id = 'submission-uploads' and (select public.has_org_role(public.storage_org_id(name), '{owner,admin}')));
