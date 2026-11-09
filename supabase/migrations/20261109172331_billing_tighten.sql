-- The plan lookups are only needed inside the database's own checks and by the server.
revoke execute on function public.effective_plan(uuid) from authenticated;
revoke execute on function public.billing_enforced() from authenticated;
