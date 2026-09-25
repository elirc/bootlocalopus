import { useEffect, useId, useRef, useState } from 'react';

const FIELDS = ['description', 'quantity', 'unitPrice'];
const LABELS = { description: 'description', quantity: 'quantity', unitPrice: 'unit price' };
const MESSAGES = {
  description: 'Enter a description',
  quantity: 'Enter a whole number above 0',
  unitPrice: 'Enter a price like 12.50',
};

function parseQuantity(text) {
  const clean = text.trim();
  if (!/^\d+$/.test(clean)) return null;
  const n = Number(clean);
  return n > 0 ? n : null;
}

/** Integer cents, or null. Whole units and cents are parsed as separate integers. */
function parsePrice(text) {
  const clean = text.trim();
  const match = /^(\d*)(?:\.(\d{0,2}))?$/.exec(clean);
  if (!match || !/\d/.test(clean)) return null;
  return Number(match[1] || '0') * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

function formatCents(cents) {
  return `$${Math.floor(cents / 100).toLocaleString('en-US')}.${String(cents % 100).padStart(2, '0')}`;
}

function lineTotal(line) {
  const quantity = parseQuantity(line.quantity);
  const price = parsePrice(line.unitPrice);
  return quantity === null || price === null ? null : quantity * price;
}

function clientErrors(line) {
  return {
    description: line.description.trim() === '' ? MESSAGES.description : null,
    quantity: parseQuantity(line.quantity) === null ? MESSAGES.quantity : null,
    unitPrice: parsePrice(line.unitPrice) === null ? MESSAGES.unitPrice : null,
  };
}

const key = (lineId, field) => `${lineId}:${field}`;

export function InvoiceEditor({ onSubmit }) {
  const nextId = useRef(1);
  const newLine = () => ({ id: nextId.current++, description: '', quantity: '', unitPrice: '' });
  const [lines, setLines] = useState(() => [newLine()]);
  const [attempted, setAttempted] = useState(false);
  // Server messages by line id and field, never by index: indexes shift.
  const [serverErrors, setServerErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const prefix = useId();
  const inputs = useRef(new Map());
  const addButton = useRef(null);
  const focusAfterRender = useRef(null);
  const focusServerError = useRef(false);
  // The lines as last rendered, for code that runs after an await.
  const latestLines = useRef(lines);
  useEffect(() => {
    latestLines.current = lines;
  });

  useEffect(() => {
    const target = focusAfterRender.current;
    if (target === null) return;
    focusAfterRender.current = null;
    (target === 'add' ? addButton.current : inputs.current.get(target))?.focus();
  }, [lines]);

  // What each field shows: its current client-side problem (once the user
  // has tried to submit), else a server message it has not been edited since.
  const errorFor = (line, field) =>
    (attempted ? clientErrors(line)[field] : null) ?? serverErrors[key(line.id, field)] ?? null;

  const focusFirst = (hasError) => {
    for (const line of lines) {
      for (const field of FIELDS) {
        if (hasError(line, field)) {
          inputs.current.get(key(line.id, field))?.focus();
          return;
        }
      }
    }
  };

  const edit = (id, field, value) => {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, [field]: value } : line)));
    setServerErrors((current) => {
      if (!(key(id, field) in current)) return current;
      const { [key(id, field)]: _gone, ...rest } = current;
      return rest;
    });
  };

  const add = () => {
    const line = newLine();
    focusAfterRender.current = key(line.id, 'description');
    setLines((current) => [...current, line]);
  };

  const remove = (index) => {
    const remaining = lines.filter((_, i) => i !== index);
    const heir = remaining[index] ?? remaining[remaining.length - 1];
    focusAfterRender.current = heir ? key(heir.id, 'description') : 'add';
    setLines(remaining);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setAttempted(true);
    setFormError('');
    if (lines.length === 0) {
      setFormError('Add at least one line');
      return;
    }
    const invalid = (line, field) => clientErrors(line)[field] !== null;
    if (lines.some((line) => FIELDS.some((field) => invalid(line, field)))) {
      focusFirst(invalid);
      return;
    }

    // The server will answer by index. Remember which line each index meant.
    const idAtIndex = lines.map((line) => line.id);
    setSaving(true);
    setServerErrors({});
    try {
      await onSubmit({
        lines: lines.map((line) => ({
          description: line.description.trim(),
          quantity: parseQuantity(line.quantity),
          unitPriceCents: parsePrice(line.unitPrice),
        })),
      });
    } catch (error) {
      // Lines as they are now: some may have been removed while we waited.
      const alive = new Set(latestLines.current.map((line) => line.id));
      const mapped = {};
      for (const [path, message] of Object.entries(error?.details ?? {})) {
        const match = /^lines\.(\d+)\.(description|quantity|unitPrice)$/.exec(path);
        const id = match ? idAtIndex[Number(match[1])] : undefined;
        if (id !== undefined && alive.has(id)) mapped[key(id, match[2])] = message;
      }
      if (Object.keys(mapped).length === 0) {
        setFormError('Could not save the invoice');
      } else {
        setServerErrors(mapped);
        focusServerError.current = true;
      }
    } finally {
      setSaving(false);
    }
  };

  // After server errors render, focus the first field that has one.
  useEffect(() => {
    if (!focusServerError.current) return;
    focusServerError.current = false;
    focusFirst((line, field) => serverErrors[key(line.id, field)] !== undefined);
  });

  const total = lines.reduce((sum, line) => sum + (lineTotal(line) ?? 0), 0);

  return (
    <form onSubmit={submit} noValidate>
      {lines.map((line, index) => {
        const n = index + 1;
        const lineSum = lineTotal(line);
        return (
          <fieldset key={line.id}>
            <legend>Line {n}</legend>
            {FIELDS.map((field) => {
              const id = `${prefix}-${line.id}-${field}`;
              const error = errorFor(line, field);
              return (
                <div key={field}>
                  <label htmlFor={id}>
                    Line {n} {LABELS[field]}
                  </label>
                  <input
                    id={id}
                    type="text"
                    inputMode={field === 'description' ? undefined : field === 'quantity' ? 'numeric' : 'decimal'}
                    ref={(el) => {
                      if (el) inputs.current.set(key(line.id, field), el);
                      else inputs.current.delete(key(line.id, field));
                    }}
                    value={line[field]}
                    onChange={(e) => edit(line.id, field, e.target.value)}
                    aria-invalid={error ? 'true' : undefined}
                    aria-describedby={error ? `${id}-error` : undefined}
                  />
                  {error && <p id={`${id}-error`}>{error}</p>}
                </div>
              );
            })}
            <output aria-label={`Line ${n} total`}>{lineSum === null ? '—' : formatCents(lineSum)}</output>
            <button type="button" onClick={() => remove(index)}>
              Remove line {n}
            </button>
          </fieldset>
        );
      })}
      <button type="button" ref={addButton} onClick={add}>
        Add line
      </button>
      <p>
        <output aria-label="Total">{formatCents(total)}</output>
      </p>
      <p role="alert">{formError}</p>
      <button type="submit" disabled={saving}>
        Save
      </button>
    </form>
  );
}
