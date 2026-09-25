Reading a design doc well is a different skill from writing one. The
useful review is not "LGTM" and not forty comments on wording. It finds the
two or three things that will hurt in production or in six months, says why
with evidence, and leaves the author's reasonable choices alone.

Below is a real-sized design doc from a teammate. It has **five problems**
worth raising before anyone writes code, and several choices that look
questionable but are **fine**. Review it as you would at work.

---

## Notifications v2: send email through a queue

**Author:** Sam · **Reviewers:** you, Priya (platform) · **Status:** Draft, comments by Friday

### Context

Order confirmation emails are sent inside the checkout request. When the
email provider is slow (twice last month, for about 20 minutes each),
checkout latency goes from 400 ms to 8 s and conversion drops. We also lose
emails when the provider returns a 5xx: we log the error and move on.

### Goals

1. Make notifications faster and more reliable.
2. Checkout must not depend on the email provider being up.

### Non-goals

(none)

### Proposal

- Checkout writes the order **and** an `order.confirmed` row to an `outbox`
  table in the same transaction, then returns. It no longer calls the email
  provider. A small relay process publishes new outbox rows to a queue and
  marks them sent.
- A new `notifier` worker consumes the queue and sends the email. The
  queue delivers **at least once**; a message whose processing fails is
  retried with exponential backoff, up to 24 hours.
- The worker calls the provider's `send` API for each message it receives.
- We will use Amazon SQS, which the platform team already runs, with a
  dead-letter queue after 10 failed attempts. Messages are retained for 4
  days.
- While we are here, we will also move all email templates from the
  provider's UI into our repo and rebuild them in MJML, so they are
  versioned.

### Alternatives considered

None. Queues are the industry standard for this.

### Rollout

On launch day we switch checkout to publish to the queue and turn on the
worker.

### Open questions

- Do we need to send SMS through the same worker later? (Product says maybe
  next year.)
- What should the alert threshold on the dead-letter queue be?
