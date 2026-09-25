import { useEffect, useId, useRef, useState } from 'react';

// TODO: stable line ids, totals, validation after the first submit, a guarded
// save, and server errors mapped to the lines they were about.
export function InvoiceEditor({ onSubmit }) {
  const [lines, setLines] = useState([{ description: '', quantity: '', unitPrice: '' }]);

  const edit = (index, field, value) => {
    setLines(lines.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  };

  const submit = (event) => {
    event.preventDefault();
    onSubmit({
      lines: lines.map((line) => ({
        description: line.description,
        quantity: Number(line.quantity),
        unitPriceCents: Math.floor(parseFloat(line.unitPrice) * 100),
      })),
    });
  };

  return (
    <form onSubmit={submit}>
      {lines.map((line, index) => (
        <div key={index}>
          <label>
            Line {index + 1} description
            <input value={line.description} onChange={(e) => edit(index, 'description', e.target.value)} />
          </label>
          <label>
            Line {index + 1} quantity
            <input value={line.quantity} onChange={(e) => edit(index, 'quantity', e.target.value)} />
          </label>
          <label>
            Line {index + 1} unit price
            <input value={line.unitPrice} onChange={(e) => edit(index, 'unitPrice', e.target.value)} />
          </label>
          <button type="button" onClick={() => setLines(lines.filter((_, i) => i !== index))}>
            Remove line {index + 1}
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setLines([...lines, { description: '', quantity: '', unitPrice: '' }])}>
        Add line
      </button>
      <button type="submit">Save</button>
    </form>
  );
}
