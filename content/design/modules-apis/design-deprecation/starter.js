export class DeprecationError extends Error {}

export const DEPRECATIONS = Object.freeze({
  DEP_MAIL_001: 'sendEmail(to, subject, body, isHtml) is deprecated. Use sendEmail({ to, subject, text | html }).',
  DEP_MAIL_002: 'The "body" field is deprecated. Use "text".',
  DEP_MAIL_003: 'send() is deprecated. Use sendEmail().',
});

const defaultWarn = (message, code) => process.emitWarning(message, { type: 'DeprecationWarning', code });

// The new API, shipped as a "small refactor". Thirty services still call
// sendEmail(to, subject, body, isHtml), send(...), or pass { body }.
export function createMailer({ transport, warn = defaultWarn, throwOnDeprecation = false }) {
  const sendEmail = async ({ to, cc = [], subject, text, html }) => {
    const envelope = { to: [].concat(to), cc: [].concat(cc), subject };
    if (text !== undefined) envelope.text = text;
    if (html !== undefined) envelope.html = html;
    const { messageId } = await transport.deliver(envelope);
    return messageId;
  };

  return { sendEmail };
}
