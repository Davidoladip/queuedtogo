-- Tenant-isolation, role and audit tests. Run with scripts/test-db.sh.
-- Each check raises an exception on failure, so the run stops at the first broken rule.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

create table tests.ids (k text primary key, v uuid);
grant select, insert on tests.ids to anon, authenticated, service_role;
create table tests.vals (k text primary key, v text);
grant select, insert, update on tests.vals to anon, authenticated, service_role;
create table tests.passed (n serial, label text);
grant insert, select on tests.passed to anon, authenticated, service_role;
grant usage on sequence tests.passed_n_seq to anon, authenticated, service_role;

create function tests.id(k text) returns uuid language sql stable as $$ select v from tests.ids where ids.k = id.k $$;
create function tests.val(k text) returns text language sql stable as $$ select v from tests.vals where vals.k = val.k $$;
create function tests.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAILED: %', label; end if;
  insert into tests.passed (label) values (label);
end $$;
create function tests.fails(stmt text, label text) returns void language plpgsql as $$
declare errored boolean := false; msg text;
begin
  begin execute stmt; exception when others then errored := true; msg := sqlerrm; end;
  if not errored then raise exception 'FAILED (no error): % -- %', label, stmt; end if;
  insert into tests.passed (label) values (label || '  [' || left(msg, 70) || ']');
end $$;
create function tests.affects(stmt text, expected int, label text) returns void language plpgsql as $$
declare n int;
begin
  execute stmt; get diagnostics n = row_count;
  if n <> expected then raise exception 'FAILED: % (affected %, expected %)', label, n, expected; end if;
  insert into tests.passed (label) values (label);
