const METRIC_NAME = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const LABEL_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const escapeLabel = (v) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
const escapeHelp = (v) => v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');

export function createRegistry({ maxSeries = 1000 } = {}) {
  const metrics = [];
  const names = new Set();

  function register(type, { name, help, labelNames = [] }) {
    if (typeof name !== 'string' || !METRIC_NAME.test(name)) throw new TypeError(`invalid metric name "${name}"`);
    for (const label of labelNames) {
      if (typeof label !== 'string' || !LABEL_NAME.test(label) || label.startsWith('__')) {
        throw new TypeError(`invalid label name "${label}"`);
      }
    }
    if (names.has(name)) throw new Error(`metric "${name}" is already registered`);
    names.add(name);

    // Key -> { values, value }. JSON of the value array cannot collide the way "a,b" joins do.
    const series = new Map();
    let dropped = 0;

    function seriesFor(labels) {
      const keys = Object.keys(labels);
      if (keys.length !== labelNames.length || !labelNames.every((l) => Object.hasOwn(labels, l))) {
        throw new TypeError(`${name} takes exactly the labels: ${labelNames.join(', ') || '(none)'}`);
      }
      const values = labelNames.map((l) => String(labels[l]));
      const key = JSON.stringify(values);
      let s = series.get(key);
      if (!s) {
        if (series.size >= maxSeries) {
          dropped++;
          return null;
        }
        s = { values, value: 0 };
        series.set(key, s);
      }
      return s;
    }

    function update(labels, value, apply) {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError('value must be a finite number');
      const s = seriesFor(labels);
      if (s) s.value = apply(s.value, value);
    }

    function render() {
      const lines = [`# HELP ${name} ${escapeHelp(help ?? '')}`, `# TYPE ${name} ${type}`];
      if (labelNames.length === 0) {
        lines.push(`${name} ${String(series.get('[]')?.value ?? 0)}`);
      } else {
        for (const s of series.values()) {
          const labels = labelNames.map((l, i) => `${l}="${escapeLabel(s.values[i])}"`).join(',');
          lines.push(`${name}{${labels}} ${String(s.value)}`);
        }
      }
      return lines;
    }

    metrics.push(render);
    const common = { get dropped() { return dropped; } };

    if (type === 'counter') {
      return Object.assign(common, {
        inc(labels = {}, value = 1) {
          if (value < 0) throw new RangeError('counters only go up');
          update(labels, value, (current, v) => current + v);
        },
      });
    }
    return Object.assign(common, {
      set(labels, value) { update(labels, value, (_, v) => v); },
      inc(labels = {}, value = 1) { update(labels, value, (current, v) => current + v); },
      dec(labels = {}, value = 1) { update(labels, value, (current, v) => current - v); },
    });
  }

  return {
    counter: (options) => register('counter', options),
    gauge: (options) => register('gauge', options),
    metrics: () => metrics.flatMap((render) => render()).join('\n') + '\n',
  };
}
