Core Web Vitals are three numbers Google measures from real Chrome users
(the 75th percentile of page views, over 28 days) and uses in search
ranking. More usefully, each one names a kind of bad experience:

| Metric | Question it answers | Good | Poor |
| --- | --- | --- | --- |
| **LCP** — Largest Contentful Paint | When did the main content appear? | ≤ 2.5 s | > 4 s |
| **INP** — Interaction to Next Paint | When I click, how long until the page responds visibly? | ≤ 200 ms | > 500 ms |
| **CLS** — Cumulative Layout Shift | Does the page jump around under my finger? | ≤ 0.1 | > 0.25 |

INP replaced FID (First Input Delay) in 2024: FID only measured the delay
before the **first** interaction's handler started; INP covers the whole
interaction — input delay, handler time and the time to paint the next
frame — for (nearly) the worst interaction of the visit.

The skill is not reciting thresholds. It is looking at a symptom and knowing
which metric it moves and what the fix is.
