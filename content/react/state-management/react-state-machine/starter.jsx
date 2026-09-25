import { useEffect, useReducer, useRef, useState } from 'react';

export const initialUploadState = { status: 'idle', attempt: 0 };

export function uploadReducer(state, action) {
  // TODO: accept only the events that make sense in the current status
  switch (action.type) {
    case 'start':
      return { ...state, status: 'uploading', file: action.file, progress: 0 };
    default:
      return { ...state };
  }
}

// The version we are replacing: four independent pieces of state.
export function Uploader({ file, upload }) {
  const [uploadingNow, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);

  const start = () => {
    setUploading(true);
    upload(file, { signal: undefined, onProgress: (l, t) => setProgress(Math.round((l / t) * 100)) })
      .then((u) => { setUrl(u); setUploading(false); })
      .catch((e) => setError(e.message));
  };

  if (uploadingNow) return <p>Uploading {progress}%</p>;
  if (url) return <a href={url}>View file</a>;
  return <button onClick={start}>Upload</button>;
}
