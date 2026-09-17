// Entry: deferred bootstrap (Module Federation-ready). index.tsx is the webpack entry;
// all app code mounts in bootstrap.tsx (defers ReactDOM render until MF shared-scope init).
import('./bootstrap');

export {};
