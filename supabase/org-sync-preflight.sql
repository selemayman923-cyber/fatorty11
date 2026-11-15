-- Read-only. Output contains counts, with no record contents or identifiers.
select 'duplicate_record_keys' as check_name, count(*) as affected
from (select 1 from public.v2_records where org_id is not null
      group by org_id, kind, local_id having count(*) > 1) d
union all
select 'duplicate_settings_keys', count(*)
from (select 1 from public.v2_settings where org_id is not null
      group by org_id having count(*) > 1) d
union all
select 'org_records_missing_local_id', count(*)
from public.v2_records where org_id is not null and nullif(btrim(local_id), '') is null
union all
select 'legacy_product_kind', count(*)
from public.v2_records where org_id is not null and kind = 'product'
union all
select 'legacy_records_without_org', count(*)
from public.v2_records where org_id is null;
