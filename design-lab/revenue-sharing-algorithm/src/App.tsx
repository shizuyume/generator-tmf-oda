import React, { useState } from 'react';
import './App.css';
import PartyRevSharingAlgorithmPreview from './exposes/PartyRevSharingAlgorithm';
import HubPreview from './exposes/Hub';

// TODO: CUSTOMIZE — this whole file is a standalone landing page shown only when
// this MFE is run un-federated (yarn start). A host shell never renders it — it
// mounts './PartyRevSharingAlgorithm' / './Hub' directly. Content below documents
// this design-lab prototype; swap in per-resource copy for a new TMF component.
//
// The `view` state below is a design-lab-only preview harness so the CRUD pages
// can be reviewed without wiring a real host shell — it reuses the same
// createProtectedPage-wrapped exposes, so common_remote still loads over Module
// Federation exactly as it would in a host. Remove this switcher once a real
// host (e.g. business-host-app) mounts these exposes instead.

const exposedModules = [
  './PartyRevSharingAlgorithm',
  './Hub',
];

const tmf736Resources = [
  {
    title: 'Party Revenue Sharing Algorithm',
    summary: 'Manages revenue-sharing algorithms: a named set of policy references plus condition/action variables that parameterize how revenue is split between parties.',
    path: 'src/pages/party-rev-sharing-algorithm/index.tsx',
  },
  {
    title: 'Event Hub',
    summary: 'Event subscription registry (TMF688-style hub) for revenue-sharing-algorithm lifecycle/state-change events.',
    path: 'src/pages/hub/index.tsx',
  },
];

const architectureItems = [
  {
    heading: 'Remote Name',
    value: 'revenue_sharing_algorithm_remote',
    note: 'Exposed by Module Federation to be consumed by host applications.',
  },
  {
    heading: 'Remote Entry',
    value: 'http://localhost:4003/revenueSharingAlgorithmRemoteEntry.js',
    note: 'Main entry file loaded by host shells at runtime.',
  },
  {
    heading: 'Shared UI Remote',
    value: 'common_remote@http://localhost:4000/commonRemoteEntry.js',
    note: 'Provides reusable UI components consumed by this page.',
  },
];

const qualityGuards = [
  'Protected wrappers in src/exposes to prevent host crash when common_remote is unavailable.',
  'Error boundary with retry action inside src/federation/createProtectedPage.tsx.',
  'Lazy-loaded page exposure for isolated federation boundaries and controlled fallback rendering.',
];

const topKpis = [
  { label: 'Resource Pages', value: '2', note: 'PartyRevSharingAlgorithm CRUD and event hub' },
  { label: 'Federated Modules', value: '2', note: 'PartyRevSharingAlgorithm and Hub exposed for host composition' },
  { label: 'UI Shared Components', value: 'common_remote', note: 'Unified UI contract with resilient wrappers' },
  { label: 'Primary API Domain', value: 'TMF736', note: 'Revenue Sharing Algorithm Management' },
];

const localDevSteps = [
  'Install dependencies: yarn install',
  'Start common remote first: cd mcs/general/common ; yarn start',
  'Start the TMF736 backend: cd revenue-sharing-algorithm-service/backend ; yarn start:dev',
  'Start this remote: yarn start',
];

const quickLinks = [
  {
    label: 'Revenue Sharing Algorithm Remote Entry',
    href: 'http://localhost:4003/revenueSharingAlgorithmRemoteEntry.js',
    note: 'Federation entry exposed by this repository.',
  },
  {
    label: 'Common Remote Entry',
    href: 'http://localhost:4000/commonRemoteEntry.js',
    note: 'Shared component library required by TMF736 pages.',
  },
];

