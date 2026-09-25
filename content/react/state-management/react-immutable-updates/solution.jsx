import { memo, useReducer } from 'react';

export function setIn(obj, path, value) {
  if (path.length === 0) return value;
  const [key, ...rest] = path;
  const child = obj[key];
  const next = rest.length === 0 ? value : setIn(child ?? {}, rest, value);
  // Nothing changed below: hand back the original, so no copies ripple up.
  if (key in obj && Object.is(child, next)) return obj;

  if (Array.isArray(obj)) {
    const copy = obj.slice();
    copy[key] = next;
    return copy;
  }
  return { ...obj, [key]: next };
}

export function settingsReducer(state, action) {
  switch (action.type) {
    case 'set':
      return setIn(state, action.path, action.value);
    case 'toggleAll': {
      const section = state.notifications[action.channel];
      let next = state;
      for (const key of Object.keys(section)) {
        next = setIn(next, ['notifications', action.channel, key], action.value);
      }
      return next;
    }
    default:
      return state;
  }
}

export const ChannelSection = memo(function ChannelSection({ channel, settings, dispatch, onRender }) {
  onRender?.(channel);
  return (
    <fieldset>
      <legend>{channel}</legend>
      {Object.keys(settings).map((key) => (
        <label key={key}>
          <input
            type="checkbox"
            aria-label={`${channel} ${key}`}
            checked={settings[key]}
            onChange={(e) => dispatch({ type: 'set', path: ['notifications', channel, key], value: e.target.checked })}
          />{' '}
          {key}
        </label>
      ))}
    </fieldset>
  );
});

export function NotificationSettings({ initial, onRender }) {
  const [state, dispatch] = useReducer(settingsReducer, initial);
  return (
    <form>
      {Object.keys(state.notifications).map((channel) => (
        <ChannelSection
          key={channel}
          channel={channel}
          settings={state.notifications[channel]}
          dispatch={dispatch}
          onRender={onRender}
        />
      ))}
    </form>
  );
}
