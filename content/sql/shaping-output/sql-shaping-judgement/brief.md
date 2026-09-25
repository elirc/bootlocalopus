Building API responses in SQL removes round trips and whole classes of N+1
bugs, and it moves decisions into the database that used to live in a
serializer: which fields are public, what "none" looks like, how numbers
survive the trip into JavaScript, and what order an array is in.

None of those decisions is hard. All of them are easy to make by accident,
and each one shows up in production as a client bug rather than a server
error. These questions are the review comments worth leaving on a pull
request that shapes JSON in SQL.
