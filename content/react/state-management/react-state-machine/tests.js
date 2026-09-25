const { uploadReducer: reduce, initialUploadState, Uploader } = solution;

const file = { name: 'report.pdf' };
const uploading = (attempt = 1, progress = 0) => ({ status: 'uploading', attempt, file, progress });

describe('uploadReducer', () => {
  it('starts from idle', () => {
    expect(initialUploadState).toEqual({ status: 'idle', attempt: 0 });
    expect(reduce(initialUploadState, { type: 'start', file })).toStrictEqual(uploading(1, 0));
  });

  it('tracks progress as a floored, clamped percentage that never goes back', () => {
    let s = uploading(1);
    s = reduce(s, { type: 'progress', attempt: 1, loaded: 1, total: 3 });
    expect(s.progress).toBe(33);
    const at33 = s;
    expect(reduce(s, { type: 'progress', attempt: 1, loaded: 1, total: 4 })).toBe(at33);
    expect(reduce(s, { type: 'progress', attempt: 1, loaded: 1, total: 3 })).toBe(at33);
    s = reduce(s, { type: 'progress', attempt: 1, loaded: 999, total: 3 });
    expect(s.progress).toBe(100);
  });

  it('succeeds and fails into states with only their own fields', () => {
    expect(reduce(uploading(2, 80), { type: 'succeed', attempt: 2, url: '/f/1' }))
      .toStrictEqual({ status: 'done', attempt: 2, file, url: '/f/1' });
    expect(reduce(uploading(2, 80), { type: 'fail', attempt: 2, error: 'Too large' }))
      .toStrictEqual({ status: 'failed', attempt: 2, file, error: 'Too large' });
  });

  it('retries a failed upload as a new attempt', () => {
    const failed = { status: 'failed', attempt: 2, file, error: 'x' };
    expect(reduce(failed, { type: 'retry' })).toStrictEqual(uploading(3, 0));
  });

  it('cancels and resets to idle, keeping the attempt counter', () => {
    expect(reduce(uploading(4, 50), { type: 'cancel' })).toStrictEqual({ status: 'idle', attempt: 4 });
    expect(reduce({ status: 'done', attempt: 4, file, url: 'u' }, { type: 'reset' })).toStrictEqual({ status: 'idle', attempt: 4 });
    expect(reduce({ status: 'failed', attempt: 4, file, error: 'e' }, { type: 'reset' })).toStrictEqual({ status: 'idle', attempt: 4 });
  });

  it('starts again from done or failed with a fresh attempt', () => {
    const other = { name: 'b.png' };
    expect(reduce({ status: 'done', attempt: 1, file, url: 'u' }, { type: 'start', file: other }))
      .toStrictEqual({ status: 'uploading', attempt: 2, file: other, progress: 0 });
    expect(reduce({ status: 'failed', attempt: 5, file, error: 'e' }, { type: 'start', file: other }).attempt).toBe(6);
  });

  it('ignores events from another attempt', () => {
    const s = uploading(3, 10);
    expect(reduce(s, { type: 'progress', attempt: 2, loaded: 9, total: 10 })).toBe(s);
    expect(reduce(s, { type: 'succeed', attempt: 2, url: 'stale' })).toBe(s);
    expect(reduce(s, { type: 'fail', attempt: 4, error: 'future' })).toBe(s);
  });

  it('returns the same state for impossible transitions', () => {
    const idle = { status: 'idle', attempt: 1 };
    const done = { status: 'done', attempt: 1, file, url: 'u' };
    const up = uploading(1, 5);
    const failed = { status: 'failed', attempt: 1, file, error: 'e' };
    const cases = [
      [idle, { type: 'progress', attempt: 1, loaded: 1, total: 2 }],
      [idle, { type: 'succeed', attempt: 1, url: 'late' }],
      [idle, { type: 'cancel' }],
      [idle, { type: 'retry' }],
      [idle, { type: 'reset' }],
      [up, { type: 'start', file }],
      [up, { type: 'retry' }],
      [up, { type: 'reset' }],
      [done, { type: 'cancel' }],
      [done, { type: 'retry' }],
      [done, { type: 'succeed', attempt: 1, url: 'again' }],
      [failed, { type: 'cancel' }],
      [failed, { type: 'fail', attempt: 1, error: 'again' }],
      [up, { type: 'launch-rocket' }],
    ];
    for (const [state, action] of cases) expect(reduce(state, action)).toBe(state);
  });
});

function createUpload() {
  const calls = [];
  const upload = (f, { signal, onProgress }) => {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    calls.push({ file: f, signal, onProgress, resolve, reject });
    return promise;
  };
  upload.calls = calls;
  return upload;
}
const click = (name) => fireEvent.click(screen.getByRole('button', { name }));
const text = () => document.body.textContent;

describe('Uploader', () => {
  it('uploads with progress and shows the link', async () => {
    const upload = createUpload();
    render(<Uploader file={file} upload={upload} />);
    click('Upload');
    expect(upload.calls).toHaveLength(1);
    expect(upload.calls[0].file).toBe(file);
    expect(screen.getByText('Uploading 0%')).toBeTruthy();
    act(() => upload.calls[0].onProgress(1, 4));
    expect(screen.getByText('Uploading 25%')).toBeTruthy();
    await act(async () => upload.calls[0].resolve('/files/9'));
    expect(screen.getByRole('link', { name: 'View file' }).getAttribute('href')).toBe('/files/9');
    click('Upload another');
    expect(screen.getByRole('button', { name: 'Upload' })).toBeTruthy();
  });

  it('shows a failure and retries', async () => {
    const upload = createUpload();
    render(<Uploader file={file} upload={upload} />);
    click('Upload');
    await act(async () => upload.calls[0].reject(new Error('Too large')));
    expect(screen.getByRole('alert').textContent).toBe('Upload failed: Too large');
    click('Retry');
    expect(upload.calls).toHaveLength(2);
    expect(screen.getByText('Uploading 0%')).toBeTruthy();
    await act(async () => upload.calls[1].resolve('/files/10'));
    expect(screen.getByRole('link', { name: 'View file' }).getAttribute('href')).toBe('/files/10');
  });

  it('cancel aborts the request, and its late events change nothing', async () => {
    const upload = createUpload();
    render(<Uploader file={file} upload={upload} />);
    click('Upload');
    const first = upload.calls[0];
    click('Cancel');
    expect(first.signal.aborted).toBe(true);
    expect(screen.getByRole('button', { name: 'Upload' })).toBeTruthy();
    act(() => first.onProgress(3, 4));
    await act(async () => first.resolve('/files/stale'));
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeTruthy();
  });

  it('ignores the old attempt after a new one starts', async () => {
    const upload = createUpload();
    render(<Uploader file={file} upload={upload} />);
    click('Upload');
    const first = upload.calls[0];
    click('Cancel');
    click('Upload');
    const second = upload.calls[1];
    act(() => first.onProgress(9, 10));
    expect(screen.getByText('Uploading 0%')).toBeTruthy();
    await act(async () => first.resolve('/files/stale'));
    expect(screen.queryByRole('link')).toBeNull();
    act(() => second.onProgress(1, 2));
    expect(screen.getByText('Uploading 50%')).toBeTruthy();
    await act(async () => second.resolve('/files/fresh'));
    expect(screen.getByRole('link', { name: 'View file' }).getAttribute('href')).toBe('/files/fresh');
    expect(text()).not.toContain('stale');
  });
});
