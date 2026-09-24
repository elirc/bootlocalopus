insert into page_views (page, views, last_seen)
values ('/pricing', 1, now())
on conflict (page) do update
  -- page_views.views is the stored value; excluded.* is the row we proposed.
  set views = page_views.views + 1,
      last_seen = excluded.last_seen
returning page, views;
