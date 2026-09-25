-- Apply after EGYPT_ONLY.sql. Egypt remains the domestic market and EGP the currency.
alter table public.site_content drop constraint settings_egypt_only;
alter table public.site_content add constraint settings_currency_egp check (key <> 'settings' or coalesce(value->>'currency','EGP')='EGP');
alter table public.store_orders drop constraint orders_egypt_only;
alter table public.store_orders add constraint order_currency_egp check (currency='EGP');
create or replace function nadia_private.validate_settings() returns trigger language plpgsql set search_path='' as $$
declare r jsonb; old_currency text; new_currency text; k text;
begin
  if new.key<>'settings' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('nadia-currency',0));
  old_currency:=case when tg_op='UPDATE' then coalesce(old.value->>'currency','EGP') else 'EGP' end;
  new_currency:=coalesce(new.value->>'currency','EGP');
  if new_currency not in ('EGP','SAR','USD') then raise exception 'INVALID_CURRENCY'; end if;
  if new_currency<>old_currency and exists(select 1 from public.products where price is not null) then raise exception 'CURRENCY_LOCKED_REPRICE_REQUIRED'; end if;
  if jsonb_typeof(new.value->'shipping_rates') is not null and jsonb_typeof(new.value->'shipping_rates')<>'array' then raise exception 'INVALID_SHIPPING'; end if;
  for r in select value from jsonb_array_elements(coalesce(new.value->'shipping_rates','[]')) loop
    if coalesce(r->>'country','') !~ '^[A-Z]{2}$' or r->>'country' is null or coalesce(r->>'fee','') !~ '^\d{1,7}(\.\d{1,2})?$' then raise exception 'INVALID_SHIPPING'; end if;
  end loop;
  if not coalesce((new.value->>'international_shipping_enabled')::boolean,false) and jsonb_path_exists(new.value, '$.shipping_rates[*] ? (@.country != "EG")') then raise exception 'INTERNATIONAL_SHIPPING_DISABLED'; end if;
  if (select count(*)<>count(distinct value->>'country') from jsonb_array_elements(coalesce(new.value->'shipping_rates','[]'))) then raise exception 'DUPLICATE_SHIPPING_COUNTRY'; end if;
  if coalesce((new.value->>'checkout_enabled')::boolean,false) then
    if not exists(select 1 from public.products p where p.active and p.price>0 and p.stock>0 and length(trim(coalesce(p.description_ar,'')))>0 and length(trim(coalesce(p.description_en,'')))>0 and length(trim(coalesce(p.image_url,'')))>0) then raise exception 'PRODUCTS_REQUIRED'; end if;
    if not coalesce((new.value->>'policies_ready')::boolean,false) then raise exception 'POLICIES_REQUIRED'; end if;
    if jsonb_array_length(coalesce(new.value->'shipping_rates','[]'))=0 then raise exception 'SHIPPING_REQUIRED'; end if;
    if coalesce(new.value->>'payment_method','') not in ('manual','cod') then raise exception 'PAYMENT_REQUIRED'; end if;
    foreach k in array array['page_shipping','page_privacy','page_terms','page_returns'] loop
      if not exists(select 1 from public.site_content where key=k and length(trim(value->>'body_ar'))>=40 and length(trim(value->>'body_en'))>=40) then raise exception 'POLICIES_REQUIRED'; end if;
    end loop;
  end if;
  return new;
end $$;
