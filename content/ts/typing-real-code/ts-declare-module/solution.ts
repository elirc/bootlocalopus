// A declarations file: no top-level import or export, so this is a global
// script and every `declare module` below is an ambient module declaration,
// visible to the whole program. (Add a top-level `export` and each block turns
// into an *augmentation* of a module that does not exist — an error.)

// --- slugify-legacy: CommonJS, `module.exports = slugify`, with properties on the function.
declare module 'slugify-legacy' {
  function slugify(text: string, options?: slugify.Options): string;

  // A namespace merged with the function carries its properties and its types.
  namespace slugify {
    interface Options {
      separator?: string;
      lower?: boolean;
      strict?: boolean;
    }
    const defaults: Required<Options>;
    function extend(charMap: Record<string, string>): void;
  }

  export = slugify;
}

// --- feature-flags-client: ESM, named exports.
declare module 'feature-flags-client' {
  export interface ClientOptions {
    sdkKey: string;
    pollIntervalMs?: number;
  }

  export interface FlagContext {
    userId?: string;
    country?: string;
    [attribute: string]: string | number | boolean | undefined;
  }

  export interface FlagEvents {
    ready: [];
    error: [error: Error];
    update: [changedFlags: string[]];
  }

  export interface FlagClient {
    isEnabled(flag: string, context?: FlagContext): boolean;
    variant(flag: string, fallback: string): string;
    on<E extends keyof FlagEvents>(event: E, listener: (...args: FlagEvents[E]) => void): () => void;
    close(): Promise<void>;
  }

  export function createClient(options: ClientOptions): FlagClient;
  export const VERSION: string;
}

// --- assets the bundler turns into modules.
declare module '*.svg' {
  const url: string;
  export default url;
}

declare module '*.module.css' {
  const classes: { readonly [className: string]: string };
  export default classes;
}

// --- constants the bundler substitutes at build time (Vite `define`).
declare const __APP_VERSION__: string;
declare const __DEV__: boolean;
