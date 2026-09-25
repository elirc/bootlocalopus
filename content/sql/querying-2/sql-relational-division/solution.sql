-- Start from employees so a role with no requirements still has its people.
-- Each correlated count looks only at this employee's *required* trainings.
select
  e.name,
  e.role,
  req.required,
  req.required - req.done as missing,
  req.required = req.done as compliant
from employees e
cross join lateral (
  select
    count(*)::int as required,
    -- EXISTS counts a required training once, however many retakes there were.
    count(*) filter (
      where exists (
        select 1 from completions c
        where c.employee_id = e.id and c.training_id = rr.training_id
      )
    )::int as done
  from role_requirements rr
  where rr.role = e.role
) req
order by compliant, missing desc, e.name;
