with months as (
  -- Start from the calendar, not from the data, so empty months survive.
  select generate_series('2024-01-01'::date, '2024-03-01'::date, interval '1 month')::date
    as month_start
),
monthly as (
  select
    date_trunc('month', o.placed_at)::date as month_start,
    count(*)::int as orders,
    count(distinct o.customer_id)::int as customers,
    sum(o.total_cents)::int as revenue_cents,
    round(avg(o.total_cents))::int as avg_order_cents
  from orders o
  where o.status = 'paid'
  group by 1
),
joined as (
  select
    m.month_start,
    coalesce(mo.orders, 0) as orders,
    coalesce(mo.customers, 0) as customers,
    coalesce(mo.revenue_cents, 0) as revenue_cents,
    coalesce(mo.avg_order_cents, 0) as avg_order_cents
  from months m
  left join monthly mo on mo.month_start = m.month_start
),
windowed as (
  select
    j.*,
    sum(j.revenue_cents) over (order by j.month_start) as running_revenue_cents,
    lag(j.revenue_cents, 1, 0) over (order by j.month_start) as prev_month_cents
  from joined j
)
select
  to_char(w.month_start, 'YYYY-MM') as month,
  w.orders,
  w.customers,
  w.revenue_cents,
  w.avg_order_cents,
  w.running_revenue_cents::int as running_revenue_cents,
  w.prev_month_cents::int as prev_month_cents,
  case
    when w.prev_month_cents = 0 then 0
    else round((w.revenue_cents - w.prev_month_cents) * 100.0 / w.prev_month_cents, 1)
  end as growth_pct
from windowed w
order by w.month_start;
