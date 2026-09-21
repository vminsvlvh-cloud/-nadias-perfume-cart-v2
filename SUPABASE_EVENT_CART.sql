-- Nadia’s Bespoke Event Cart — booking & coordination
-- Run AFTER the existing Nadia's V2 schema. Safe to run once.

create table if not exists public.event_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text unique not null,
  customer_name text not null,
  phone text not null,
  email text,
  event_type text not null,
  event_date date not null,
  event_time time,
  city text not null,
  venue text,
  guest_count integer check (guest_count is null or guest_count > 0),
  requirements text not null,
  notes text,
  language text default 'ar',
  contact_consent boolean not null default false,
  status text not null default 'new' check (status in ('new','contacted','planning','quoted','confirmed','completed','cancelled')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.event_requests enable row level security;

drop policy if exists "admin read event requests" on public.event_requests;
create policy "admin read event requests" on public.event_requests
for select to authenticated using (public.is_admin());

drop policy if exists "admin update event requests" on public.event_requests;
create policy "admin update event requests" on public.event_requests
for update to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.create_event_request(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rid uuid;
  rno text;
  guests integer;
begin
  if coalesce(length(trim(payload->>'customer_name')),0) < 2 then raise exception 'invalid name'; end if;
  if coalesce(length(trim(payload->>'phone')),0) < 7 then raise exception 'invalid phone'; end if;
  if coalesce(length(trim(payload->>'event_type')),0) < 2 then raise exception 'invalid event type'; end if;
  if nullif(payload->>'event_date','') is null then raise exception 'event date required'; end if;
  if coalesce(length(trim(payload->>'city')),0) < 2 then raise exception 'city required'; end if;
  if coalesce(length(trim(payload->>'requirements')),0) < 5 then raise exception 'requirements required'; end if;
  if coalesce((payload->>'contact_consent')::boolean,false) is not true then raise exception 'contact consent required'; end if;

  guests := nullif(payload->>'guest_count','')::integer;
  rno := 'NEC-' || to_char(now(),'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));

  insert into public.event_requests(
    request_number,customer_name,phone,email,event_type,event_date,event_time,city,venue,
    guest_count,requirements,notes,language,contact_consent
  ) values (
    rno,trim(payload->>'customer_name'),trim(payload->>'phone'),nullif(trim(payload->>'email'),''),
    trim(payload->>'event_type'),(payload->>'event_date')::date,nullif(payload->>'event_time','')::time,
    trim(payload->>'city'),nullif(trim(payload->>'venue'),''),guests,trim(payload->>'requirements'),
    nullif(trim(payload->>'notes'),''),coalesce(payload->>'language','ar'),true
  ) returning id into rid;

  return jsonb_build_object('request_id',rid,'request_number',rno);
end $$;

revoke all on function public.create_event_request(jsonb) from public;
grant execute on function public.create_event_request(jsonb) to anon, authenticated;

drop trigger if exists set_event_requests_updated_at on public.event_requests;
create trigger set_event_requests_updated_at before update on public.event_requests
for each row execute function public.set_updated_at();
