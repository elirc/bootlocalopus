/**
 * Turns incident data into a postmortem document, its headline numbers, and
 * the problems to fix before the review meeting.
 * Returns { markdown, metrics, problems }.
 */
export function buildPostmortem(incident) {
  // What gets written today: the events as pasted, and nothing checked.
  const lines = incident.events.map((e) => `- ${e.at} ${e.text}`);
  return {
    markdown: `# ${incident.title}\n\n${incident.summary}\n\n${lines.join('\n')}\n`,
    metrics: { timeToDetectMin: null, timeToMitigateMin: null, timeToResolveMin: null },
    problems: [],
  };
}
