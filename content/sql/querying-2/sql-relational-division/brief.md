"Which employees have completed **every** training their role requires?" is
a question about *all*, and SQL has no `for all`. It is called relational
division, and the two sound ways to write it are:

- **Double negation**: there is no required training that the person has
  not completed — `not exists (required ... where not exists (completion ...))`.
- **Counting**: the number of *distinct required* trainings they completed
  equals the number required.

The counting version has three traps, and the data here has all of them:

1. **Retakes.** People complete a training twice; `count(*)` counts both.
   Count distinct training ids.
2. **Extra trainings.** Completing an optional course must not make up for a
   missing required one. Count only completions of *required* trainings.
3. **Nothing required.** A role with no required trainings is compliant by
   definition. An inner join to the requirements drops those people entirely.

The fixture has `employees(id, name, role)`, `trainings(id, title)`,
`role_requirements(role, training_id)` and `completions(id, employee_id,
training_id, completed_on)`.

## Task

One query, one row per **employee**:

| column | value |
| --- | --- |
| `name` | |
| `role` | |
| `required` | how many trainings their role requires (an integer, 0 if none) |
| `missing` | how many of those they have **not** completed (an integer) |
| `compliant` | `true` when `missing` is 0 |

Order by `compliant` (non-compliant first), then `missing` descending, then
`name`.
