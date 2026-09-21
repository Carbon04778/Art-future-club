-- ===========================================================================
-- 023  let an admin change another member's role from the dashboard
--
-- RECOVERED FROM THE LIVE DATABASE on 2026-09-22, not reconstructed.
--
--   select pg_get_functiondef('public.protect_role_column'::regproc);
--   select policyname, cmd, roles, qual, with_check
--   from pg_policies where tablename = 'profiles';
--
-- Both were applied by hand in the SQL editor and never committed, so the repo
-- described a database that no longer existed: 005 says no role may change
-- from the browser at all, and 002 says a member may update only their own
-- profiles row. The live database relaxes both for admins — which is the only
-- reason AdminMembersPanel's role dropdown works.
--
-- WHAT CHANGES, EXACTLY
--
--   protect_role_column()   gains  `and not public.is_admin()`
--   profiles_update_own     gains  `or public.is_admin()` in USING and CHECK
--
-- Nothing else. profiles_read already matched 020 and is left alone.
--
-- WHY IT IS STILL SAFE
--
-- The whole point of 005 was that no member can promote themselves from the
-- browser. That still holds: a non-admin's role change is refused by the
-- trigger, and a non-admin cannot reach another member's row at all. What is
-- new is that an ADMIN may change roles from the dashboard instead of only
-- from the SQL editor. The guard is is_admin(), which reads the caller's own
-- row; an admin can therefore also demote themselves — see the incident below.
--
-- KNOWN CONSEQUENCE
--
-- An admin who sets their own role to anything else loses is_admin() at once,
-- and with it the right to set it back. On 2026-09-21 a permissions check did
-- exactly that to the owner's account, and the only way back was
--   update public.profiles set role = 'admin' where email = '...';
-- in the SQL editor. The dashboard should probably refuse to change the
-- signed-in admin's own role; until it does, do not.
--
-- The function body below is the dump with its Windows line endings
-- normalised; the text is otherwise unchanged. The policy is written in this
-- repo's style, and is semantically what pg_policies reports:
--   qual = ((id = auth.uid()) OR is_admin())   with_check = the same.
-- ===========================================================================

create or replace function public.protect_role_column()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.role is distinct from old.role
     and coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated')
     and not public.is_admin() then
    raise exception 'only an admin may change a role';
  end if;
  return new;
end;
$$;

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using      (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
