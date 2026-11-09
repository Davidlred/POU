-- =====================================================================
-- Poultry360 · wipe all data, keep the database
-- Deletes every account and everything they created: profiles, farms and stores, listings,
-- orders, wallets, Farm Hub records, vets, riders, agents, investments, admins.
-- Keeps the tables, functions, security rules and the delivery areas, so the app works straight
-- away with nobody signed up. CANNOT BE UNDONE.
-- Paste the contents into Supabase → SQL Editor → New query → Run.
-- Uploaded photos and documents are not removed here: empty the buckets under Storage.
-- Emails on the admin list (public.admin_emails) are kept: those people sign up again from the ops dashboard.
-- =====================================================================

begin;

truncate table
  public.agent_payouts, public.agent_sales, public.store_agents,
  public.roi_calculations, public.investments, public.pool_farms, public.investment_pools,
  public.investment_offerings, public.kyc_records,
  public.credit_entries, public.credit_customers,
  public.vet_slot_exceptions, public.vet_availability, public.symptom_checks, public.health_records,
  public.consultations, public.vet_slots, public.vets,
  public.farm_inventory, public.vaccinations, public.farm_logs, public.flocks,
  public.disputes, public.reviews, public.delivery_assignments, public.riders,
  public.order_items, public.sub_orders, public.orders, public.listings, public.addresses,
  public.withdrawal_codes, public.transactions, public.wallets,
  public.vendor_profiles, public.profiles, public.admins
restart identity cascade;

-- Every sign-in account (emails, passwords, sessions)
delete from auth.users;

commit;

-- Check: every line should say 0
select 'accounts' as what, count(*) from auth.users
union all select 'profiles', count(*) from public.profiles
union all select 'listings', count(*) from public.listings
union all select 'orders', count(*) from public.orders;
