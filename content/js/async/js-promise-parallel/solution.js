export async function loadSequential(ids, loadOne) {
  const out = [];
  for (const id of ids) out.push(await loadOne(id));
  return out;
}

export async function loadParallel(ids, loadOne) {
  // .map runs synchronously, so every request is in flight before the await.
  return Promise.all(ids.map((id) => loadOne(id)));
}

export async function settleAll(ids, loadOne) {
  return Promise.all(
    ids.map((id) =>
      Promise.resolve()
        .then(() => loadOne(id))
        .then((value) => ({ status: 'fulfilled', value }))
        .catch((reason) => ({ status: 'rejected', reason })),
    ),
  );
}