function App() {
  const [view, setView] = useState<'landing' | 'party' | 'hub'>('landing');

  if (view === 'party') {
    return (
      <div>
        <button className="preview-back" onClick={() => setView('landing')}>← Back to landing</button>
        <PartyRevSharingAlgorithmPreview />
      </div>
    );
  }

  if (view === 'hub') {
    return (
      <div>
        <button className="preview-back" onClick={() => setView('landing')}>← Back to landing</button>
        <HubPreview />
      </div>
    );
  }

  return (
    <div className="landing">
      <header className="landing__hero">
        <div className="landing__hero-main">
          <p className="landing__eyebrow">TM Forum ODA Remote — design-lab prototype</p>
          <h1>Revenue Sharing Algorithm Command Center</h1>
          <p>
            TMF736 Revenue Sharing Algorithm Management remote, built as the first proof-of-concept
            for a generic mcs/common_remote-based MFE template — federated composition, and shared
            enterprise UI building blocks from common_remote.
          </p>
          <div className="landing__hero-actions">
            <button className="preview-trigger" onClick={() => setView('party')}>
              Preview: Revenue Sharing Algorithm
            </button>
            <button className="preview-trigger" onClick={() => setView('hub')}>
              Preview: Event Hub
            </button>
            <a href="http://localhost:4003/revenueSharingAlgorithmRemoteEntry.js" target="_blank" rel="noreferrer">
              Open Remote Entry
            </a>
          </div>
        </div>
        <div className="landing__hero-panel">
          <p className="landing__hero-panel-title">Delivery Focus</p>
          <ul>
            <li>TMF736 revenue sharing algorithm CRUD operations</li>
            <li>Event-hub subscription management</li>
            <li>Safe federation runtime through protected wrappers</li>
          </ul>
        </div>
      </header>

      <section className="landing__section landing__section--kpi">
        <div className="grid grid--four">
          {topKpis.map((item) => (
            <article className="kpi" key={item.label}>
              <p className="kpi__label">{item.label}</p>
              <h2 className="kpi__value">{item.value}</h2>
              <p className="kpi__note">{item.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing__section">
        <h2>Federation Contract</h2>
        <div className="grid grid--three">
          {architectureItems.map((item) => (
            <article className="card" key={item.heading}>
              <p className="card__label">{item.heading}</p>
              <h3 className="card__value">{item.value}</h3>
              <p>{item.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing__section">
        <h2>Exposed Modules</h2>
        <div className="pill-list">
          {exposedModules.map((moduleName) => (
            <span className="pill" key={moduleName}>{moduleName}</span>
          ))}
        </div>
      </section>

      <section className="landing__section">
        <h2>TMF736 Resource Pages</h2>
        <div className="grid grid--three">
          {tmf736Resources.map((resource) => (
            <article className="card" key={resource.title}>
              <h3>{resource.title}</h3>
              <p>{resource.summary}</p>
              <p className="card__path">{resource.path}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing__section">
        <h2>Reliability Safeguards</h2>
        <ul className="list">
          {qualityGuards.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="landing__section landing__section--split">
        <div className="card">
          <h2>Local Development</h2>
          <ol className="list list--ordered">
            {localDevSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>

        <div className="card">
          <h2>Important Files</h2>
          <ul className="list">
            <li>craco.config.js</li>
            <li>src/exposes/PartyRevSharingAlgorithm.tsx</li>
            <li>src/exposes/Hub.tsx</li>
            <li>src/pages/party-rev-sharing-algorithm/index.tsx</li>
            <li>src/pages/hub/index.tsx</li>
          </ul>
        </div>
      </section>

      <section className="landing__section">
        <h2>Quick Links</h2>
        <div className="grid grid--three">
          {quickLinks.map((item) => (
            <a className="quick-link" href={item.href} target="_blank" rel="noreferrer" key={item.href}>
              <span className="quick-link__label">{item.label}</span>
              <span className="quick-link__href">{item.href}</span>
              <span className="quick-link__note">{item.note}</span>
            </a>
          ))}
        </div>
      </section>

      <footer className="landing__footer">
        <span>design-lab prototype — see D:\oh-my-tmf-agent-workspace\design-lab\revenue-sharing-algorithm for structure notes.</span>
      </footer>
    </div>
  );
}

export default App;
