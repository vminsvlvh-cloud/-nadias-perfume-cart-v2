-- Applied through Supabase migrations. No product prices or stock are fabricated.
create schema if not exists nadia_private;
revoke all on schema nadia_private from public, anon, authenticated;

alter table public.store_orders add column if not exists currency text;
update public.store_orders set currency=coalesce((select value->>'currency' from public.site_content where key='settings'),'EGP') where currency is null;
alter table public.store_orders alter column currency set not null;
alter table public.store_orders add column if not exists country text not null default 'EG';
alter table public.store_orders add column if not exists shipping_cost numeric(12,2) not null default 0;
alter table public.store_orders add column if not exists request_id uuid unique;
alter table public.store_orders add column if not exists request_hash text;
alter table public.store_orders add column if not exists inventory_reserved boolean not null default false;
alter table public.event_requests add column if not exists request_id uuid unique;
alter table public.event_requests add column if not exists request_hash text;
alter table public.products add constraint products_price_valid check (price is null or (price>0 and price<100000000));
alter table public.products add constraint products_compare_price_valid check (compare_at_price is null or (compare_at_price>=0 and compare_at_price<100000000));
alter table public.products add constraint products_size_valid check (size_ml is null or size_ml>0);
alter table public.products add constraint products_slug_valid check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
alter table public.store_orders add constraint store_order_amounts_valid check (subtotal>=0 and shipping_cost>=0 and total=subtotal+shipping_cost);
alter table public.store_orders add constraint store_order_currency_valid check (currency in ('EGP','SAR','USD'));
create index if not exists store_order_items_order_idx on public.store_order_items(order_id);
create index if not exists store_order_items_product_idx on public.store_order_items(product_id);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists order_items_product_idx on public.order_items(product_id);
create index if not exists store_orders_created_idx on public.store_orders(created_at desc,id);
create index if not exists event_requests_created_idx on public.event_requests(created_at desc,id);

create table nadia_private.submission_limits (key text primary key,started_at timestamptz not null,hits integer not null);
alter table nadia_private.submission_limits disable row level security;
create function nadia_private.throttle_submission(kind text,phone text) returns void language plpgsql security definer set search_path='' as $$
declare k text; n integer; lim integer;
begin
  -- A baseline submission budget; a CAPTCHA/edge limit can be added for sustained attacks.
  delete from nadia_private.submission_limits where started_at < now()-interval '2 hours';
  foreach k in array array[kind||':global:'||to_char(now(),'YYYYMMDDHH24MI'),kind||':phone:'||md5(phone)||':'||to_char(now(),'YYYYMMDDHH24')] loop
    lim:=case when k like '%:global:%' then 30 else 5 end;
    insert into nadia_private.submission_limits as s values(k,now(),1) on conflict(key) do update set hits=s.hits+1 returning hits into n;
    if n>lim then raise exception 'RATE_LIMITED'; end if;
  end loop;
