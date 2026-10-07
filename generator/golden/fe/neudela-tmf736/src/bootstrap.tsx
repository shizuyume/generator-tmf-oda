import React from 'react';
import ReactDOM from 'react-dom/client';
// neudela first so index.css / App.css can override it.
import 'neudela/style.css';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