end $$;
create function tests.login(who text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', tests.id(who), 'email', who || '@example.com', 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;
create function tests.anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', false);
  execute 'set role anon';
end $$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ---------------------------------------------------------------- users
insert into auth.users (id, email, raw_user_meta_data) values
  (gen_random_uuid(), 'alice@example.com', '{"full_name":"Alice Owner"}'),
  (gen_random_uuid(), 'bob@example.com',   '{"full_name":"Bob Other"}'),
  (gen_random_uuid(), 'carol@example.com', '{"full_name":"Carol Admin"}'),
  (gen_random_uuid(), 'dan@example.com',   '{"full_name":"Dan Member"}');
insert into tests.ids select split_part(email, '@', 1), id from auth.users;
select tests.ok((select count(*) from public.profiles) = 4, 'profiles are created automatically for new users');
select tests.ok((select full_name from public.profiles where id = tests.id('alice')) = 'Alice Owner', 'profile copies the full name');

-- ---------------------------------------------------------------- businesses
select tests.anon();
select tests.fails($$select public.create_organization('Sneaky', 'sneaky')$$, 'anonymous visitors cannot create a business');
reset role;

select tests.login('alice');
insert into tests.ids select 'orgA', (public.create_organization('Threadtogo', 'threadtogo')).id;
select tests.ok((select count(*) from public.workflow_stages where org_id = tests.id('orgA')) = 6, 'a new business gets the 6 default stages');
select tests.ok((select role from public.organization_members where org_id = tests.id('orgA') and user_id = tests.id('alice')) = 'owner', 'the creator becomes owner');
select tests.fails($$select public.create_organization('Copycat', 'threadtogo')$$, 'business URLs are unique');
select tests.fails($$select public.create_organization('Bad', 'Bad Slug!')$$, 'business URLs are validated');
select tests.fails($$insert into public.organizations (name, slug) values ('Direct', 'direct-insert')$$, 'businesses cannot be inserted directly');
select tests.fails($$update public.organizations set next_job_number = 1 where id = tests.id('orgA')$$, 'order counter cannot be edited from the app');
select tests.affects($$update public.organizations set name = 'Threadtogo Ltd' where id = tests.id('orgA')$$, 1, 'owner can rename the business');
reset role;

select tests.login('bob');
insert into tests.ids select 'orgB', (public.create_organization('Embroitogo', 'embroitogo')).id;
select tests.ok((select count(*) from public.organizations) = 1, 'bob sees only his own business');
select tests.ok((select count(*) from public.workflow_stages) = 6, 'bob sees only his own stages');
select tests.ok((select count(*) from public.organization_members) = 1, 'bob sees only his own team');
select tests.ok((select count(*) from public.profiles) = 1, 'bob sees only his own profile');
select tests.affects($$update public.organizations set name = 'Hacked' where id = tests.id('orgA')$$, 0, 'bob cannot rename another business');
select tests.affects($$delete from public.organizations where id = tests.id('orgA')$$, 0, 'bob cannot delete another business');
select tests.fails($$insert into public.organization_members (org_id, user_id, role) values (tests.id('orgA'), tests.id('bob'), 'owner')$$, 'bob cannot add himself to another business');
with x as (insert into public.forms (org_id, title, slug) values (tests.id('orgB'), 'Bob form', 'bob-form') returning id) insert into tests.ids select 'formB', id from x;
reset role;

-- ---------------------------------------------------------------- forms and fields
select tests.login('alice');
with x as (insert into public.forms (org_id, title, slug, design) values (tests.id('orgA'), 'Food Fest', 'food-fest', '{"v":1,"theme":{"accent":"#E8633A"}}') returning id) insert into tests.ids select 'formA', id from x;
select tests.ok((select created_by from public.forms where id = tests.id('formA')) = tests.id('alice'), 'form records who created it');
select tests.fails($$insert into public.forms (org_id, title, slug) values (tests.id('orgB'), 'Planted', 'planted')$$, 'alice cannot create a form in another business');
select tests.ok((select count(*) from public.forms where id = tests.id('formB')) = 0, 'alice cannot see another business''s form');
select tests.affects($$update public.forms set title = 'Mine now' where id = tests.id('formB')$$, 0, 'alice cannot edit another business''s form');
select tests.fails($$insert into public.form_fields (org_id, form_id, position, type, label) values (tests.id('orgA'), tests.id('formB'), 0, 'short', 'x')$$, 'a field cannot point at another business''s form (composite key)');
insert into public.form_fields (org_id, form_id, position, type, label, required) values
  (tests.id('orgA'), tests.id('formA'), 0, 'short', 'Your name', true),
  (tests.id('orgA'), tests.id('formA'), 1, 'submit', '', false);
select tests.fails($$insert into public.form_fields (org_id, form_id, position, type) values (tests.id('orgA'), tests.id('formA'), 2, 'submit')$$, 'a form has only one submit block');
select tests.fails($$insert into public.form_fields (org_id, form_id, position, type) values (tests.id('orgA'), tests.id('formA'), 2, 'script')$$, 'unknown block types are rejected');
select tests.fails($$update public.forms set status = 'live' where id = tests.id('formA')$$, 'a form cannot go live before it is published');
select tests.fails($$update public.forms set published_config = '{}' where id = tests.id('formA')$$, 'the published snapshot cannot be written directly');
select tests.fails($$update public.forms set org_id = tests.id('orgB') where id = tests.id('formA')$$, 'a form cannot be moved to another business');
select tests.ok(public.publish_form(tests.id('formA')) = 1, 'publishing creates version 1');
select tests.ok((select jsonb_array_length(published_config -> 'fields') from public.forms where id = tests.id('formA')) = 2, 'the snapshot holds the saved fields');
update public.forms set status = 'live' where id = tests.id('formA');
update public.form_fields set label = 'Draft change' where form_id = tests.id('formA') and position = 0;
reset role;

select tests.login('bob');
select tests.fails($$select public.publish_form(tests.id('formA'))$$, 'bob cannot publish another business''s form');
reset role;

-- ---------------------------------------------------------------- public reads
select tests.anon();
select tests.ok((select count(*) from public.forms) = 0, 'anonymous visitors cannot read the forms table');
select tests.ok((select count(*) from public.organizations) = 0, 'anonymous visitors cannot read businesses');
select tests.ok((public.get_public_form('threadtogo', 'food-fest') -> 'config' -> 'fields' -> 0 ->> 'label') = 'Your name', 'public form renders the published snapshot, not the draft');
select tests.ok(public.get_public_form('embroitogo', 'bob-form') is null, 'draft forms are not public');
select tests.ok(public.get_public_form('threadtogo', 'nope') is null, 'unknown forms return nothing');
reset role;

-- ---------------------------------------------------------------- invitations and roles
select tests.login('alice');
insert into tests.vals values ('invite', public.create_invitation(tests.id('orgA'), 'Carol@Example.com', 'admin'));
insert into tests.vals values ('invite_dan', public.create_invitation(tests.id('orgA'), 'dan@example.com', 'member'));
select tests.fails($$select public.create_invitation(tests.id('orgA'), 'x@example.com', 'owner')$$, 'nobody can be invited straight in as owner');
select tests.ok((select count(*) from public.organization_invitations where org_id = tests.id('orgA')) = 2, 'owner sees open invitations');
select tests.fails($$select token_hash from public.organization_invitations$$, 'invitation token hashes are not readable');
insert into tests.vals values ('invite_old', public.create_invitation(tests.id('orgA'), 'erin@example.com', 'member'));
insert into tests.vals values ('invite_new', public.create_invitation(tests.id('orgA'), 'erin@example.com', 'admin'));
select tests.ok((select count(*) from public.organization_invitations where email = 'erin@example.com') = 1 and (select role from public.organization_invitations where email = 'erin@example.com') = 'admin', 'inviting the same email again replaces the open invitation');
select tests.ok((select count(*) from public.get_invitation(tests.val('invite_old'))) = 0 and (select count(*) from public.get_invitation(tests.val('invite_new'))) = 1, 'the replaced invitation link stops working');
reset role;

select tests.login('bob');
select tests.fails($$select public.create_invitation(tests.id('orgA'), 'bob2@example.com', 'member')$$, 'outsiders cannot invite people');
select tests.fails($$select public.accept_invitation(tests.val('invite'))$$, 'an invitation only works for the invited email');
reset role;

select tests.login('carol');
select tests.ok((select org_name from public.get_invitation(tests.val('invite'))) = 'Threadtogo Ltd', 'invitee can preview the business name');
select tests.ok(public.accept_invitation(tests.val('invite')) = 'threadtogo', 'carol accepts and joins');
select tests.fails($$select public.accept_invitation(tests.val('invite'))$$, 'an invitation can be used only once');
select tests.ok((select role from public.organization_members where org_id = tests.id('orgA') and user_id = tests.id('carol')) = 'admin', 'carol joined with the invited role');
select tests.ok((select count(*) from public.profiles) = 2, 'carol can now see her teammate''s profile');
select tests.fails($$update public.organization_members set role = 'owner' where org_id = tests.id('orgA') and user_id = tests.id('carol')$$, 'an admin cannot make herself owner');
select tests.fails($$delete from public.organization_members where org_id = tests.id('orgA') and user_id = tests.id('alice')$$, 'an admin cannot remove an owner');
reset role;

select tests.login('dan');
select public.accept_invitation(tests.val('invite_dan'));
select tests.affects($$update public.organization_members set role = 'admin' where org_id = tests.id('orgA') and user_id = tests.id('dan')$$, 0, 'a member cannot promote himself');
select tests.affects($$delete from public.workflow_stages where org_id = tests.id('orgA')$$, 0, 'a member cannot delete stages');
select tests.ok((select count(*) from public.organization_invitations) = 0, 'members cannot see invitations');
reset role;

select tests.login('alice');
select tests.fails($$delete from public.organization_members where org_id = tests.id('orgA') and user_id = tests.id('alice')$$, 'the last owner cannot leave');
select tests.fails($$update public.organization_members set role = 'member' where org_id = tests.id('orgA') and user_id = tests.id('alice')$$, 'the last owner cannot demote herself');
select tests.affects($$update public.organization_members set role = 'owner' where org_id = tests.id('orgA') and user_id = tests.id('carol')$$, 1, 'an owner can make an admin an owner');
select tests.affects($$update public.organization_members set role = 'admin' where org_id = tests.id('orgA') and user_id = tests.id('dan')$$, 1, 'an owner can promote a member to admin');
reset role;
select tests.login('dan');
select tests.fails($$delete from public.organization_members where org_id = tests.id('orgA') and user_id = tests.id('carol')$$, 'an admin cannot remove an owner, even when other owners remain');
reset role;

-- ---------------------------------------------------------------- customers, jobs and audit history
select tests.login('alice');
with x as (insert into public.customers (org_id, name, phone, email, preferred_channel, consent_updates) values (tests.id('orgA'), 'Lena Ortiz', '+15555550142', 'lena@example.com', 'sms', true) returning id) insert into tests.ids select 'custA', id from x;
select tests.fails($$insert into public.customers (org_id, name, phone) values (tests.id('orgA'), 'Bad phone', '555-0142')$$, 'phone numbers must be E.164 (+1...)');
insert into tests.ids select 'stage0', id from public.workflow_stages where org_id = tests.id('orgA') and position = 0;
insert into tests.ids select 'stage2', id from public.workflow_stages where org_id = tests.id('orgA') and position = 2;
insert into tests.ids select 'stageB', id from public.workflow_stages where org_id = tests.id('orgB') and position = 0;
reset role;
-- (stageB was invisible to alice, so fetch it as the database owner)
insert into tests.ids select 'stageB2', id from public.workflow_stages where org_id = tests.id('orgB') and position = 0;
select tests.login('alice');
with x as (insert into public.jobs (org_id, stage_id, form_id, customer_id, title) values (tests.id('orgA'), tests.id('stage0'), tests.id('formA'), tests.id('custA'), '1 × Apron') returning id) insert into tests.ids select 'jobA', id from x;
select tests.ok((select number from public.jobs where id = tests.id('jobA')) = 1001, 'jobs get per-business order numbers starting at 1001');
select tests.ok((select char_length(tracking_token) from public.jobs where id = tests.id('jobA')) = 64, 'jobs get a long random tracking token');
select tests.fails($$insert into public.jobs (org_id, stage_id, title, tracking_token) values (tests.id('orgA'), tests.id('stage0'), 'x', 'chosen-token-chosen-token-chosen-token')$$, 'tracking tokens cannot be chosen by the app');
select tests.fails($$insert into public.jobs (org_id, stage_id, title) values (tests.id('orgA'), tests.id('stageB2'), 'Wrong stage')$$, 'a job cannot use another business''s stage');
select tests.fails($$update public.jobs set assignee_id = tests.id('bob') where id = tests.id('jobA')$$, 'jobs can only be assigned to team members');
update public.jobs set stage_id = tests.id('stage2'), assignee_id = tests.id('dan'), due_date = current_date + 3 where id = tests.id('jobA');
select tests.ok((select count(*) from public.job_events where job_id = tests.id('jobA')) = 4, 'job changes are written to the audit history (created, stage, assignee, due date)');
select tests.ok((select actor_id from public.job_events where job_id = tests.id('jobA') and type = 'stage_changed') = tests.id('alice'), 'the audit history records who made the change');
insert into public.job_events (org_id, job_id, actor_id, type, body) values (tests.id('orgA'), tests.id('jobA'), tests.id('alice'), 'note', 'Customer wants gold thread');
select tests.fails($$insert into public.job_events (org_id, job_id, actor_id, type) values (tests.id('orgA'), tests.id('jobA'), tests.id('alice'), 'stage_changed')$$, 'people cannot fake audit events');
select tests.fails($$insert into public.job_events (org_id, job_id, actor_id, type, body) values (tests.id('orgA'), tests.id('jobA'), tests.id('carol'), 'note', 'x')$$, 'notes cannot be written in someone else''s name');
select tests.fails($$update public.job_events set body = 'edited' where job_id = tests.id('jobA')$$, 'audit history cannot be edited');
select tests.fails($$delete from public.job_events where job_id = tests.id('jobA')$$, 'audit history cannot be deleted');
reset role;

select tests.login('bob');
select tests.ok((select count(*) from public.jobs) = 0, 'bob cannot see another business''s jobs');
select tests.ok((select count(*) from public.customers) = 0, 'bob cannot see another business''s customers');
select tests.ok((select count(*) from public.job_events) = 0, 'bob cannot see another business''s job history');
select tests.affects($$update public.jobs set title = 'x' where id = tests.id('jobA')$$, 0, 'bob cannot edit another business''s job');
reset role;

select tests.anon();
select tests.ok((select count(*) from public.jobs) = 0, 'anonymous visitors cannot read jobs');
insert into tests.vals select 'track', public.get_job_tracking((select tracking_token from public.jobs limit 1))::text;
reset role;
insert into tests.vals select 'token', tracking_token from public.jobs where id = tests.id('jobA');
select tests.anon();
update tests.vals set v = public.get_job_tracking(tests.val('token'))::text where k = 'track';
select tests.ok((tests.val('track')::jsonb ->> 'number')::int = 1001, 'tracking link shows the order');
select tests.ok(tests.val('track') not like '%Lena%' and tests.val('track') not like '%gold thread%' and tests.val('track') not like '%5555550142%', 'tracking shows no customer details or internal notes');
select tests.ok(jsonb_array_length(tests.val('track')::jsonb -> 'stages') = 6, 'tracking shows the stage list');
select tests.ok(public.get_job_tracking('short') is null, 'short tracking tokens are rejected');
reset role;

-- ---------------------------------------------------------------- submissions are server-only
select tests.login('alice');
select tests.fails($$insert into public.form_submissions (org_id, form_id, form_version, answers) values (tests.id('orgA'), tests.id('formA'), 1, '{}')$$, 'browsers cannot write submissions directly');
reset role;
select tests.anon();
select tests.fails($$insert into public.form_submissions (org_id, form_id, form_version, answers) values (tests.id('orgA'), tests.id('formA'), 1, '{}')$$, 'anonymous visitors cannot write submissions directly');
reset role;
set role service_role;
insert into public.form_submissions (org_id, form_id, form_version, answers, customer_id) values (tests.id('orgA'), tests.id('formA'), 1, '{"name":"Lena"}', tests.id('custA'));
reset role;
select tests.login('carol');
select tests.ok((select count(*) from public.form_submissions) = 1, 'team members can read submissions');
reset role;

-- ---------------------------------------------------------------- storage
select tests.login('alice');
select tests.affects(format($$insert into storage.objects (bucket_id, name) values ('form-assets', '%s/forms/banner.png')$$, tests.id('orgA')), 1, 'members can upload artwork to their business folder');
select tests.fails(format($$insert into storage.objects (bucket_id, name) values ('form-assets', '%s/forms/planted.png')$$, tests.id('orgB')), 'members cannot upload into another business''s folder');
select tests.fails($$insert into storage.objects (bucket_id, name) values ('form-assets', 'not-a-uuid/x.png')$$, 'uploads outside a business folder are refused');
select tests.fails(format($$insert into storage.objects (bucket_id, name) values ('submission-uploads', '%s/x.pdf')$$, tests.id('orgA')), 'customer uploads cannot be written from the browser');
select tests.fails(format($$insert into public.files (org_id, bucket, path, kind, mime_type, size_bytes, uploaded_by) values (tests.id('orgA'), 'form-assets', '%s/a.exe', 'artwork', 'application/x-msdownload', 10, tests.id('alice'))$$, tests.id('orgA')), 'file types outside the allowed list are rejected');
select tests.fails(format($$insert into public.files (org_id, bucket, path, kind, mime_type, size_bytes, uploaded_by) values (tests.id('orgA'), 'form-assets', '%s/big.png', 'artwork', 'image/png', 20000000, tests.id('alice'))$$, tests.id('orgA')), 'files over 10 MB are rejected');
select tests.fails(format($$insert into public.files (org_id, bucket, path, kind, mime_type, size_bytes, uploaded_by) values (tests.id('orgA'), 'form-assets', '%s/x.png', 'artwork', 'image/png', 10, tests.id('alice'))$$, tests.id('orgB')), 'file records must live in their business folder');
reset role;
select tests.login('bob');
select tests.ok((select count(*) from storage.objects) = 0, 'bob cannot list another business''s files');
reset role;

-- ---------------------------------------------------------------- saving drafts (form builder)
insert into tests.ids values ('fld1', gen_random_uuid()), ('fld2', gen_random_uuid()), ('fldSub', gen_random_uuid());
select tests.login('dan');
select public.save_form_draft(tests.id('formA'),
  jsonb_build_object('title', 'Food Fest 2026', 'slug', 'food-fest', 'submit_label', 'Place order',
                     'design', '{"v":1,"theme":{"accent":"#E8633A"}}'::jsonb),
  jsonb_build_array(
    jsonb_build_object('id', tests.id('fld1'), 'type', 'short', 'label', 'Name', 'required', true),
    jsonb_build_object('id', tests.id('fld2'), 'type', 'choice', 'label', 'Size', 'options', '["S","M"]'::jsonb),
    jsonb_build_object('id', tests.id('fldSub'), 'type', 'submit')));
select tests.ok((select title from public.forms where id = tests.id('formA')) = 'Food Fest 2026', 'a member can save a draft');
select tests.ok((select string_agg(type, ',' order by position) from public.form_fields where form_id = tests.id('formA')) = 'short,choice,submit', 'saving replaces the fields in order');
select tests.ok((public.get_public_form('threadtogo', 'food-fest') -> 'config' ->> 'title') <> 'Food Fest 2026', 'saving a draft does not change the published form');
select tests.fails($$select public.save_form_draft(tests.id('formA'), '{"title":"x","slug":"food-fest","submit_label":"Go"}', jsonb_build_array(jsonb_build_object('id', tests.id('fld1'), 'type', 'script')))$$, 'unknown block types are rejected');
select tests.ok((select count(*) from public.form_fields where form_id = tests.id('formA')) = 3, 'a rejected save changes nothing');
reset role;
select tests.login('bob');
select tests.fails($$select public.save_form_draft(tests.id('formA'), '{"title":"hacked","slug":"food-fest","submit_label":"Go"}', '[]')$$, 'bob cannot save another business''s form');
select tests.fails(format($$select public.save_form_draft(%L, '{"title":"Bob","slug":"bob-form","submit_label":"Go"}', jsonb_build_array(jsonb_build_object('id', %L, 'type', 'short')))$$, tests.id('formB'), tests.id('fld1')), 'bob cannot take over another form''s field by its id');
reset role;
select tests.ok((select form_id from public.form_fields where id = tests.id('fld1')) = tests.id('formA') and (select label from public.form_fields where id = tests.id('fld1')) = 'Name', 'the other business''s field is untouched');
select tests.login('alice');
select tests.affects(format($$insert into storage.objects (bucket_id, name) values ('form-assets', '%s/forms/x/y.webp')$$, tests.id('orgA')), 1, 'members can upload builder artwork');
reset role;

-- ---------------------------------------------------------------- public submissions (Stage 6)
insert into tests.vals values ('ver', (select published_version::text from public.forms where id = tests.id('formA')));
select tests.ok((public.get_public_form('threadtogo', 'food-fest') ->> 'version')::int = tests.val('ver')::int, 'the public form includes its published version');
select tests.anon();
select tests.fails($$select public.submit_form(gen_random_uuid(), tests.id('formA'), 1, '{}', '{}', false, 'x', null, '[]', null, null, null)$$, 'visitors cannot call submit_form directly');
reset role;
select tests.login('alice');
select tests.fails($$select public.submit_form(gen_random_uuid(), tests.id('formA'), 1, '{}', '{}', false, 'x', null, '[]', null, null, null)$$, 'signed-in users cannot call submit_form directly');
reset role;

set role service_role;
insert into tests.ids values ('sub1', gen_random_uuid());
insert into tests.vals values ('r1', (select public.submit_form(tests.id('sub1'), tests.id('formA'), tests.val('ver')::int,
  '{"name":{"label":"Your name","value":"Lena Ortiz"}}', '{"name":"Lena O.","email":"LENA@example.com","phone":"+15555550142","channel":"sms"}',
  true, 'Food Fest · Lena', '1 × Hoodie', jsonb_build_array(jsonb_build_object('path', tests.id('orgA') || '/subs/a.png', 'mime', 'image/png', 'size', 1200, 'name', 'logo.png')),
  'iphash-1', 'Mozilla/5.0', 'clientkey-000000000001')::text));
reset role;
select tests.ok((tests.val('r1')::jsonb ->> 'number')::int = 1002, 'a submission creates the next numbered job');
select tests.ok(char_length(tests.val('r1')::jsonb ->> 'tracking_token') = 64, 'the customer gets a tracking token');
select tests.ok((select customer_id from public.form_submissions where id = tests.id('sub1')) = tests.id('custA'), 'an existing customer is matched by email (any case)');
select tests.ok((select name from public.customers where id = tests.id('custA')) = 'Lena O.' and (select consent_updates from public.customers where id = tests.id('custA')), 'the customer record is updated with the new name and consent');
select tests.ok((select stage_id from public.jobs where submission_id = tests.id('sub1')) = tests.id('stage0'), 'new jobs start in the first production stage');
select tests.ok((select title || '|' || summary from public.jobs where submission_id = tests.id('sub1')) = 'Food Fest · Lena|1 × Hoodie', 'the job gets a title and summary');
select tests.ok((select count(*) from public.files where submission_id = tests.id('sub1') and bucket = 'submission-uploads') = 1, 'uploaded files are recorded with the submission');
select tests.ok((select count(*) from public.job_events where job_id = (select id from public.jobs where submission_id = tests.id('sub1')) and type = 'created') = 1, 'the new job starts its audit history');

set role service_role;
select tests.ok((public.submit_form(gen_random_uuid(), tests.id('formA'), tests.val('ver')::int, '{}', '{"name":"Lena"}', false, 'x', null, '[]', 'iphash-1', null, 'clientkey-000000000001') ->> 'number')::int = 1002,
  'a repeated click returns the first order instead of creating a second');
select tests.fails(format($$select public.submit_form(gen_random_uuid(), %L, %s, '{}', '{"name":"Old"}', false, 'x', null, '[]', null, null, null)$$, tests.id('formA'), tests.val('ver')::int - 1), 'answers to an older version of the form are refused');
select tests.fails(format($$select public.submit_form(gen_random_uuid(), %L, %s, '{}', '{"name":"Planted"}', false, 'x', null, jsonb_build_array(jsonb_build_object('path', %L, 'mime', 'image/png', 'size', 10, 'name', 'x')), null, null, null)$$,
  tests.id('formA'), tests.val('ver')::int, tests.id('orgB') || '/subs/x.png'), 'files must be in the business''s own folder');
select tests.fails(format($$select public.submit_form(gen_random_uuid(), %L, 0, '{}', '{"name":"x"}', false, 'x', null, '[]', null, null, null)$$, tests.id('formB')), 'draft forms do not take orders');
do $$ begin
  for i in 1..9 loop
    perform public.submit_form(gen_random_uuid(), tests.id('formA'), tests.val('ver')::int, '{}', jsonb_build_object('name', 'Guest ' || i), false, 'x', null, '[]', 'iphash-2', null, null);
  end loop;
end $$;
select tests.ok((select count(*) from public.form_submissions where source_ip_hash = 'iphash-2') = 9, 'ordinary repeat orders from one device are accepted');
select public.submit_form(gen_random_uuid(), tests.id('formA'), tests.val('ver')::int, '{}', '{"name":"Guest 10"}', false, 'x', null, '[]', 'iphash-2', null, null);
select tests.fails(format($$select public.submit_form(gen_random_uuid(), %L, %s, '{}', '{"name":"Guest 11"}', false, 'x', null, '[]', 'iphash-2', null, null)$$, tests.id('formA'), tests.val('ver')::int), 'more than 10 orders from one device in 10 minutes are refused');
reset role;
select tests.login('alice');
update public.forms set status = 'closed' where id = tests.id('formA');
reset role;
set role service_role;
select tests.fails(format($$select public.submit_form(gen_random_uuid(), %L, %s, '{}', '{"name":"Late"}', false, 'x', null, '[]', null, null, null)$$, tests.id('formA'), tests.val('ver')::int), 'closed forms do not take orders');
reset role;
select tests.login('alice');
update public.forms set status = 'live' where id = tests.id('formA');
select tests.ok((select count(*) from public.form_submissions where id = tests.id('sub1')) = 1, 'the business can read its submissions');
reset role;
select tests.login('bob');
select tests.ok((select count(*) from public.form_submissions) = 0 and (select count(*) from public.files) = 0, 'another business cannot read the submissions or files');
reset role;

-- ---------------------------------------------------------------- production board (Stage 7)
insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'finn@example.com', '{"full_name":"Finn Member"}');
insert into tests.ids select 'finn', id from auth.users where email = 'finn@example.com';
select tests.login('alice');
insert into tests.vals values ('invite_finn', public.create_invitation(tests.id('orgA'), 'finn@example.com', 'member'));
reset role;
select tests.login('finn');
select public.accept_invitation(tests.val('invite_finn'));
insert into tests.ids select 'final', id from public.workflow_stages where org_id = tests.id('orgA') and is_final;
select tests.affects($$update public.jobs set stage_id = tests.id('final') where id = tests.id('jobA') and stage_id = tests.id('stage2')$$, 1, 'a member can move a job');
select tests.ok((select completed_at is not null from public.jobs where id = tests.id('jobA')), 'moving a job to a final stage marks it complete');
select tests.affects($$update public.jobs set stage_id = tests.id('stage0') where id = tests.id('jobA') and stage_id = tests.id('stage2')$$, 0, 'a move from an out-of-date stage changes nothing (two people moving one job)');
select tests.affects($$update public.jobs set stage_id = tests.id('stage2') where id = tests.id('jobA') and stage_id = tests.id('final')$$, 1, 'a finished job can be reopened');
select tests.ok((select completed_at is null from public.jobs where id = tests.id('jobA')), 'reopening a job clears its completion time');
update public.jobs set completed_at = now() where id = tests.id('jobA');
select tests.ok((select completed_at is null from public.jobs where id = tests.id('jobA')), 'the completion time cannot be set by hand');
select tests.ok((select count(*) from public.job_events where job_id = tests.id('jobA') and type = 'stage_changed' and actor_id = tests.id('finn')) = 2, 'each move is recorded in the history with who made it');
select tests.affects($$update public.jobs set assignee_id = tests.id('finn'), priority = 2, due_date = current_date + 1 where id = tests.id('jobA')$$, 1, 'a member can assign a job, set its priority and due date');
select tests.fails($$update public.jobs set priority = 7 where id = tests.id('jobA')$$, 'priority must be 0 to 3');
select tests.fails($$update public.jobs set tracking_token = repeat('a', 64) where id = tests.id('jobA')$$, 'tracking links cannot be changed');
select tests.fails($$update public.jobs set number = 1 where id = tests.id('jobA')$$, 'order numbers cannot be changed');
insert into public.job_events (org_id, job_id, actor_id, type, body) values (tests.id('orgA'), tests.id('jobA'), tests.id('finn'), 'note', 'Thread ordered');
select tests.ok((select count(*) from public.job_events where job_id = tests.id('jobA') and type = 'note') = 2, 'a member can add a note');
select tests.affects($$update public.workflow_stages set name = 'Renamed' where org_id = tests.id('orgA')$$, 0, 'a member cannot rename stages');
select tests.fails(format($$select public.reorder_stages(%L, %L::uuid[])$$, tests.id('orgA'), (select array_agg(id order by position desc) from public.workflow_stages where org_id = tests.id('orgA'))), 'a member cannot reorder stages');
reset role;

