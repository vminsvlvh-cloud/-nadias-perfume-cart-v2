-- Run as a database owner. Everything, including fixtures, is rolled back.
begin;
do $$
declare p uuid; req uuid:=gen_random_uuid(); result jsonb; again jsonb; payload jsonb; n integer; stamp timestamptz; nextstamp timestamptz;
begin
 insert into public.products(slug,name_ar,name_en,description_ar,description_en,image_url,price,stock) values('regression-'||replace(gen_random_uuid()::text,'-',''),'اختبار','Test','وصف','Description','https://example.invalid/test.webp',100,3) returning id into p;
 update public.site_content set value=value||'{"checkout_enabled":true,"policies_ready":true,"payment_method":"manual","shipping_rates":[{"country":"EG","fee":25}]}'::jsonb where key='settings';
 payload:=jsonb_build_object('customer_name','Regression test','phone','00000000000','governorate','Test','city','Test','address','Test address','country','EG','currency','EGP','shipping_cost',25,'payment_method','manual','terms_accepted',true,'request_id',req,'items',jsonb_build_array(jsonb_build_object('product_id',p,'quantity',2,'unit_price',100)));
 result:=public.create_store_order(payload);again:=public.create_store_order(payload);
 if result<>again then raise exception 'Retry was not idempotent'; end if;
 select stock into n from public.products where id=p;
 if n<>1 or (result->>'total')::numeric<>225 then raise exception 'Inventory/total mismatch'; end if;
 begin perform public.create_store_order(jsonb_set(payload,'{request_id}',to_jsonb(gen_random_uuid())));raise exception 'Oversell allowed';exception when others then if sqlerrm<>'INSUFFICIENT_STOCK' then raise; end if;end;
 begin perform public.create_store_order(payload-'items');raise exception 'Empty order allowed';exception when others then if sqlerrm<>'INVALID_ITEMS' then raise;end if;end;
 begin perform public.create_store_order(jsonb_set(payload,'{items}', 'null'));raise exception 'Null items allowed';exception when others then if sqlerrm<>'INVALID_ITEMS' then raise;end if;end;
 begin perform public.create_store_order(jsonb_set(jsonb_set(payload,'{request_id}',to_jsonb(gen_random_uuid())),'{items,0,quantity}','0'));raise exception 'Zero quantity allowed';exception when others then if sqlerrm<>'INVALID_ITEMS' then raise;end if;end;
 begin perform public.create_store_order(jsonb_set(payload,'{customer_name}','"Different request"'));raise exception 'Token reused for different data';exception when others then if sqlerrm<>'REQUEST_CHANGED' then raise;end if;end;
 perform set_config('request.jwt.claims','{"app_metadata":{"role":"admin"},"aal":"aal2"}',true);
 update public.store_orders set status='cancelled' where id=(result->>'order_id')::uuid;
 select stock into n from public.products where id=p;if n<>3 then raise exception 'Cancellation failed to restore stock';end if;
 update public.store_orders set status='cancelled' where id=(result->>'order_id')::uuid;
 select stock into n from public.products where id=p;if n<>3 then raise exception 'Duplicate restock';end if;
 begin update public.store_orders set status='confirmed' where id=(result->>'order_id')::uuid;raise exception 'Cancelled order reopened';exception when others then if sqlerrm<>'INVALID_STATUS_TRANSITION' then raise;end if;end;
 begin perform public.create_store_order(jsonb_set(jsonb_set(payload,'{request_id}',to_jsonb(gen_random_uuid())),'{items,0,unit_price}','1'));raise exception 'Price mismatch accepted';exception when others then if sqlerrm<>'CHECKOUT_CHANGED' then raise;end if;end;
 begin update public.site_content set value=jsonb_set(value,'{currency}','"SAR"') where key='settings';raise exception 'Priced catalog relabelled';exception when others then if sqlerrm<>'CURRENCY_LOCKED_REPRICE_REQUIRED' then raise;end if;end;
 begin perform public.create_store_order(jsonb_set(jsonb_set(payload,'{request_id}',to_jsonb(gen_random_uuid())),'{items}',jsonb_build_array(jsonb_build_object('product_id',p,'quantity',2,'unit_price',100),jsonb_build_object('product_id',p,'quantity',2,'unit_price',100))));raise exception 'Duplicate items oversold';exception when others then if sqlerrm<>'INSUFFICIENT_STOCK' then raise;end if;end;
 select updated_at into stamp from public.site_content where key='page_story';
 nextstamp:=public.save_site_content('page_story','{"title_ar":"اختبار","title_en":"Test"}',stamp);
 begin perform public.save_site_content('page_story','{}',stamp);raise exception 'Stale content overwritten';exception when others then if sqlerrm<>'CONTENT_CHANGED_RELOAD' then raise;end if;end;
 if not exists(select 1 from public.content_history where content_key='page_story') then raise exception 'Content history missing';end if;
 update public.products set stock=0 where id=p;
 begin update public.site_content set value=jsonb_set(value,'{checkout_enabled}','false') where key='settings';update public.site_content set value=jsonb_set(value,'{checkout_enabled}','true') where key='settings';raise exception 'Checkout enabled without completed products';exception when others then if sqlerrm<>'PRODUCTS_REQUIRED' then raise;end if;end;
 -- Guest cannot become an admin through editable user metadata.
 perform set_config('request.jwt.claims','{"role":"anon","user_metadata":{"role":"admin"}}',true);
 if public.is_admin() then raise exception 'User metadata escalates privilege';end if;
 begin perform public.save_site_content('page_story','{}',nextstamp);raise exception 'Guest can edit content';exception when others then if sqlerrm<>'ADMIN_REQUIRED' then raise;end if;end;
 payload:=jsonb_build_object('customer_name','Event test','phone','00000000001','city','Test','requirements','Test requirements','event_type','wedding','event_date',(current_date+30)::text,'contact_consent',true,'request_id',gen_random_uuid());
 result:=public.create_event_request(payload);again:=public.create_event_request(payload);if result<>again then raise exception 'Event retry duplicated';end if;
 begin perform public.create_event_request(jsonb_set(payload,'{event_date}',to_jsonb((current_date-1)::text)));raise exception 'Past event accepted';exception when others then if sqlerrm<>'INVALID_EVENT_DATE' then raise;end if;end;
 -- Six distinct requests with the same phone exceed the hourly baseline.
 for n in 1..4 loop perform public.create_event_request(jsonb_set(payload,'{request_id}',to_jsonb(gen_random_uuid())));end loop;
 begin perform public.create_event_request(jsonb_set(payload,'{request_id}',to_jsonb(gen_random_uuid())));raise exception 'Rate limit not enforced';exception when others then if sqlerrm<>'RATE_LIMITED' then raise;end if;end;
end $$;
select 'PASS: order totals, stock, retries, cancellation, product checks, validation, currency, CMS conflicts, roles, events and rate limits' as result;
rollback;
