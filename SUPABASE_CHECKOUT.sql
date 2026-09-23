-- Nadia's Perfume Cart V2 — secure checkout migration
-- Run once in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  customer_name text not null,
  phone text not null,
  email text,
  governorate text not null,
  city text not null,
  address text not null,
  notes text,
  gift_message text,
  language text default 'ar',
  status text not null default 'new',
  total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.store_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.store_orders(id) on delete cascade,
  product_id uuid,
  slug text not null,
  product_name_ar text,
  product_name_en text,
  unit_price numeric(12,2),
  quantity integer not null check (quantity > 0),
  line_total numeric(12,2),
  created_at timestamptz not null default now()
);

alter table public.store_orders enable row level security;
alter table public.store_order_items enable row level security;

drop policy if exists "admin read store orders" on public.store_orders;
create policy "admin read store orders" on public.store_orders for select to authenticated using (public.is_admin());
drop policy if exists "admin update store orders" on public.store_orders;
create policy "admin update store orders" on public.store_orders for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin read store order items" on public.store_order_items;
create policy "admin read store order items" on public.store_order_items for select to authenticated using (public.is_admin());

create or replace function public.create_store_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  oid uuid;
  ono text;
  item jsonb;
  p record;
  q integer;
  total_amount numeric(12,2) := 0;
begin
  if coalesce(length(trim(payload->>'customer_name')),0) < 2 then raise exception 'invalid name'; end if;
  if coalesce(length(trim(payload->>'phone')),0) < 7 then raise exception 'invalid phone'; end if;
  if coalesce(length(trim(payload->>'address')),0) < 5 then raise exception 'invalid address'; end if;
  if jsonb_array_length(coalesce(payload->'items','[]'::jsonb)) < 1 then raise exception 'empty order'; end if;

  ono := 'NPC-' || to_char(now(),'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into public.store_orders(order_number,customer_name,phone,email,governorate,city,address,notes,gift_message,language)
  values(ono,trim(payload->>'customer_name'),trim(payload->>'phone'),nullif(trim(payload->>'email'),''),
    trim(payload->>'governorate'),trim(payload->>'city'),trim(payload->>'address'),
    nullif(trim(payload->>'notes'),''),nullif(trim(payload->>'gift_message'),''),coalesce(payload->>'language','ar'))
  returning id into oid;

  for item in select * from jsonb_array_elements(payload->'items')
  loop
    q := greatest(1,least(20,coalesce((item->>'qty')::integer,1)));
    select * into p from public.products where slug=item->>'slug' and active=true limit 1;
    if not found then raise exception 'product unavailable'; end if;
    if p.price is null then raise exception 'product price missing'; end if;
    if p.stock is not null and p.stock < q then raise exception 'insufficient stock'; end if;

    insert into public.store_order_items(order_id,product_id,slug,product_name_ar,product_name_en,unit_price,quantity,line_total)
    values(oid,p.id,p.slug,p.name_ar,p.name_en,p.price,q,p.price*q);
    total_amount := total_amount + p.price*q;
  end loop;

  update public.store_orders set total=total_amount where id=oid;
  return jsonb_build_object('order_id',oid,'order_number',ono,'total',total_amount);
exception when others then
  raise;
end $$;

revoke all on function public.create_store_order(jsonb) from public;
grant execute on function public.create_store_order(jsonb) to anon, authenticated;


-- Editable storefront content used by the Admin home-page editor.
create table if not exists public.site_content (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.site_content enable row level security;
drop policy if exists "public read site content" on public.site_content;
create policy "public read site content" on public.site_content for select to anon, authenticated using (true);
drop policy if exists "admin insert site content" on public.site_content;
create policy "admin insert site content" on public.site_content for insert to authenticated with check (public.is_admin());
drop policy if exists "admin update site content" on public.site_content;
create policy "admin update site content" on public.site_content for update to authenticated using (public.is_admin()) with check (public.is_admin());
