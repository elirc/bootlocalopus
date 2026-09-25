// Shorthand ambient declarations: they make the imports compile, and they type
// every import as `any`. Replace each with a real declaration.
// (This file has no top-level import or export, and it must stay that way.)

declare module 'slugify-legacy';
declare module 'feature-flags-client';
declare module '*.svg';
declare module '*.module.css';

declare const __APP_VERSION__: any;
declare const __DEV__: any;
