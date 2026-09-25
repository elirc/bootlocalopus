import { Transform } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

export class CsvError extends Error {
  constructor(message, row) {
    super(`row ${row}: ${message}`);
    this.name = 'CsvError';
    this.row = row;
  }
}

export function createCsvParser({ header = true } = {}) {
  const decoder = new StringDecoder('utf8');
  let started = false; // has the BOM check run?
  let names = null;
  let row = 0; // number of the record being read
  let record = [];
  let field = '';
  let fieldQuoted = false; // the current field began with a quote
  let inQuotes = false;
  let quotePending = false; // saw a quote inside quotes; next char decides
  let sawCR = false; // unquoted '\r' waiting to see if '\n' follows

  // Returns an error to fail the stream with, or null.
  const endRecord = (push) => {
    record.push(field);
    const blank = record.length === 1 && field === '' && !fieldQuoted;
    const done = record;
    record = [];
    field = '';
    fieldQuoted = false;
    if (blank) return null;
    row++;
    if (!header) {
      push(done);
      return null;
    }
    if (names === null) {
      names = done;
      return null;
    }
    if (done.length !== names.length) {
      return new CsvError(`expected ${names.length} fields, got ${done.length}`, row);
    }
    push(Object.fromEntries(names.map((name, i) => [name, done[i]])));
    return null;
  };

  const consume = (text, push) => {
    if (!started && text.length > 0) {
      started = true;
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    }
    for (const c of text) {
      if (inQuotes) {
        if (quotePending) {
          quotePending = false;
          if (c === '"') {
            field += '"';
            continue;
          }
          inQuotes = false; // that quote closed the field; handle c normally
        } else if (c === '"') {
          quotePending = true;
          continue;
        } else {
          field += c;
          continue;
        }
      }
      if (sawCR) {
        sawCR = false;
        if (c !== '\n') field += '\r';
      }
      if (c === '"' && field === '' && !fieldQuoted) {
        inQuotes = true;
        fieldQuoted = true;
      } else if (c === ',') {
        record.push(field);
        field = '';
        fieldQuoted = false;
      } else if (c === '\r') {
        sawCR = true;
      } else if (c === '\n') {
        const error = endRecord(push);
        if (error) return error;
      } else {
        field += c;
      }
    }
    return null;
  };

  return new Transform({
    readableObjectMode: true,
    transform(chunk, _encoding, callback) {
      const text = typeof chunk === 'string' ? chunk : decoder.write(chunk);
      callback(consume(text, (value) => this.push(value)));
    },
    flush(callback) {
      const push = (value) => this.push(value);
      let error = consume(decoder.end(), push);
      if (!error && inQuotes && !quotePending) {
        error = new CsvError('unterminated quoted field', row + 1);
      }
      if (!error) {
        inQuotes = false;
        sawCR = false; // a final '\r' is a line ending
        if (field !== '' || fieldQuoted || record.length > 0) error = endRecord(push);
      }
      callback(error);
    },
  });
}
