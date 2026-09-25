The type errors that cost the most are the ones you never see. Each question
here is a place where everyday TypeScript compiles cleanly and is still
wrong, or where the compiler's complaint looks pedantic until you know what
it is protecting you from:

- APIs whose declared types are deliberately loose (`Object.keys`,
  `JSON.parse`, `Response.json`), and how `any` travels from them into code
  that looks fully typed;
- narrowing that the compiler infers for you and narrowing it cannot;
- `catch` variables, timers, and callbacks whose `void` return type accepts
  more than you might expect.

For each one, the explanation says what fails in production and what the
idiomatic fix is. Answer every question correctly to pass.
