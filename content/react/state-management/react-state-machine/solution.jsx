import { useEffect, useReducer, useRef } from 'react';

export const initialUploadState = { status: 'idle', attempt: 0 };

export function uploadReducer(state, action) {
  switch (action.type) {
    case 'start':
      if (state.status === 'uploading') return state;
      return { status: 'uploading', attempt: state.attempt + 1, file: action.file, progress: 0 };

    case 'retry':
      if (state.status !== 'failed') return state;
      return { status: 'uploading', attempt: state.attempt + 1, file: state.file, progress: 0 };

    case 'progress': {
      if (state.status !== 'uploading' || action.attempt !== state.attempt) return state;
      const pct = Math.min(100, Math.max(0, Math.floor((action.loaded / action.total) * 100)));
      if (pct <= state.progress) return state;
      return { ...state, progress: pct };
    }

    case 'succeed':
      if (state.status !== 'uploading' || action.attempt !== state.attempt) return state;
      return { status: 'done', attempt: state.attempt, file: state.file, url: action.url };

    case 'fail':
      if (state.status !== 'uploading' || action.attempt !== state.attempt) return state;
      return { status: 'failed', attempt: state.attempt, file: state.file, error: action.error };

    case 'cancel':
      if (state.status !== 'uploading') return state;
      return { status: 'idle', attempt: state.attempt };

    case 'reset':
      if (state.status !== 'done' && state.status !== 'failed') return state;
      return { status: 'idle', attempt: state.attempt };

    default:
      return state;
  }
}

export function Uploader({ file, upload }) {
  const [state, dispatch] = useReducer(uploadReducer, initialUploadState);
  const uploadRef = useRef(upload);
  useEffect(() => {
    uploadRef.current = upload;
  });

  // One effect per attempt: it starts the request, and its cleanup aborts it
  // when the attempt ends (cancel, a new attempt, or unmount).
  const { status, attempt } = state;
  const uploadingFile = status === 'uploading' ? state.file : null;
  useEffect(() => {
    if (status !== 'uploading') return undefined;
    const controller = new AbortController();
    const onProgress = (loaded, total) => dispatch({ type: 'progress', attempt, loaded, total });
    uploadRef.current(uploadingFile, { signal: controller.signal, onProgress }).then(
      (url) => dispatch({ type: 'succeed', attempt, url }),
      (err) => dispatch({ type: 'fail', attempt, error: err?.message ?? String(err) }),
    );
    return () => controller.abort();
  }, [status, attempt, uploadingFile]);

  switch (state.status) {
    case 'uploading':
      return (
        <div>
          <p>Uploading {state.progress}%</p>
          <button onClick={() => dispatch({ type: 'cancel' })}>Cancel</button>
        </div>
      );
    case 'done':
      return (
        <div>
          <a href={state.url}>View file</a>
          <button onClick={() => dispatch({ type: 'reset' })}>Upload another</button>
        </div>
      );
    case 'failed':
      return (
        <div>
          <p role="alert">Upload failed: {state.error}</p>
          <button onClick={() => dispatch({ type: 'retry' })}>Retry</button>
        </div>
      );
    default:
      return <button onClick={() => dispatch({ type: 'start', file })}>Upload</button>;
  }
}
