-- Run this in Supabase → SQL Editor → New query, then Run.
-- Read-only, changes nothing. Checking whether the old, frozen blobs
-- still hold data that's missing from the real tables now.

select 'old blob: storesCatalog entries' as what,
  jsonb_array_length(coalesce(value::jsonb -> 'storesCatalog', '[]'::jsonb))::text as value
from app_storage where key = 'stock-master-data-v2'
union all
select 'old blob: structural items with qty > 0',
  count(*)::text
from app_storage, jsonb_array_elements(coalesce(value::jsonb, '[]'::jsonb)) as elem
where key = 'stock-items-v3'
  and elem->>'mainCat' = 'structural'
  and coalesce((elem->>'qty')::numeric, 0) > 0
union all
select 'old blob: stores items with qty > 0',
  count(*)::text
from app_storage, jsonb_array_elements(coalesce(value::jsonb, '[]'::jsonb)) as elem
where key = 'stock-items-v3'
  and elem->>'mainCat' = 'stores'
  and coalesce((elem->>'qty')::numeric, 0) > 0
union all
select 'old blob: total item count (all categories)',
  jsonb_array_length(coalesce(value::jsonb, '[]'::jsonb))::text
from app_storage where key = 'stock-items-v3'
union all
select 'old items blob last saved at', updated_at::text
from app_storage where key = 'stock-items-v3'
union all
select 'old master blob last saved at', updated_at::text
from app_storage where key = 'stock-master-data-v2';
