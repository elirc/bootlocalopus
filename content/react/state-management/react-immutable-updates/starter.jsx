import { memo, useReducer } from 'react';

export function setIn(obj, path, value) {
  // Bug: mutates the object React is holding.
  let target = obj;
  for (const key of path.slice(0, -1)) {
    if (target[key] === undefined) target[key] = {};
    target = target[key];
  }
  target[path[path.length - 1]] = value;
  return { ...obj };
}

export function settingsReducer(state, action) {
  switch (action.type) {
    case 'set':
      return setIn(state, action.path, action.value);
    case 'toggleAll':
      // TODO
      return state;
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
