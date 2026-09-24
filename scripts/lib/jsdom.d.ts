// jsdom ships no types and @types/jsdom is not worth a dependency for one
// test script: scripts/ui-smoke.ts uses it untyped.
declare module 'jsdom';
