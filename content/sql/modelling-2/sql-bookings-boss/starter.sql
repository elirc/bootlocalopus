create table bookings (
  id serial primary key,
  room_id int not null references rooms(id),
  booked_by text not null,
  attendees int not null,
  during tstzrange not null,
  cancelled_at timestamptz
  -- TODO: the checks on during, and the exclusion constraint
);

-- TODO: the capacity trigger

create function free_rooms(p_during tstzrange, p_attendees int)
returns table (room_id int, name text, capacity int)
language sql stable as $$
  -- TODO: only rooms that fit and are free
  select r.id, r.name, r.capacity from rooms r order by r.id;
$$;
