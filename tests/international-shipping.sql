begin;
do $$ begin
 begin
 update public.site_content set value=value||'{"international_shipping_enabled":false,"shipping_rates":[{"country":"FR","fee":500}]}'::jsonb where key='settings';
 raise exception 'TEST_FAILED_EXTERNAL_ACCEPTED_WHILE_OFF';
 exception when others then if sqlerrm <> 'INTERNATIONAL_SHIPPING_DISABLED' then raise; end if; end;
 update public.site_content set value=value||'{"international_shipping_enabled":true,"shipping_rates":[{"country":"EG","fee":25},{"country":"FR","fee":500}]}'::jsonb where key='settings';
 begin
 update public.site_content set value=jsonb_set(value,'{international_shipping_enabled}','false') where key='settings';
 raise exception 'TEST_FAILED_DISABLED_WITH_LIVE_FOREIGN_RATE';
 exception when others then if sqlerrm <> 'INTERNATIONAL_SHIPPING_DISABLED' then raise; end if; end;
 update public.site_content set value=value||'{"international_shipping_enabled":false,"international_shipping_rates":[{"country":"FR","fee":500}],"shipping_rates":[{"country":"EG","fee":25}]}'::jsonb where key='settings';
end $$;
select 'PASS: international destinations require opt-in; draft rates can be retained while off' as result;
rollback;
