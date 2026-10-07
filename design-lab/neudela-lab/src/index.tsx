// Async boundary, same as the craco MFE: harmless for the full app, and it is the
// place a Module Federation runtime needs to negotiate shared deps before bootstrap.
import('./bootstrap');
export {};
