// Async boundary: the federation runtime negotiates the shared singletons (react, react-dom,
// neudela) with the remote before anything that uses them is evaluated.
import('./bootstrap');
export {};
