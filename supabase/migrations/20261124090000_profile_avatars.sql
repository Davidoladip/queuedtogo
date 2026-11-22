-- Profile pictures: a photo or business logo shown in the account avatar instead of initials.
-- Files live in a public "avatars" bucket at {user_id}/{random}.{ext} (unguessable names, small images only).

alter table public.profiles
  add column avatar_path text
  check (
    avatar_path is null
    or (avatar_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|png|jpg)$'
        and split_part(avatar_path, '/', 1) = id::text)
  );
comment on column public.profiles.avatar_path is 'Profile picture in the avatars bucket; always inside the owner''s own folder.';
grant update (avatar_path) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Each person may write only inside their own folder. Reading needs no policy (public bucket, unguessable names).
create policy "People can upload their own profile picture" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy "People can replace their own profile picture" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy "People can delete their own profile picture" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy "People can see their own profile picture files" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = (select auth.uid())::text);