select tests.login('alice');
insert into tests.vals values ('order', (select string_agg(id::text, ',' order by case when position = 1 then 99 else position end) from public.workflow_stages where org_id = tests.id('orgA')));
select public.reorder_stages(tests.id('orgA'), string_to_array(tests.val('order'), ',')::uuid[]);
select tests.ok((select string_agg(id::text, ',' order by position) from public.workflow_stages where org_id = tests.id('orgA')) = tests.val('order'), 'an owner can reorder stages');
select tests.ok((select string_agg(position::text, ',' order by position) from public.workflow_stages where org_id = tests.id('orgA')) = '0,1,2,3,4,5', 'stage positions stay in a clean sequence');
select tests.fails(format($$select public.reorder_stages(%L, %L::uuid[])$$, tests.id('orgA'), (select (array_agg(id order by position))[1:5] from public.workflow_stages where org_id = tests.id('orgA'))), 'a stage order with a stage missing is refused');
select tests.fails(format($$select public.reorder_stages(%L, %L::uuid[])$$, tests.id('orgA'), (select array_agg(case when position = 3 then tests.id('stageB2') else id end order by position) from public.workflow_stages where org_id = tests.id('orgA'))), 'another business''s stage cannot be slipped into the order');
select tests.fails(format($$select public.reorder_stages(%L, %L::uuid[])$$, tests.id('orgA'), (select array_agg(id order by is_final desc, position) from public.workflow_stages where org_id = tests.id('orgA'))), 'a final stage cannot be put first');
select tests.fails($$update public.workflow_stages set is_final = true where id = tests.id('stage0')$$, 'the first stage cannot be made a final stage');
select tests.fails($$delete from public.workflow_stages where id = tests.id('stage2')$$, 'a stage that still has jobs cannot be deleted');
do $$ begin
  for i in 7..12 loop
    insert into public.workflow_stages (org_id, name, position) values (tests.id('orgA'), 'Extra ' || i, i);
  end loop;
