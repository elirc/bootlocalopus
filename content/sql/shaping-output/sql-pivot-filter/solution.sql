select
  r.name as region,
  -- One column per month: the same aggregate, each over its own rows.
  -- Half-open date ranges carry the year, which extract(month ...) does not.
  coalesce(sum(s.amount_cents) filter (where s.sold_on >= '2024-01-01' and s.sold_on < '2024-02-01'), 0)::int as jan_cents,
  coalesce(sum(s.amount_cents) filter (where s.sold_on >= '2024-02-01' and s.sold_on < '2024-03-01'), 0)::int as feb_cents,
  coalesce(sum(s.amount_cents) filter (where s.sold_on >= '2024-03-01' and s.sold_on < '2024-04-01'), 0)::int as mar_cents,
  -- A sum over no rows is NULL, and the spreadsheet wants 0.
  coalesce(sum(s.amount_cents), 0)::int as q1_cents,
  count(s.id)::int as sales
from regions r
-- The quarter goes in the join condition: in WHERE it would discard the
-- NULL rows the left join made for regions with no sales in the quarter.
left join sales s
  on s.region_code = r.code
  and s.sold_on >= '2024-01-01'
  and s.sold_on < '2024-04-01'
group by r.code, r.name
order by q1_cents desc, r.name;
