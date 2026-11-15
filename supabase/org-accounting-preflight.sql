-- Read-only inventory for an SNS migration. Review alongside the sync preflight.
with records as (
  select org_id, kind, data from public.v2_records where org_id is not null
), documents as (
  select org_id, kind, data from records where kind in ('sales','purchases','returns')
)
select 'legacy_sale_without_posting' as check_name, count(*) as affected
from documents where kind = 'sales' and not (data ? 'posting')
union all
select 'legacy_purchase_without_posting', count(*)
from documents where kind = 'purchases' and not (data ? 'posting')
union all
select 'legacy_return_without_posting', count(*)
from documents where kind = 'returns' and not (data ? 'posting')
union all
select 'settlement_or_invoice_without_date', count(*)
from records where kind in ('sales','purchases','returns','cash')
  and coalesce(data->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
union all
select 'unverified_legacy_purchase_order_receipts', count(*)
from records orders where kind = 'purchaseOrders' and data->>'status' = 'received'
  and not exists (select 1 from documents invoice where invoice.kind = 'purchases' and invoice.org_id = orders.org_id
     and invoice.data->>'purchaseOrderId' = orders.data->>'id');
