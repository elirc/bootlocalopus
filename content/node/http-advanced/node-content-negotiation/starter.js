export function negotiate(accept, available) {
  // TODO: parse the Accept header (q values, wildcards, specificity) and pick.
  throw new Error('negotiate is not implemented yet');
}

export function createReportHandler(getRows) {
  return (req, res) => {
    // TODO: GET /report as JSON or CSV, 406 otherwise, always with Vary: Accept.
    res.writeHead(501, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not implemented' }));
  };
}
