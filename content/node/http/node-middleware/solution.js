const send = (res, status, body) => {
  if (res.writableEnded || res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

export function createApp() {
  const middleware = [];
  const errorHandlers = [];

  const runErrors = async (error, req, res) => {
    let index = 0;
    const nextError = async (err) => {
      const handler = errorHandlers[index++];
      if (!handler) return send(res, 500, { error: 'internal error' });
      try {
        await handler(err, req, res, nextError);
      } catch (thrown) {
        await nextError(thrown);
      }
    };
    await nextError(error);
  };

  return {
    use(fn) {
      middleware.push(fn);
      return this;
    },

    useError(fn) {
      errorHandlers.push(fn);
      return this;
    },

    async handle(req, res) {
      let index = 0;

      const next = async (error) => {
        if (error) return runErrors(error, req, res);

        const fn = middleware[index++];
        if (!fn) return send(res, 404, { error: 'not found' });

        // A middleware that calls next() twice must not replay the chain.
        let called = false;
        const guarded = (err) => {
          if (called) return;
          called = true;
          return next(err);
        };

        try {
          await fn(req, res, guarded);
        } catch (thrown) {
          if (!called) {
            called = true;
            await runErrors(thrown, req, res);
          }
        }
      };

      await next();
    },
  };
}