end $$;
select tests.fails($$insert into public.workflow_stages (org_id, name, position) values (tests.id('orgA'), 'Extra 13', 13)$$, 'a business can have up to 12 stages');
select tests.affects($$delete from public.workflow_stages where org_id = tests.id('orgA') and name like 'Extra %'$$, 6, 'empty stages can be deleted');
update public.workflow_stages set is_final = true where id = tests.id('stage2');
select tests.ok((select completed_at is not null from public.jobs where id = tests.id('jobA')), 'jobs complete when their stage is made final');
update public.workflow_stages set is_final = false where id = tests.id('stage2');
select tests.ok((select completed_at is null from public.jobs where id = tests.id('jobA')), 'jobs reopen when their stage stops being final');
reset role;

select tests.login('bob');
select tests.fails(format($$select public.reorder_stages(%L, %L::uuid[])$$, tests.id('orgA'), string_to_array(tests.val('order'), ',')::uuid[]), 'another business cannot reorder these stages');
select tests.affects($$update public.jobs set stage_id = tests.id('stage0') where id = tests.id('jobA')$$, 0, 'another business cannot move these jobs');
select tests.affects($$delete from public.workflow_stages where org_id = tests.id('orgB') and position > 0$$, 5, 'an owner can delete empty stages');
select tests.fails($$delete from public.workflow_stages where org_id = tests.id('orgB')$$, 'a business keeps at least one stage');
insert into public.jobs (org_id, stage_id, title) values (tests.id('orgB'), tests.id('stageB2'), 'Bob''s job');
reset role;

