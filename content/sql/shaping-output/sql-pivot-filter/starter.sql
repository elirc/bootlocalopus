-- One row per region per month. The spreadsheet wants one row per region
-- with a column per month.
select
  r.name as region,
  extract(month from s.sold_on)::int as month,
  sum(s.amount_cents)::int as amount_cents
from regions r
join sales s on s.region_code = r.code
group by r.name, extract(month from s.sold_on)
order by r.name, month;
