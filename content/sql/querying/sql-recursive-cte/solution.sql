with recursive tree as (
  -- Anchor: every root, at depth 0, its path being just its own name.
  select
    c.id,
    c.name,
    0 as depth,
    c.name as path,
    c.name as root_name
  from categories c
  where c.parent_id is null

  union all

  -- Step: children of anything already in the tree.
  select
    c.id,
    c.name,
    t.depth + 1 as depth,
    t.path || ' > ' || c.name as path,
    t.root_name
  from categories c
  join tree t on c.parent_id = t.id
)
select id, name, depth::int as depth, path, root_name
from tree
order by path;
