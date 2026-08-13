-- ===========================================================================
-- Art Future Club — Row Level Security
-- Run AFTER 001_schema.sql
-- ===========================================================================
--
-- WHY THIS FILE MATTERS MORE THAN ANY OTHER
--
-- The browser holds the Supabase anon key. It is public by design — it ships
-- inside the JavaScript bundle. RLS is the ONLY thing standing between a
-- curious visitor and every row in this database.
--
-- Without these policies, anyone could:
--   - read every private Message between members
--   - read every Inquiry (buyer names, emails, price negotiations)
--   - set their own artist_profile.is_premium = true and bypass the paywall
--   - delete any forum post
--
-- Run 003_rls_tests.sql after this to prove the policies actually hold.
-- ===========================================================================

alter table public.profiles              enable row level security;
alter table public.article               enable row level security;
alter table public.artist_profile        enable row level security;
alter table public.collector_profile     enable row level security;
alter table public.gallery_work          enable row level security;
alter table public.event                 enable row level security;
alter table public.open_call             enable row level security;
alter table public.forum_post            enable row level security;
alter table public.forum_reply           enable row level security;
alter table public.comment               enable row level security;
alter table public."like"                enable row level security;
alter table public.follow                enable row level security;
alter table public.message               enable row level security;
alter table public.inquiry               enable row level security;
alter table public.notification          enable row level security;
alter table public.subscription          enable row level security;
alter table public.collected_work        enable row level security;
alter table public.newsletter_subscriber enable row level security;

-- GRANTS come first: RLS policies narrow access, but a missing GRANT blocks
-- it outright. Both layers must permit an operation for it to succeed.
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

-- Anonymous visitors need INSERT on exactly two tables: the public enquiry
-- form and the newsletter signup. Nothing else.
grant insert on public.inquiry               to anon;
grant insert on public.newsletter_subscriber to anon;

-- ---------------------------------------------------------------- profiles
-- Public read (display names appear all over the app).
create policy profiles_read on public.profiles
  for select using (true);

-- You may update your own profile — but NOT your role.
-- The role check is enforced by a trigger below, because a WITH CHECK clause
-- cannot compare against the OLD row.
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- PRIVILEGE-ESCALATION GUARD.
-- Without this, any member could run
--   update profiles set role='admin' where id = <their own id>
-- and gain the Admin Dashboard. Only service_role may change role.
create or replace function public.protect_role_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and current_setting('role', true) is distinct from 'service_role' then
    raise exception 'role may only be changed by service_role';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_role on public.profiles;
create trigger trg_protect_role
  before update on public.profiles
  for each row execute function public.protect_role_column();

-- ----------------------------------------------------------------- article
-- Anonymous visitors see PUBLISHED articles only. Drafts are admin-only.
create policy article_read_published on public.article
  for select using (published = true or public.is_admin());

create policy article_write_admin on public.article
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------- artist_profile
create policy artist_read on public.artist_profile
  for select using (true);

create policy artist_insert_own on public.artist_profile
  for insert to authenticated
  with check (user_id = auth.uid());

create policy artist_update_own on public.artist_profile
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create policy artist_delete_own on public.artist_profile
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- PAYWALL GUARD.
-- is_premium / is_featured / featured_until are granted by the Stripe webhook,
-- which runs as service_role. If profile owners could set them, the paid tiers
-- would be decorative. Admins are also blocked here — grants go through Stripe.
create or replace function public.protect_paywall_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('role', true) is distinct from 'service_role'
     and (new.is_premium     is distinct from old.is_premium
       or new.is_featured    is distinct from old.is_featured
       or new.featured_until is distinct from old.featured_until) then
    raise exception 'is_premium / is_featured / featured_until are set by billing only';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_paywall on public.artist_profile;
create trigger trg_protect_paywall
  before update on public.artist_profile
  for each row execute function public.protect_paywall_columns();

-- ------------------------------------------------- collector_profile
create policy collector_read on public.collector_profile
  for select using (true);

create policy collector_insert_own on public.collector_profile
  for insert to authenticated
  with check (user_id = auth.uid());

create policy collector_update_own on public.collector_profile
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create policy collector_delete_own on public.collector_profile
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------ gallery_work
create policy gwork_read on public.gallery_work
  for select using (true);

create policy gwork_insert_own on public.gallery_work
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy gwork_update_own on public.gallery_work
  for update to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

create policy gwork_delete_own on public.gallery_work
  for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------------- event
create policy event_read on public.event
  for select using (true);

create policy event_insert_own on public.event
  for insert to authenticated
  with check (organizer_id = auth.uid());

create policy event_update_own on public.event
  for update to authenticated
  using (organizer_id = auth.uid() or public.is_admin())
  with check (organizer_id = auth.uid() or public.is_admin());

