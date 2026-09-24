A transaction gives you atomicity — all or nothing. It does **not**
automatically give you protection from concurrent writers; that depends on the
isolation level and on how you write the query.