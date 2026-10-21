-- Tenant-isolation, role and audit tests. Run with scripts/test-db.sh.
-- Each check raises an exception on failure, so the run stops at the first broken rule.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

create table tests.ids (k text primary key, v uuid);
grant select, insert on tests.ids to anon, authenticated, service_role;
create table tests.vals (k text primary key, v text);
grant select, insert, update on tests.vals to anon, authenticated;
create table tests.passed (n serial, label text);
grant insert, select on tests.passed to anon, authenticated;
grant usage on sequence tests.passed_n_seq to anon, authenticated;

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

-- ---------------------------------------------------------------- deleting a business
select tests.login('bob');
select tests.affects($$delete from public.organizations where id = tests.id('orgB')$$, 1, 'an owner can delete their business');
reset role;
select tests.ok((select count(*) from public.forms where org_id = tests.id('orgB')) = 0 and (select count(*) from public.organization_members where org_id = tests.id('orgB')) = 0, 'deleting a business removes its data');

select count(*) as checks_passed from tests.passed;
