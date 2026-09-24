import { loadChapter } from '../../load.ts';

const here = import.meta.dirname;

export default loadChapter(here, {
  id: 'craft-systems',
  title: 'Systems Thinking',
  summary: 'Caching, observability, scoping work honestly, and running an incident.',
  lessons: [
    {
      id: 'craft-caching',
      title: 'Caching without lying to users',
      kind: 'quiz',
      xp: 70,
      why: 'Caching is the first thing suggested when something is slow, and the first thing to cause a baffling bug.',
      tags: ['caching', 'performance', 'architecture'],
      quiz: [
        {
          q: 'An endpoint is slow. Which should you do before adding a cache?',
          options: [
            'Measure where the time actually goes',
            'Add a Redis layer, then measure the improvement',
            'Increase the instance size',
            'Cache in memory first as it is simpler',
          ],
          answer: [0],
          explain: 'A cache in front of an N+1 query or a missing index hides a problem you could have deleted instead, and it adds an invalidation bug surface forever. Measure first: the fix is often one index or one join.',
        },
        {
          q: 'A cache stampede: a popular key expires and many concurrent requests all miss and recompute it at once, hammering the database. Which of these mitigate it? Select all that apply.',
          options: [
            'Serve the stale value while one background refresh recomputes it (stale-while-revalidate)',
            'A lock or single-flight so only one request recomputes while others wait or serve stale',
            'Jittered expiry times, so keys do not all expire together',
            'A longer TTL, which makes the problem disappear',
          ],
          answer: [0, 1, 2],
          explain: 'Stale-while-revalidate and single-flight both make sure one request, not thousands, does the recompute; jitter stops many keys expiring in the same second. A longer TTL only makes the stampede rarer and worse when it happens — and staleness is the price. The instinct to reach for a longer TTL is exactly what turns a slow endpoint into a periodic outage.',
        },
        {
          q: 'You cache a user\'s dashboard by URL at the CDN. What is the risk?',
          options: [
            'Serving one user\'s personalised page to another, because the URL is the same and the cache key omits identity',
            'The cache will be too small',
            'CDNs cannot cache HTML',
            'The page will be slower on the first request',
          ],
          answer: [0],
          explain: 'This is the classic and most damaging caching bug. Anything personalised must either not be cached at a shared layer, or be keyed by identity and marked `Cache-Control: private`. Getting it wrong is a data-leak incident, not a performance regression.',
        },
        {
          q: 'Which invalidation strategy is most robust for data that must not appear stale after a write?',
          options: [
            'Write-through or explicit invalidation on write, so the cache is updated or dropped as part of the change',
            'A short TTL and accepting the window',
            'Clearing the whole cache on every deploy',
            'Reading through the cache and hoping the TTL is short enough',
          ],
          answer: [0],
          explain: 'If correctness after a write is required, the write must be responsible for the cache. TTLs are a fine choice when a bounded staleness window is genuinely acceptable — and saying so explicitly is the engineering, rather than picking 60 seconds because it feels safe.',
        },
        {
          q: 'Which of these are reasonable things to cache with a short TTL and little risk? Select all.',
          options: [
            'A public list of product categories that changes weekly',
            'An expensive aggregate report that is recomputed nightly anyway',
            'Feature flag values, with a few seconds of staleness',
            'A user\'s current account balance shown before a payment',
          ],
          answer: [0, 1, 2],
          explain: 'Public, slow-changing, and already-approximate data are ideal. A balance shown immediately before a money decision is not: the cost of being stale is a failed or duplicated payment. The question is always what a wrong answer costs.',
        },
        {
          q: 'What does `Cache-Control: no-store` mean, versus `no-cache`?',
          options: [
            '`no-store` forbids storing the response anywhere; `no-cache` allows storing but requires revalidation before reuse',
            'They are synonyms',
            '`no-cache` forbids caching; `no-store` only applies to disk',
            '`no-store` applies to CDNs only',
          ],
          answer: [0],
          explain: 'The names are genuinely misleading. `no-cache` means "check with me first" — the response may be stored and reused after a successful revalidation. `no-store` means do not write it down at all, which is what you want for sensitive responses.',
        },
      ],
    },
    {
      id: 'craft-observability',
      title: 'Making a service explain itself',
      kind: 'quiz',
      xp: 70,
      why: 'On-call is where you find out whether your logs were written for a human at 3am.',
      tags: ['observability', 'logging', 'operations'],
      quiz: [
        {
          q: 'Which log line is more useful during an incident?',
          options: [
            '`logger.info({ event: "payment_failed", orderId, userId, provider, status, durationMs }, "payment failed")`',
            '`console.log("payment failed!")`',
            '`console.log("payment failed for " + JSON.stringify(order))`',
            '`logger.error(error)`',
          ],
          answer: [0],
          explain: 'Structured fields are queryable: you can filter by provider, group by status, and correlate by orderId. A prose string is only greppable, and dumping a whole object logs personal data you did not intend to keep and buries the fields you need.',
        },
        {
          q: 'Which of these belong in every request log line? Select all.',
          options: [
            'A request or trace id that ties all lines for one request together',
            'The route, method and status',
            'Duration in milliseconds',
            'The full request body',
          ],
          answer: [0, 1, 2],
          explain: 'Identity, shape and timing let you reconstruct any single request and aggregate across all of them. Full bodies are the fastest route to logging passwords and card numbers, and they blow up your storage bill — log a size, or specific whitelisted fields.',
        },
        {
          q: 'You want to know whether the API is healthy for users. Which metric is most informative?',
          options: [
            'p95 and p99 latency plus error rate, per route',
            'Average latency across all routes',
            'CPU usage',
            'Total request count',
          ],
          answer: [0],
          explain: 'Averages hide the users having a bad time: a p99 of 8 seconds disappears into a 200ms mean. Splitting by route stops a fast health check from masking a slow checkout. CPU is a cause you investigate after you know users are affected.',
        },
        {
          q: 'Why is putting a user id in a metric label a problem?',
          options: [
            'Cardinality: each distinct label value creates a separate time series, and millions of users will overwhelm the metrics backend',
            'It is not allowed by the protocol',
            'Metrics cannot hold strings',
            'It makes dashboards render slowly, but is otherwise fine',
          ],
          answer: [0],
          explain: 'High-cardinality dimensions belong in logs or traces, which are per-event; metrics are pre-aggregated and cost memory per unique label combination. Blowing up cardinality is a common way to take down your own monitoring during the incident you need it for.',
        },
        {
          q: 'A request crosses three services and is slow. Which tool answers "where did the time go?"',
          options: [
            'A distributed trace, showing each span and its duration',
            'The error log',
            'A latency histogram for the entry service',
            'CPU graphs for all three services',
          ],
          answer: [0],
          explain: 'That is exactly what tracing is for: one request, broken into timed spans across service boundaries. Metrics tell you *that* it is slow; the trace tells you *which hop*. Without one you are reduced to correlating timestamps across three log streams.',
        },
        {
          q: 'Which of these should trigger a page (wake someone up)? Select all.',
          options: [
            'Checkout error rate above 5% for five minutes',
            'The service is returning 503 to all requests',
            'A single caught-and-handled 500 in a background job',
            'Disk 80% full and rising at a rate that hits 100% in two hours',
          ],
          answer: [0, 1, 3],
          explain: 'Page on user-visible impact or on a trajectory that becomes impact soon. A single handled error is a ticket, not an alarm. Alerting on everything trains people to ignore the pager, which is worse than not alerting at all.',
        },
        {
          q: 'What is the most useful thing to add to a log line for a caught exception?',
          options: [
            'The error message, its type, the stack, and the context needed to reproduce it (ids, inputs, which branch)',
            'The error message only',
            'A note that it was handled',
            'The full environment variables, for completeness',
          ],
          answer: [0],
          explain: 'Type and stack tell you what and where; the ids and inputs tell you which case, so you can reproduce it without guessing. Environment variables are how secrets end up in your log aggregator, permanently.',
        },
      ],
    },
    {
      id: 'craft-scoping',
      title: 'Scoping and estimating honestly',
      kind: 'quiz',
      xp: 70,
      why: 'Mid-level means being handed a vague problem instead of a defined task. How you break it down is the job.',
      tags: ['planning', 'estimation', 'communication'],
      quiz: [
        {
          q: 'You are asked "how long will the notifications feature take?" and you genuinely do not know. Best answer?',
          options: [
            'Two weeks (pick something plausible so you are not blocking)',
            'Name the unknowns, give a range with the assumptions behind it, and offer a short spike to shrink the range',
            'I cannot estimate this',
            'Whatever you need it to be',
          ],
          answer: [1],
          explain: 'A range plus assumptions is an honest, actionable answer: it tells the asker what would make it faster and what could make it slower. A confident single number invented to avoid the conversation is the root of most missed deadlines.',
        },
        {
          q: 'Which of these are good ways to break down a two-week feature? Select all.',
          options: [
            'Vertical slices that each deliver something demonstrable end to end',
            'Riskiest or most uncertain part first',
            'A slice that can ship behind a feature flag without the rest being finished',
            'All the backend first, then all the frontend, then integrate',
          ],
          answer: [0, 1, 2],
          explain: 'Vertical slices give you feedback and a shippable increment at every step. Front-loading risk means you learn the bad news in week one rather than week two. Horizontal layers hide integration problems until the end, which is precisely when there is no time left.',
        },
        {
          q: 'Halfway through, you discover the approach will not work and needs a different design costing another week. What do you do?',
          options: [
            'Tell your lead now, with the options and what you would recommend',
            'Work extra hours to hide the slip',
            'Ship the broken approach and fix it later',
            'Wait for the next stand-up in case you find a shortcut',
          ],
          answer: [0],
          explain: 'Bad news early is cheap; bad news late is expensive, because the options shrink with the remaining time. Coming with options and a recommendation is what makes it a professional escalation rather than a problem handed over.',
        },
        {
          q: 'The deadline is fixed and the scope will not fit. Which are legitimate levers? Select all.',
          options: [
            'Cut scope: ship the core case and defer the edge cases explicitly',
            'Reduce quality of things that are cheap to redo, deliberately and visibly',
            'Add people to the task in the final week',
            'Ship behind a flag to a subset of users',
          ],
          answer: [0, 1, 3],
          explain: 'Scope, deliberate and recorded quality trade-offs, and staged rollout are all real. Adding people late usually slows things down — onboarding cost lands exactly when you have least slack. Saying which of these you are pulling, out loud, is the difference between a plan and a hope.',
        },
        {
          q: 'Why do estimates so consistently come in low?',
          options: [
            'We estimate the happy path and forget review, testing, deployment, edge cases, meetings and the other work already on our plate',
            'Engineers are optimists by nature',
            'Managers pressure us into low numbers',
            'The work genuinely changes scope every time',
          ],
          answer: [0],
          explain: 'The coding is the part we can picture, so it is the part we cost. Everything around it — review latency, the test that turns out to be flaky, the migration, the two meetings, the interrupt from on-call — is real work that was never in the number. Estimating the whole path to production, not the coding, is what makes an estimate land.',
        },
        {
          q: 'A ticket says "make the dashboard faster". What is the first thing to do?',
          options: [
            'Ask what "faster" means and for whom: which view, which measure, what target, and what problem prompted it',
            'Add caching everywhere',
            'Profile and start optimising the slowest thing you find',
            'Estimate three days and begin',
          ],
          answer: [0],
          explain: 'Without a definition of done you cannot know when to stop, or whether you fixed the thing the reporter cared about. "The team lead\'s 8,000-row view takes 30 seconds and should take under 3" is a task; "make it faster" is a feeling. Profiling comes second, once you know which number you are moving.',
        },
      ],
    },
    {
      id: 'craft-incident',
      title: 'BOSS: the 3am page',
      kind: 'quiz',
      xp: 200,
      boss: true,
      why: 'Incident response is where every skill in this track gets tested at once, under time pressure, with people watching.',
      tags: ['incidents', 'operations', 'debugging', 'communication'],
      quiz: [
        {
          q: 'Step 1, 03:08. What do you do first?',
          options: [
            'Start reading the deploy diff to find the bug',
            'Roll back the 02:45 deploy — it is the obvious suspect and rollback is fast and reversible',
            'Scale up the service in case it is load',
            'Restart every instance — it clears whatever bad state they have got into',
          ],
          answer: [1],
          explain: 'Mitigate before you understand. A deploy immediately before the onset is the highest-prior suspect, and a rollback is the cheapest reversible action available. Reading the diff is diagnosis — valuable, but it does not stop customers failing to check out. Scaling and restarting treat symptoms: the bad code is still running, and a restart destroys the state you would diagnose from. If rollback does not help, you have also learned something important.',
        },
        {
          q: 'Step 2, 03:09. Before or while rolling back, what else must happen?',
          options: [
            'Nothing until you know the cause — announcing early causes panic',
            'Post in the incident channel: what is broken, the impact, that you are rolling back, and when you will next update',
            'Finish the rollback first, then post a single message with the outcome',
            'Open a ticket for the bug',
          ],
          answer: [1],
          explain: 'Communicate immediately and on a cadence. Others may be seeing symptoms, someone may know about a change you do not, and support needs to answer customers. A short "what, impact, action, next update in 15 minutes" costs nothing and prevents three people independently investigating.',
        },
        {
          q: 'Step 3, 03:14. The rollback finished and the error rate is falling. Are you done?',
          options: [
            'Yes — the alert has cleared, so the incident is over',
            'No — confirm recovery with the metric, check whether anything needs repairing (stuck orders, queued jobs), then hand over or write up',
            'No — immediately deploy a forward fix so it is not blocked tomorrow',
            'Yes, once you post that it is resolved',
          ],
          answer: [1],
          explain: 'Mitigation is not the end. Verify with the same signal that alerted you, then look for damage the failure left: half-completed checkouts, retries piling up, a dead-letter queue. Writing a forward fix at 03:14 with no sleep is how the second incident starts.',
        },
        {
          q: 'Step 4, 03:20. You look at the diff. It added a call to a new pricing service inside the checkout path, with no timeout. What was the actual failure mode?',
          options: [
            'The pricing service was slow or down, so checkout requests hung and exhausted the connection pool or request handlers',
            'The pricing service returned errors that checkout did not catch, so every checkout threw',
            'A traffic spike at 02:45 happened to coincide with the deploy',
            'Checkout ran out of memory because of the extra object',
          ],
          answer: [0],
          explain: 'The clue is "no timeout": unhandled errors would fail fast and loudly, but a missing timeout fails slowly. A dependency with no timeout converts someone else\'s latency into your outage. Requests pile up waiting, the pool or worker count saturates, and requests that never touch pricing start failing too. This is the single most common cause of a cascading failure in a service-oriented system.',
        },
        {
          q: 'Step 5. Which of these belong in the forward fix? Select all.',
          options: [
            'An aggressive timeout on the pricing call',
            'A fallback: proceed with the last known price, or fail that one feature rather than all of checkout',
            'A circuit breaker so a sustained failure stops being retried',
            'A retry loop with no limit, so it eventually succeeds',
          ],
          answer: [0, 1, 2],
          explain: 'Timeout, fallback and circuit breaker are the standard trio: bound the wait, degrade gracefully, and stop hammering something that is already down. An unbounded retry loop makes it worse — you turn a partial outage into a self-inflicted denial of service against your own dependency.',
        },
        {
          q: 'Step 6. The alert fired after five minutes at over 20%. What does that suggest about your monitoring?',
          options: [
            'It worked, but consider whether a tighter threshold or shorter window would have caught it sooner, weighed against false pages',
            'It is fine as is — never touch a working alert',
            'Alert on any single 5xx instead',
            'Five minutes was far too slow: page at 5% over one minute, whatever it costs in false pages',
          ],
          answer: [0],
          explain: 'The honest answer is a trade-off, not a fix. Faster detection means more false pages, and a pager that cries wolf gets ignored. What is often more valuable than a tighter threshold is a *better* signal — alerting on the dependency\'s latency, or on saturation of the request pool, would have caught the cause rather than the symptom.',
        },
        {
          q: 'Step 7. The postmortem. Which statements make it a useful one? Select all.',
          options: [
            'A timeline with timestamps: onset, detection, mitigation, resolution',
            'Blameless framing: how the system allowed the change to cause an outage, not who wrote it',
            'Specific, owned, scheduled action items',
            'A conclusion that the engineer should have been more careful',
          ],
          answer: [0, 1, 2],
          explain: 'Timeline, blameless analysis, and concrete owned actions are what turn an outage into an improvement. "Be more careful" is not an action item — it cannot be verified and changes nothing. The useful version is: default timeouts in the HTTP client, a review checklist item for new synchronous dependencies, an alert on pool saturation.',
        },
        {
          q: 'Final question. What was the deeper organisational cause here?',
          options: [
            'A new synchronous dependency was added to the most critical path with no timeout, and nothing in review, tooling or defaults caught it',
            'The pricing service team shipped a bug',
            'The deploy happened too late at night',
            'The on-call engineer was too slow',
          ],
          answer: [0],
          explain: 'The pricing service will fail again — dependencies do. Blaming its team, the deploy window, or the responder all fail to explain why one dependency failing could take out checkout. The fix is in defaults and guardrails: a client whose timeout is mandatory, and a review habit that treats "new call in the checkout path" as a design question.',
        },
      ],
    },
  ],
});