end $$;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
select coalesce((auth.jwt()->'app_metadata'->>'role')='admin',false)
 and (coalesce(auth.jwt()->>'aal','aal1')='aal2' or not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified'));
$$;

create function nadia_private.validate_settings() returns trigger language plpgsql set search_path='' as $$
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
    if r->>'country' not in ('EG','SA') or r->>'country' is null or coalesce(r->>'fee','') !~ '^\d{1,7}(\.\d{1,2})?$' then raise exception 'INVALID_SHIPPING'; end if;
  end loop;
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
create trigger validate_store_settings before insert or update on public.site_content for each row execute function nadia_private.validate_settings();
create function nadia_private.lock_product_currency() returns trigger language plpgsql set search_path='' as $$
begin perform pg_advisory_xact_lock(hashtextextended('nadia-currency',0)); return new; end $$;
create trigger lock_product_currency before insert or update of price on public.products for each statement execute function nadia_private.lock_product_currency();

-- History contains content only, not customer records or payment secrets.
create table public.content_history(id uuid primary key default gen_random_uuid(),content_key text not null,value jsonb not null,changed_by uuid,created_at timestamptz not null default now());
alter table public.content_history enable row level security;
grant select on public.content_history to authenticated;
create policy "admin read content history" on public.content_history for select to authenticated using((select public.is_admin()));
create index content_history_key_created_idx on public.content_history(content_key,created_at desc);
create function nadia_private.archive_content() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.value is distinct from old.value then
   insert into public.content_history(content_key,value,changed_by) values(old.key,old.value,auth.uid());
 end if;
 new.updated_at:=clock_timestamp();return new;
end $$;
create trigger archive_site_content before update on public.site_content for each row execute function nadia_private.archive_content();
create function public.save_site_content(content_key text,content_value jsonb,expected_updated_at timestamptz default null) returns timestamptz language plpgsql security definer set search_path='' as $$
declare ts timestamptz; oldts timestamptz;
begin
 if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
 if length(content_key)>80 or jsonb_typeof(content_value) is distinct from 'object' or octet_length(content_value::text)>200000 then raise exception 'INVALID_CONTENT'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cms:'||content_key,0));
 select updated_at into oldts from public.site_content where key=content_key for update;
 if found then
   if expected_updated_at is distinct from oldts then raise exception 'CONTENT_CHANGED_RELOAD'; end if;
   update public.site_content set value=content_value where key=content_key returning updated_at into ts;
 else
   if expected_updated_at is not null then raise exception 'CONTENT_CHANGED_RELOAD'; end if;
   insert into public.site_content(key,value) values(content_key,content_value) returning updated_at into ts;
 end if;
 return ts;
end $$;
revoke all on function public.save_site_content(text,jsonb,timestamptz) from public,anon;
grant execute on function public.save_site_content(text,jsonb,timestamptz) to authenticated;
-- Require the version-checked write API, rather than last-write-wins upserts.
revoke insert,update,delete on public.site_content from anon,authenticated;

create or replace function public.create_store_order(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.store_orders%rowtype; p public.products%rowtype; item jsonb; rowitem record; settings jsonb; req uuid; fingerprint text; tel text; fld text; qty integer; v_subtotal numeric(12,2):=0; fee numeric(12,2); cur text; ctry text;
begin
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>20000 then raise exception 'INVALID_REQUEST'; end if;
 if jsonb_typeof(payload->'items') is distinct from 'array' then raise exception 'INVALID_ITEMS'; end if;
 if jsonb_array_length(payload->'items') not between 1 and 50 then raise exception 'INVALID_ITEMS'; end if;
 foreach fld in array array['customer_name','phone','governorate','city','address'] loop
   if length(trim(coalesce(payload->>fld,''))) not between 2 and (case when fld='address' then 500 else 120 end) then raise exception 'INVALID_CUSTOMER'; end if;
 end loop;
 tel:=regexp_replace(translate(payload->>'phone','٠١٢٣٤٥٦٧٨٩','0123456789'),'[^0-9]','','g');
 if length(tel) not between 8 and 15 then raise exception 'INVALID_PHONE'; end if;
 if length(coalesce(payload->>'notes',''))>2000 or length(coalesce(payload->>'gift_message',''))>1000 or length(coalesce(payload->>'email',''))>160 then raise exception 'INVALID_CUSTOMER'; end if;
 if coalesce(payload->>'email','')<>'' and payload->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_EMAIL'; end if;
 if coalesce(payload->>'website','')<>'' then raise exception 'INVALID_REQUEST'; end if;
 if coalesce(payload->>'request_id','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' then raise exception 'REQUEST_ID_REQUIRED'; end if;
 req:=(payload->>'request_id')::uuid; fingerprint:=md5((payload-'request_id')::text);
 perform pg_advisory_xact_lock(hashtextextended(req::text,0));
 select * into o from public.store_orders where request_id=req;
 if found then
   if o.request_hash<>fingerprint then raise exception 'REQUEST_CHANGED'; end if;
   return jsonb_build_object('order_id',o.id,'order_number',o.order_number,'total',o.total,'currency',o.currency);
 end if;
 select value into settings from public.site_content where key='settings';
 if not coalesce((settings->>'checkout_enabled')::boolean,false) or not coalesce((settings->>'policies_ready')::boolean,false) then raise exception 'CHECKOUT_UNAVAILABLE'; end if;
 cur:=settings->>'currency';ctry:=payload->>'country';
 if payload->>'currency' is distinct from cur then raise exception 'CHECKOUT_CHANGED'; end if;
 select (value->>'fee')::numeric into fee from jsonb_array_elements(settings->'shipping_rates') where value->>'country'=ctry;
 if fee is null then raise exception 'SHIPPING_UNAVAILABLE'; end if;
 if coalesce(payload->>'shipping_cost','') !~ '^\d{1,7}(\.\d{1,2})?$' or (payload->>'shipping_cost')::numeric<>fee then raise exception 'CHECKOUT_CHANGED'; end if;
 if payload->>'payment_method' is distinct from settings->>'payment_method' or coalesce((payload->>'terms_accepted')::boolean,false)=false then raise exception 'CHECKOUT_CHANGED'; end if;
 for item in select value from jsonb_array_elements(payload->'items') loop
   if coalesce(item->>'product_id','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' or coalesce(item->>'quantity','') !~ '^[1-9][0-9]{0,2}$' then raise exception 'INVALID_ITEMS'; end if;
   if (item->>'quantity')::integer>100 then raise exception 'INVALID_ITEMS'; end if;
 end loop;
 if (select sum((value->>'quantity')::integer) from jsonb_array_elements(payload->'items'))>500 then raise exception 'INVALID_ITEMS'; end if;
 perform nadia_private.throttle_submission('order',tel);
 insert into public.store_orders(order_number,customer_name,phone,email,governorate,city,address,gift_message,notes,language,subtotal,total,currency,country,shipping_cost,payment_method,request_id,request_hash,inventory_reserved)
 values('NPC-'||to_char(now(),'YYMMDD')||'-'||upper(replace(gen_random_uuid()::text,'-','')),trim(payload->>'customer_name'),tel,nullif(trim(payload->>'email'),''),trim(payload->>'governorate'),trim(payload->>'city'),trim(payload->>'address'),nullif(payload->>'gift_message',''),nullif(payload->>'notes',''),case when payload->>'language'='en' then 'en' else 'ar' end,0,fee,cur,ctry,fee,settings->>'payment_method',req,fingerprint,true) returning * into o;
 -- Stable lock order and grouped duplicates prevent overselling and deadlocks.
 for rowitem in select (value->>'product_id')::uuid id,sum((value->>'quantity')::int)::int quantity from jsonb_array_elements(payload->'items') group by 1 order by 1 loop
   qty:=rowitem.quantity;
   if qty>100 then raise exception 'INVALID_ITEMS'; end if;
   select * into p from public.products where id=rowitem.id for update;
   if not found or not p.active or p.price is null or p.price<=0 then raise exception 'PRODUCT_UNAVAILABLE'; end if;
   if p.stock<qty then raise exception 'INSUFFICIENT_STOCK'; end if;
   if exists(select 1 from jsonb_array_elements(payload->'items') x where (x->>'product_id')::uuid=p.id and (coalesce(x->>'unit_price','') !~ '^\d{1,8}(\.\d{1,2})?$' or (x->>'unit_price')::numeric is distinct from p.price)) then raise exception 'CHECKOUT_CHANGED'; end if;
   update public.products set stock=stock-qty where id=p.id;
   v_subtotal:=v_subtotal+p.price*qty;
   insert into public.store_order_items(order_id,product_id,product_name_ar,product_name_en,quantity,unit_price,line_total) values(o.id,p.id,p.name_ar,p.name_en,qty,p.price,p.price*qty);
 end loop;
 update public.store_orders so set subtotal=v_subtotal,total=v_subtotal+fee where so.id=o.id;
 return jsonb_build_object('order_id',o.id,'order_number',o.order_number,'total',v_subtotal+fee,'currency',cur);
end $$;
revoke all on function public.create_store_order(jsonb) from public;
grant execute on function public.create_store_order(jsonb) to anon,authenticated;

create function nadia_private.guard_order_update() returns trigger language plpgsql security definer set search_path='' as $$
declare item record;
begin
 if new.status is distinct from old.status then
   if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
   if not ((old.status='new' and new.status in ('confirmed','cancelled')) or (old.status='confirmed' and new.status in ('processing','cancelled')) or (old.status='processing' and new.status in ('shipped','cancelled')) or (old.status='shipped' and new.status='completed')) then raise exception 'INVALID_STATUS_TRANSITION'; end if;
   if new.status='cancelled' and old.inventory_reserved then
     for item in select product_id,quantity from public.store_order_items where order_id=old.id order by product_id loop
       update public.products set stock=stock+item.quantity where id=item.product_id;
     end loop;
     new.inventory_reserved:=false;
   end if;
 end if;
 return new;
end $$;
create trigger guard_order_update before update on public.store_orders for each row execute function nadia_private.guard_order_update();
revoke update on public.store_orders from authenticated;
grant update(status,payment_status,payment_reference) on public.store_orders to authenticated;

create or replace function public.create_event_request(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.event_requests%rowtype; req uuid; fingerprint text; tel text; fld text; dt date;
begin
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>10000 then raise exception 'INVALID_REQUEST'; end if;
 foreach fld in array array['customer_name','phone','event_type','event_date','city','requirements'] loop
   if length(trim(coalesce(payload->>fld,''))) not between 2 and (case when fld='requirements' then 2000 else 120 end) then raise exception 'INVALID_EVENT'; end if;
 end loop;
 tel:=regexp_replace(translate(payload->>'phone','٠١٢٣٤٥٦٧٨٩','0123456789'),'[^0-9]','','g');
 if length(tel) not between 8 and 15 then raise exception 'INVALID_PHONE'; end if;
 if length(coalesce(payload->>'notes',''))>1000 or length(coalesce(payload->>'venue',''))>180 or length(coalesce(payload->>'email',''))>160 then raise exception 'INVALID_EVENT'; end if;
 if coalesce(payload->>'email','')<>'' and payload->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_EMAIL'; end if;
 if payload->>'event_type' not in ('wedding','engagement','private_event','corporate','other') or coalesce((payload->>'contact_consent')::boolean,false)=false or coalesce(payload->>'website','')<>'' then raise exception 'INVALID_EVENT'; end if;
 dt:=(payload->>'event_date')::date;
 if dt<(now() at time zone 'Africa/Cairo')::date or dt>(now() at time zone 'Africa/Cairo')::date+interval '3 years' then raise exception 'INVALID_EVENT_DATE'; end if;
 if nullif(payload->>'guest_count','') is not null and (payload->>'guest_count')::integer not between 1 and 10000 then raise exception 'INVALID_EVENT'; end if;
 if coalesce(payload->>'request_id','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' then raise exception 'REQUEST_ID_REQUIRED'; end if;
 req:=(payload->>'request_id')::uuid;fingerprint:=md5((payload-'request_id')::text);
 perform pg_advisory_xact_lock(hashtextextended(req::text,0));
 select * into r from public.event_requests where request_id=req;
 if found then
  if r.request_hash<>fingerprint then raise exception 'REQUEST_CHANGED'; end if;
  return jsonb_build_object('request_id',r.id,'request_number',r.request_number);
 end if;
 perform nadia_private.throttle_submission('event',tel);
 insert into public.event_requests(request_number,customer_name,phone,email,event_type,event_date,event_time,city,venue,guest_count,requirements,notes,language,contact_consent,request_id,request_hash)
 values('NEC-'||to_char(now(),'YYMMDD')||'-'||upper(replace(gen_random_uuid()::text,'-','')),trim(payload->>'customer_name'),tel,nullif(trim(payload->>'email'),''),payload->>'event_type',dt,nullif(payload->>'event_time','')::time,trim(payload->>'city'),nullif(payload->>'venue',''),nullif(payload->>'guest_count','')::integer,trim(payload->>'requirements'),nullif(payload->>'notes',''),case when payload->>'language'='en' then 'en' else 'ar' end,true,req,fingerprint) returning * into r;
 return jsonb_build_object('request_id',r.id,'request_number',r.request_number);
end $$;
revoke all on function public.create_event_request(jsonb) from public;
grant execute on function public.create_event_request(jsonb) to anon,authenticated;
revoke all on all functions in schema nadia_private from public,anon,authenticated;
