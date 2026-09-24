`signups_raw` is what happens when a spreadsheet becomes a table: the
company name and country repeat on every row, so a rename has to be applied in
a hundred places and one typo creates a second company.

The fixture already contains:

```sql
signups_raw(id, person_name, person_email, company_name, company_country)
```

## Task

In one script:

1. Create `companies(id serial primary key, name text not null unique,
   country text not null)`.
2. Create `people(id serial primary key, name text not null,
   email text not null unique, company_id int not null references companies(id))`.
3. Populate `companies` with the **distinct** companies from the raw table.
4. Populate `people` with every person, pointing at the right company.

Do not hardcode company names or ids — the graders run against the data, and
your script must work if a row is added.