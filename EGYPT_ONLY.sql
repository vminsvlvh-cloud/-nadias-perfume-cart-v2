-- Apply after DATABASE_HARDENING.sql. The store operates exclusively in Egypt.
alter table public.site_content add constraint settings_egypt_only check (
 key <> 'settings' or (
 coalesce(value->>'currency','EGP') = 'EGP'
 and not jsonb_path_exists(value, '$.shipping_rates[*] ? (@.country != "EG")')
 ));
alter table public.store_orders add constraint orders_egypt_only check (country = 'EG' and currency = 'EGP');
