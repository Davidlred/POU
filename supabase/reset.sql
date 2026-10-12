-- =====================================================================
-- Poultry360 MVP · reset
-- Drops everything schema.sql creates so it can be re-run cleanly.
-- WARNING: deletes ALL Poultry360 data (orders, wallets, listings, farm records…).
-- Auth users and storage buckets/files are kept (schema.sql re-inserts buckets with on conflict do nothing).
-- Empty the buckets from Storage in the dashboard if you also want the files gone.
-- =====================================================================

-- pg_cron job (ignored if pg_cron isn't enabled or the job doesn't exist)
do $$ begin
  perform cron.unschedule('p360-expire');
exception when others then null;
end $$;
do $$ begin
  perform cron.unschedule('p360-invest-close');
exception when others then null;
end $$;
do $$ begin
  perform cron.unschedule('p360-roi-monthly');
exception when others then null;
end $$;

-- Trigger on auth.users (lives outside public, so CASCADE on tables won't remove it)
drop trigger if exists on_auth_user_created on auth.users;

-- Storage policies
drop policy if exists p360_upload_own on storage.objects;
drop policy if exists p360_read_private_own on storage.objects;
drop policy if exists p360_admin_read_id_docs on storage.objects;

-- Tables (CASCADE also removes their policies, triggers, indexes and realtime publication entries)
drop table if exists
  public.vet_slot_exceptions, public.vet_availability,
  public.symptom_checks, public.health_records, public.consultations, public.vet_slots, public.vets,
  public.farm_inventory, public.vaccinations, public.farm_logs, public.flocks,
  public.disputes, public.reviews, public.delivery_assignments, public.riders,
  public.order_items, public.sub_orders, public.orders, public.listings, public.addresses,
  public.coverage_areas, public.withdrawal_codes, public.transactions, public.wallets,
  public.credit_entries, public.credit_customers,
  public.roi_calculations, public.investments, public.pool_farms, public.investment_pools, public.investment_offerings, public.kyc_records,
  public.vendor_profiles, public.profiles, public.admins
cascade;

drop sequence if exists public.order_seq;

-- Functions (dropped by name regardless of signature)
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'handle_new_user','vendor_insert_guard','guard_listing','guard_farm_log','lww',
      'rider_self','sub_order_party','can_see_rider',
      'set_roles','set_active_role','submit_vendor_application','dev_set_verification',
      'wallet_topup','add_bank','request_withdrawal_code','wallet_withdraw',
      'place_order','refund_sub_order','vendor_respond','assign_rider','vendor_mark_ready',
      'rider_claim','rider_set_status','rider_ping','rider_respond','rider_advance',
      'expire_overdue','order_detail','buyer_orders','vendor_orders','rider_current','rider_history',
      'book_consultation','request_onsite','rollup_vendor_rating',
      'is_admin','admin_vendors','admin_set_verification',
      'admin_riders','admin_save_rider','admin_set_rider_active',
      'rider_trip_size','dispatch_waiting','rider_after_job','vendor_pickup_riders','rider_profile',
      'vendor_guard_columns','submit_kyc','dev_set_kyc','apply_investment_badge','dev_set_badge','save_offering','submit_offering',
      'dev_review_offering','invest','investor_count','refund_investments','activate_investment','distribute_returns','snapshot_roi_for',
      'investment_housekeeping','snapshot_roi','suspend_on_flag','my_portfolio','admin_invest_overview','admin_set_kyc','admin_set_badge',
      'admin_review_offering','admin_activate_investment','admin_distribute_returns','admin_create_pool',
      'set_buyer_type','submit_vet_application','vet_update_profile','vet_self','vet_add_slot','vet_remove_slot','vet_respond_onsite',
      'vet_complete','vet_desk','admin_vets','admin_set_vet','credit_threshold','credit_outstanding','farm_book','farm_book_allow_buyer',
      'farm_book_update_customer','farm_book_log_credit','farm_book_settle','farm_book_cancel','credit_available','my_credit','credit_pay',
      'my_payout_account','vet_generate_slots','vet_set_availability','vet_refresh_slots','vet_set_weekly')
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;
