import { StrictMode, Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PAGES, REMOTE } from './.generated/remotes';

// A minimal host shell, NOT the remote's: its own header and page switcher, and each remote page
// mounted from the remote's remoteEntry.js. Proves the exposes run inside another application.
function Host() {
  const [current, setCurrent] = useState(0);
  const Page = PAGES[current].Page;
  return (
    <div className="host">
      <header className="host__bar">
        <strong>Federation host</strong>
        <span className="host__remote">remote: {REMOTE.name} @ {REMOTE.url}</span>
        <nav aria-label="Remote pages">
          {PAGES.map((p, i) => (
            <button key={p.key} type="button" aria-pressed={i === current} onClick={() => setCurrent(i)}>{p.label}</button>
          ))}
        </nav>
      </header>
      <main className="host__main" data-remote-page={PAGES[current].key}>
        <Suspense fallback={<p>Loading remote page…</p>}>
          <Page key={PAGES[current].key} />
        </Suspense>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Host /></StrictMode>);
