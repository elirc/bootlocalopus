/**
 * A customer-facing incident update, and when the next one is due.
 * Returns { text, nextUpdateAt }.
 */
export function composeUpdate(incident, now) {
  // What the channel usually gets.
  return { text: `Still looking into ${incident.title}.`, nextUpdateAt: null };
}