-- ---------------------------------------------------------------- customer text updates (Stage 8)
select tests.login('alice');
insert into tests.ids select 'qc', id from public.workflow_stages where org_id = tests.id('orgA') and name = 'Quality check';
insert into tests.ids select 'ready', id from public.workflow_stages where org_id = tests.id('orgA') and name = 'Ready for collection';
update public.jobs set stage_id = tests.id('stage0') where id = tests.id('jobA');
select tests.ok((select status || ':' || skip_reason from public.messages where job_id = tests.id('jobA') order by created_at desc, id limit 1) = 'skipped:Texting is switched off for this business.', 'no texts are sent until the business switches texting on');
select tests.affects($$update public.organizations set texting_enabled = true where id = tests.id('orgA')$$, 1, 'an owner can switch texting on');
update public.jobs set stage_id = tests.id('stage2') where id = tests.id('jobA');
select tests.ok((select count(*) from public.messages where job_id = tests.id('jobA') and stage_id = tests.id('stage2') and status = 'queued') = 1, 'moving a job to a stage that notifies the customer queues a text');
select tests.ok((select to_address = '+15555550142' and template = (select message_template from public.workflow_stages where id = tests.id('stage2')) and created_by = tests.id('alice')
  from public.messages where job_id = tests.id('jobA') and stage_id = tests.id('stage2') and status = 'queued'), 'the queued text has the customer''s number, the stage''s message and who moved the job');
