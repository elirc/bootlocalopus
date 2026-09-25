export function createRegistry({ maxSeries = 1000 } = {}) {
  const all = [];

  // TODO: validation, exact label sets, a series cap, gauges, escaping,
  // and the exposition format from the brief.
  function counter({ name, help, labelNames = [] }) {
    const series = new Map();
    all.push({ name, series });
    return {
      inc(labels = {}, value = 1) {
        const key = Object.values(labels).join(',');
        series.set(key, (series.get(key) ?? 0) + value);
      },
      get dropped() { return 0; },
    };
  }

  return {
    counter,
    gauge: counter,
    metrics() {
      return all.map((m) => [...m.series].map(([k, v]) => `${m.name}{${k}} ${v}`).join('\n')).join('\n');
    },
  };
}
