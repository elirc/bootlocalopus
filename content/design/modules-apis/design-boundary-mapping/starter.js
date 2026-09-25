export class RequestValidationError extends Error {}

// What the handlers do today:
//   res.json(await db.findUser(id));           // the row, as is
//   await db.insertUser(req.body);             // the body, as is

export function toUserResponse(row, viewer) {
  const { password_hash, ...rest } = row;
  return rest;
}

export function toUserListResponse(rows, viewer, nextCursor = null) {
  return { data: rows.map((row) => toUserResponse(row, viewer)), nextCursor };
}

export function fromCreateUserRequest(body) {
  return body;
}

export function fromUpdateUserRequest(body) {
  return body;
}