insert into tests.vals values ('msgs', (select count(*)::text from public.messages where job_id = tests.id('jobA')));
update public.jobs set stage_id = tests.id('qc') where id = tests.id('jobA');
select tests.ok((select count(*)::text from public.messages where job_id = tests.id('jobA')) = tests.val('msgs'), 'stages that don''t notify the customer send nothing');
update public.jobs set stage_id = tests.id('stage2') where id = tests.id('jobA');
select tests.ok((select skip_reason from public.messages where job_id = tests.id('jobA') and stage_id = tests.id('stage2') order by created_at desc, status limit 1) like 'An update for this stage was already sent%', 'moving a job back and forth doesn''t text the customer twice for one stage');
update public.customers set consent_updates = false where id = tests.id('custA');
update public.jobs set stage_id = tests.id('ready') where id = tests.id('jobA');
select tests.ok((select skip_reason from public.messages where job_id = tests.id('jobA') and stage_id = tests.id('ready') order by created_at desc limit 1) = 'The customer didn''t agree to order updates.', 'customers who didn''t agree are never texted');
update public.customers set consent_updates = true, preferred_channel = 'whatsapp' where id = tests.id('custA');
update public.jobs set stage_id = tests.id('stage0') where id = tests.id('jobA');
select tests.ok((select skip_reason from public.messages where job_id = tests.id('jobA') and stage_id = tests.id('stage0') order by created_at desc limit 1) like 'WhatsApp and email%', 'customers who chose WhatsApp or email aren''t sent a text');
update public.customers set preferred_channel = 'sms' where id = tests.id('custA');
select tests.fails($$insert into public.messages (org_id, to_address, body) values (tests.id('orgA'), '+15555550100', 'spam')$$, 'the app cannot write messages directly');
select tests.fails($$update public.messages set status = 'delivered' where org_id = tests.id('orgA')$$, 'the app cannot change message statuses');
select tests.fails($$delete from public.messages where org_id = tests.id('orgA')$$, 'the message log cannot be deleted');
reset role;

