-- Functional dependency: knowing the district tells you the city, so
-- "city = X and district = Y" is no more selective than "district = Y".
create statistics addresses_district_city_stats (dependencies)
  on district, city from addresses;

-- Distinct combinations: there are 50 (city, country) pairs, not
-- 50 cities × 5 countries = 250, which is what GROUP BY estimates assume.
create statistics addresses_city_country_stats (ndistinct)
  on city, country from addresses;

-- CREATE STATISTICS only declares them. ANALYZE computes them.
analyze addresses;