create policy event_delete_own on public.event
  for delete to authenticated
  using (organizer_id = auth.uid() or public.is_admin());

-- --------------------------------------------------------- open_call
create policy opencall_read on public.open_call
  for select using (true);

create policy opencall_insert_own on public.open_call
  for insert to authenticated
  with check (posted_by_id = auth.uid());

create policy opencall_update_own on public.open_call
  for update to authenticated
  using (posted_by_id = auth.uid() or public.is_admin())
  with check (posted_by_id = auth.uid() or public.is_admin());

create policy opencall_delete_own on public.open_call
  for delete to authenticated
  using (posted_by_id = auth.uid() or public.is_admin());

-- -------------------------------------------------------- forum_post
create policy fpost_read on public.forum_post
  for select using (true);

create policy fpost_insert_own on public.forum_post
  for insert to authenticated
  with check (author_id = auth.uid());

create policy fpost_update_own on public.forum_post
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- Authors delete their own; admins moderate.
create policy fpost_delete_own_or_admin on public.forum_post
  for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------- forum_reply
create policy freply_read on public.forum_reply
  for select using (true);

create policy freply_insert_own on public.forum_reply
  for insert to authenticated
  with check (author_id = auth.uid());

create policy freply_update_own on public.forum_reply
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy freply_delete_own_or_admin on public.forum_reply
  for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- ----------------------------------------------------------- comment
create policy comment_read on public.comment
  for select using (true);

create policy comment_insert_own on public.comment
  for insert to authenticated
  with check (user_id = auth.uid());

create policy comment_delete_own_or_admin on public.comment
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- -------------------------------------------------------------- like
create policy like_read on public."like"
  for select using (true);

create policy like_insert_own on public."like"
  for insert to authenticated
  with check (user_id = auth.uid());

create policy like_delete_own on public."like"
  for delete to authenticated
  using (user_id = auth.uid());

-- ------------------------------------------------------------ follow
create policy follow_read on public.follow
  for select using (true);

create policy follow_insert_own on public.follow
  for insert to authenticated
  with check (follower_id = auth.uid());

create policy follow_delete_own on public.follow
  for delete to authenticated
  using (follower_id = auth.uid());

-- ===========================================================================
-- PRIVATE DATA — the tables where a mistake is a breach, not a bug
-- ===========================================================================

-- ----------------------------------------------------------- message
-- Readable ONLY by the two people in the conversation. No anon access at all.
create policy message_read_own on public.message
  for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

create policy message_insert_as_sender on public.message
  for insert to authenticated
  with check (sender_id = auth.uid());

-- Recipient may mark as read; sender may not edit after sending.
create policy message_update_recipient on public.message
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

create policy message_delete_own on public.message
  for delete to authenticated
  using (sender_id = auth.uid());

-- ----------------------------------------------------------- inquiry
-- Anyone may SUBMIT an enquiry (the public buy/commission form).
-- Only the artist it was sent to — or an admin — may READ it.
create policy inquiry_insert_public on public.inquiry
  for insert to anon, authenticated
  with check (true);

create policy inquiry_read_target on public.inquiry
  for select to authenticated
  using (artist_user_id = auth.uid() or public.is_admin());

create policy inquiry_update_target on public.inquiry
  for update to authenticated
  using (artist_user_id = auth.uid() or public.is_admin())
  with check (artist_user_id = auth.uid() or public.is_admin());

create policy inquiry_delete_target on public.inquiry
  for delete to authenticated
  using (artist_user_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------ notification
create policy notification_read_own on public.notification
  for select to authenticated
  using (user_id = auth.uid());

-- Any signed-in member may notify another (following, liking, commenting).
create policy notification_insert on public.notification
  for insert to authenticated
  with check (true);

create policy notification_update_own on public.notification
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notification_delete_own on public.notification
  for delete to authenticated
  using (user_id = auth.uid());

-- ------------------------------------------------------ subscription
-- Read-only to the owner. Writes are service_role (Stripe webhook) ONLY.
-- Note the deliberate absence of any insert/update/delete policy for
-- authenticated: no policy means no access. service_role bypasses RLS.
create policy subscription_read_own on public.subscription
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ----------------------------------------------------- collected_work
create policy collected_read on public.collected_work
  for select using (true);

create policy collected_insert_own on public.collected_work
  for insert to authenticated
  with check (user_id = auth.uid());

create policy collected_update_own on public.collected_work
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy collected_delete_own on public.collected_work
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------- newsletter_subscriber
-- Anyone may subscribe. Only admins may read the list (it is personal data).
create policy newsletter_insert_public on public.newsletter_subscriber
  for insert to anon, authenticated
  with check (true);

create policy newsletter_read_admin on public.newsletter_subscriber
  for select to authenticated
  using (public.is_admin());