select tests.login('finn');
select tests.ok((select count(*) from public.messages) >= 5, 'team members can read their business''s message log');
select tests.affects($$update public.organizations set texting_enabled = false where id = tests.id('orgA')$$, 0, 'members cannot switch texting off or on');
reset role;
select tests.login('bob');
select tests.ok((select count(*) from public.messages where org_id = tests.id('orgA')) = 0 and (select count(*) from public.messages) = (select count(*) from public.messages where org_id = tests.id('orgB')), 'another business cannot read the message log');
reset role;

set role service_role;
insert into tests.vals values ('webOrder', public.submit_form(gen_random_uuid(), tests.id('formA'), tests.val('ver')::int, '{}',
  '{"name":"Mia Chen","phone":"+15555550199","channel":"sms"}', true, 'Web order', null, '[]', null, null, null)::text);
reset role;
select tests.ok((select m.status = 'queued' and m.to_address = '+15555550199' and m.stage_id = tests.id('stage0')
  from public.messages m join public.jobs j on j.id = m.job_id where j.number = (tests.val('webOrder')::jsonb ->> 'number')::int),
  'a new online order queues its confirmation text');
update public.organizations set texting_enabled = false where id = tests.id('orgA');

-- ---------------------------------------------------------------- deleting a business (with a job in it)
select tests.login('bob');
select tests.affects($$delete from public.organizations where id = tests.id('orgB')$$, 1, 'an owner can delete their business');
reset role;
select tests.ok((select count(*) from public.forms where org_id = tests.id('orgB')) = 0 and (select count(*) from public.organization_members where org_id = tests.id('orgB')) = 0, 'deleting a business removes its data');

select count(*) as checks_passed from tests.passed;
