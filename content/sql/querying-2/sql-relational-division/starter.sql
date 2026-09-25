-- Counts retakes and optional courses, and loses roles with no requirements.
select
  e.name,
  e.role,
  count(distinct rr.training_id)::int as required,
  (count(distinct rr.training_id) - count(c.id))::int as missing,
  count(distinct rr.training_id) <= count(c.id) as compliant
from employees e
join role_requirements rr on rr.role = e.role
left join completions c on c.employee_id = e.id
group by e.id, e.name, e.role
order by compliant, missing desc, e.name;
