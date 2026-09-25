export class DeprecationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'DeprecationError';
    this.code = code;
  }
}

export const DEPRECATIONS = Object.freeze({
  DEP_MAIL_001: 'sendEmail(to, subject, body, isHtml) is deprecated. Use sendEmail({ to, subject, text | html }).',
  DEP_MAIL_002: 'The "body" field is deprecated. Use "text".',
  DEP_MAIL_003: 'send() is deprecated. Use sendEmail().',
});

const defaultWarn = (message, code) => process.emitWarning(message, { type: 'DeprecationWarning', code });

const toList = (value) => (value === undefined ? [] : Array.isArray(value) ? [...value] : [value]);

export function createMailer({ transport, warn = defaultWarn, throwOnDeprecation = false }) {
  const warned = new Set();

  const deprecate = (code) => {
    if (throwOnDeprecation) throw new DeprecationError(DEPRECATIONS[code], code);
    if (warned.has(code)) return;
    warned.add(code);
    warn(DEPRECATIONS[code], code);
  };

  /** Every old calling convention is translated into the one new shape, here and nowhere else. */
  const normalise = (args) => {
    const [first] = args;
    let message;
    if (typeof first === 'string' || Array.isArray(first)) {
      deprecate('DEP_MAIL_001');
      const [to, subject, body, isHtml = false] = args;
      message = { to, subject, [isHtml ? 'html' : 'text']: body };
    } else {
      message = { ...first };
    }

    if (message.body !== undefined) {
      if (message.text !== undefined) throw new TypeError('Use either "body" or "text", not both');
      deprecate('DEP_MAIL_002');
      message.text = message.body;
    }
    return message;
  };

  const sendEmail = async (...args) => {
    const { to, cc, subject, text, html } = normalise(args);
    const recipients = toList(to);
    if (recipients.length === 0) throw new TypeError('"to" is required');
    if (typeof subject !== 'string') throw new TypeError('"subject" must be a string');
    if (text === undefined && html === undefined) throw new TypeError('Provide "text" or "html"');

    const envelope = { to: recipients, cc: toList(cc), subject };
    if (text !== undefined) envelope.text = text;
    if (html !== undefined) envelope.html = html;
    const { messageId } = await transport.deliver(envelope);
    return messageId;
  };

  return {
    sendEmail,
    async send(...args) {
      deprecate('DEP_MAIL_003');
      return sendEmail(...args);
    },
  };
}
