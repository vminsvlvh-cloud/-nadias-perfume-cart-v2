-- Nadia's 20 perfume names — names only, no invented prices/details.
-- Safe to run after the base schema.
insert into public.products (slug,name_ar,name_en,active)
values
  ('fares','فارس','Fares'),
  ('empire','إمباير','Empire'),
  ('legacy','ليغاسي','Legacy'),
  ('asil','أصيل','Asil'),
  ('saif','سيف','Saif'),
  ('shazalia','شاذاليا','Shazalia'),
  ('layali','ليالي','Layali'),
  ('pearl','لؤلؤة','Pearl'),
  ('hikaya','حكاية','Hikaya'),
  ('athar','أثر','Athar'),
  ('moment','لحظة','Moment'),
  ('layan','ليان','Layan'),
  ('abeer','عبير','Abeer'),
  ('secret','سر','Secret'),
  ('sukoon','سكون','Sukoon'),
  ('waad','وعد','Wa''ad'),
  ('liqaa','لقاء','Liqaa'),
  ('naseem','نسيم','Naseem'),
  ('bouh','بوح','Bouh'),
  ('essence','إسنس','Essence')
on conflict (slug) do update
set name_ar=excluded.name_ar, name_en=excluded.name_en;
