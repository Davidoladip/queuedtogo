-- QueuedToGo: production board (Stage 7)
--   * A job's completed_at follows its stage: set when it reaches a final stage, cleared when it leaves one.
--   * Stage guards: at most 12 stages, the last stage can't be deleted, the first stage can't be final
--     (new orders arrive in the first stage).
--   * reorder_stages: reorders a business's stages in one step (SECURITY INVOKER, so RLS applies).
--   * Deleting a business with jobs: the jobs -> stage foreign key is checked at the end of the
--     statement instead of immediately, so the business's own cascade can remove both.

-- ---------------------------------------------------------------------------
-- completed_at follows the stage
-- ---------------------------------------------------------------------------
create or replace function public.sync_job_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_final boolean;
begin
  select s.is_final into v_final from public.workflow_stages s where s.id = new.stage_id and s.org_id = new.org_id;
  if coalesce(v_final, false) then
    new.completed_at := coalesce(case when tg_op = 'UPDATE' then old.completed_at end, now());
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.sync_job_completion() from public, anon, authenticated;

create trigger jobs_completion before insert or update of stage_id, completed_at on public.jobs
  for each row execute function public.sync_job_completion();

-- When a stage is switched to or from "final", its jobs follow.
create or replace function public.sync_stage_final()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_final is distinct from old.is_final then
    update public.jobs set completed_at = case when new.is_final then now() end
     where stage_id = new.id and org_id = new.org_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.sync_stage_final() from public, anon, authenticated;

create trigger workflow_stages_final after update of is_final on public.workflow_stages
  for each row execute function public.sync_stage_final();

-- Existing jobs already in a final stage get a completion time.
update public.jobs j set completed_at = coalesce(j.completed_at, j.updated_at)
  from public.workflow_stages s
 where s.id = j.stage_id and s.org_id = j.org_id and s.is_final and j.completed_at is null;

-- ---------------------------------------------------------------------------
-- Stage guards
-- ---------------------------------------------------------------------------
create or replace function public.guard_stages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first uuid;
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.workflow_stages where org_id = new.org_id) >= 12 then
      raise exception 'A business can have up to 12 stages.' using errcode = 'QTG04';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    -- Deleting the whole business removes every stage; that is allowed.
    if exists (select 1 from public.organizations where id = old.org_id)
       and not exists (select 1 from public.workflow_stages where org_id = old.org_id and id <> old.id) then
      raise exception 'A business needs at least one stage.' using errcode = 'QTG05';
    end if;
    return old;
  end if;

  -- UPDATE: the first stage (where new orders arrive) can't be a final stage.
  if new.is_final then
    select id into v_first from public.workflow_stages where org_id = new.org_id order by position, created_at limit 1;
    if v_first = new.id then
      raise exception 'The first stage is where new orders arrive, so it can''t be a final stage.' using errcode = 'QTG07';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_stages() from public, anon, authenticated;

create trigger workflow_stages_guard_insert before insert on public.workflow_stages
  for each row execute function public.guard_stages();
create trigger workflow_stages_guard_delete before delete on public.workflow_stages
  for each row execute function public.guard_stages();
create trigger workflow_stages_guard_final after update of is_final, position on public.workflow_stages
  for each row execute function public.guard_stages();

-- ---------------------------------------------------------------------------
-- reorder_stages: the full list of the business's stage ids, in the new order.
-- ---------------------------------------------------------------------------
create or replace function public.reorder_stages(p_org uuid, p_order uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.has_org_role(p_org, '{owner,admin}') then
    raise exception 'Only owners and admins can change stages.' using errcode = '42501';
  end if;
  if p_order is null
     or cardinality(p_order) <> (select count(*) from public.workflow_stages where org_id = p_org)
     or (select count(distinct x) from unnest(p_order) x) <> cardinality(p_order)
     or exists (select 1 from unnest(p_order) u(id)
                 where not exists (select 1 from public.workflow_stages s where s.id = u.id and s.org_id = p_org)) then
    raise exception 'The stage list has changed. Reload and try again.' using errcode = 'QTG06';
  end if;
  if (select is_final from public.workflow_stages where id = p_order[1]) then
    raise exception 'The first stage is where new orders arrive, so it can''t be a final stage.' using errcode = 'QTG07';
  end if;

  -- Move out of the way first, then into place, so positions never collide mid-update.
  update public.workflow_stages set position = position + 100 where org_id = p_org;
  update public.workflow_stages s set position = u.ord - 1
    from unnest(p_order) with ordinality as u(id, ord)
   where s.id = u.id and s.org_id = p_org;
end;
$$;
revoke execute on function public.reorder_stages(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_stages(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Deleting a business that has jobs
-- ---------------------------------------------------------------------------
alter table public.jobs drop constraint if exists jobs_stage_id_org_id_fkey;
alter table public.jobs add constraint jobs_stage_id_org_id_fkey
  foreign key (stage_id, org_id) references public.workflow_stages (id, org_id) on delete no action;
