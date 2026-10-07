import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Boxes, Database, Network, Radio } from 'lucide-react';
import { NeuronBadge, NeuronButton, NeuronCard } from 'neudela';
import type { NeuronBadgeVariant, NeuronTableColumn } from 'neudela';
import { DetailCard, KeyValueList } from '../../components/detail/DetailCard';
import DetailTable from '../../components/detail/DetailTable';
import { EntityRows } from '../../components/detail/OverviewBlocks';
import {
  API_INFO,
  EVENTS,
  FEDERATION,
  MODULES,
  OPERATIONS,
  PRIMARY_RESOURCE_NOUN,
  RESOURCES,
  countPrimaryResource,
} from '../../app/summary';
import { LOOKUP_SUMMARY } from './summary';
import type { HttpMethod, LookupSummary, OperationSummary } from './summary';

// Home of the app: what the TMF API offers (resources, operations, events) and how this
// frontend is packaged (MFE modules, external lookups). Content lives in src/app/summary.ts.

const METHOD_BADGE: Record<HttpMethod, NeuronBadgeVariant> = {
  GET: 'info',
  POST: 'success',
  PATCH: 'warning',
  DELETE: 'error',
};

const OPERATION_COLUMNS: NeuronTableColumn<OperationSummary>[] = [
  {
    key: 'method',
    label: 'Method',
    width: 110,
    render: (v: HttpMethod) => <NeuronBadge variant={METHOD_BADGE[v]} size="sm">{v}</NeuronBadge>,
  },
  {
    key: 'path',
    label: 'Path',
    width: 280,
    render: (v: string) => <span className="lt-cell-ellipsis lt-cell-mono" title={v}>{v}</span>,
  },
  {
    key: 'operationId',
    label: 'Operation',
    render: (v: string, r) => (
      <div className="lt-cell-stack">
        <span className="lt-cell-ellipsis lt-cell-primary" title={r.summary}>
          {r.summary}
          {r.notInSpec && <> <NeuronBadge variant="warning" size="sm" pill>Not in spec</NeuronBadge></>}
        </span>
        <span className="lt-cell-stack__sub lab-mono" title={v}>{v}</span>
      </div>
    ),
  },
  {
    key: 'success',
    label: 'Success',
    width: 130,
    render: (v: string[]) => <span className="lt-cell-mono">{v.join(' · ')}</span>,
  },
];

const LOOKUP_COLUMNS: NeuronTableColumn<LookupSummary>[] = [
  { key: 'reference', label: 'Reference', width: 190, render: (v: string) => <span className="lt-cell-primary lt-cell-mono">{v}</span> },
  { key: 'service', label: 'Service', width: 170 },
  { key: 'path', label: 'Path', render: (v: string) => <span className="lt-cell-ellipsis lt-cell-mono" title={v}>{v}</span> },
  { key: 'env', label: 'Base URL', width: 250, render: (v: string) => <span className="lt-cell-mono lt-cell-muted">{v}</span> },
  {
    key: 'configured',
    label: 'Status',
    width: 140,
    render: (v: boolean) => (
      <NeuronBadge variant={v ? 'success' : 'gray'} size="sm" pill>{v ? 'Configured' : 'Not configured'}</NeuronBadge>
    ),
  },
];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Total of the primary resource from X-Total-Count; null while loading, 'error' when unreachable. */
function usePrimaryTotal() {
  const [total, setTotal] = useState<number | null | 'error'>(null);
  useEffect(() => {
    let alive = true;
    countPrimaryResource({ limit: 1 })
      .then((r) => { if (alive) setTotal(r.total); })
      .catch(() => { if (alive) setTotal('error'); });
    return () => { alive = false; };
  }, []);
  return total;
}

export default function OverviewPage() {
  const navigate = useNavigate();
  const total = usePrimaryTotal();
  const specOperations = OPERATIONS.filter((o) => !o.notInSpec);

  let totalValue = '…';
  let totalNote = 'Loading from the API';
  if (total === 'error') {
    totalValue = '—';
    totalNote = 'Unavailable — the API could not be reached';
  } else if (total !== null) {
    totalValue = String(total);
    totalNote = 'Live, from X-Total-Count';
  }

  const kpis = [
    { label: 'Resources', value: String(RESOURCES.length), note: RESOURCES.map((r) => r.name).join(', ') },
    { label: 'Operations', value: String(specOperations.length), note: 'Defined by the OAS, incl. event hub' },
    { label: 'Notification events', value: String(EVENTS.length), note: 'Delivered to hub subscribers' },
    { label: PRIMARY_RESOURCE_NOUN, value: totalValue, note: totalNote },
  ];

  return (
    <div className="lab-page">
      <header className="lab-hero">
        <div>
          <p className="lab-hero__eyebrow">TMF{API_INFO.tmfNumber} · Open API v{API_INFO.version}</p>
          <h1 className="lab-hero__title">{API_INFO.title}</h1>
          <p className="lab-hero__text">{API_INFO.description}</p>
          <div className="lab-hero__actions">
            {MODULES.map((m, i) => (
              <NeuronButton
                key={m.key}
                variant={i === 0 ? 'primary' : 'secondary'}
                trailingIcon={i === 0 ? <ArrowRight size={16} /> : undefined}
                onClick={() => navigate(m.route)}
              >
                Open {m.label}
              </NeuronButton>
            ))}
          </div>
        </div>
        <div className="lab-hero__panel">
          <p className="lab-hero__panel-title">API</p>
          <dl className="lab-facts">
            <div><dt>Base path</dt><dd className="lab-mono lab-mono--strong">{API_INFO.basePath}</dd></div>
            <div><dt>Specification</dt><dd>TMF{API_INFO.tmfNumber} v{API_INFO.version}</dd></div>
            <div><dt>Authentication</dt><dd><span className="lab-mono lab-mono--strong">{API_INFO.authHeader}</span> header, when configured</dd></div>
            <div><dt>Notifications</dt><dd>{plural(EVENTS.length, 'event', 'events')} via hub subscription</dd></div>
          </dl>
        </div>
      </header>

      <section className="lab-kpi-grid" aria-label="API summary">
        {kpis.map((item) => (
          <NeuronCard key={item.label} variant="outlined" padding="md">
            <p className="lab-kpi__label">{item.label}</p>
            <p className="lab-kpi__value">{item.value}</p>
            <p className="lab-kpi__note">{item.note}</p>
          </NeuronCard>
        ))}
      </section>

      {RESOURCES.map((r) => (
        <DetailCard
          key={r.name}
          title={r.name}
          count="Resource"
          flush
          actions={
            <NeuronButton variant="secondary" size="sm" trailingIcon={<ArrowRight size={14} />} onClick={() => navigate(r.route)}>
              Open {r.pageLabel}
            </NeuronButton>
          }
        >
          <KeyValueList
            items={[
              { label: 'Description', value: r.description },
              { label: 'Collection', value: r.collectionPath, mono: true },
              { label: 'Item', value: r.itemPath, mono: true },
              { label: 'Required on create', value: r.requiredOnCreate.join(', '), mono: true },
              {
                label: 'Embedded lists',
                value: (
                  <span className="lab-pill-row">
                    {r.subResources.map((s) => (
                      <NeuronBadge key={s.name} variant={s.kind === 'ref' ? 'brand' : 'gray'} size="sm" pill>
                        {s.name} · {s.kind === 'ref' ? 'reference' : 'entry'}{s.minItems ? ` · min ${s.minItems}` : ''}
                      </NeuronBadge>
                    ))}
                  </span>
                ),
              },
            ]}
          />
        </DetailCard>
      ))}

      <DetailCard title="API operations" count={plural(OPERATIONS.length, 'operation', 'operations')} flush>
        <DetailTable<OperationSummary> columns={OPERATION_COLUMNS} rows={OPERATIONS} emptyText="No operations." minWidth={760} />
      </DetailCard>

      <DetailCard title="Notification events" count={EVENTS.length} flush>
        <EntityRows
          emptyText="No notification events."
          items={EVENTS.map((e) => ({
            key: e.name,
            icon: <Radio size={16} />,
            title: e.name,
            subtitle: e.kind,
            meta: e.listenerPath,
          }))}
        />
      </DetailCard>

      <DetailCard title="Frontend modules" count="Federated" flush>
        <EntityRows
          emptyText="No exposed modules."
          items={MODULES.map((m) => ({
            key: m.key,
            icon: <Boxes size={16} />,
            title: m.key,
            subtitle: `${m.label} · route ${m.route}`,
            meta: m.pageName,
          }))}
        />
        <KeyValueList
          items={[
            { label: 'Packaging', value: `Module Federation remote ${FEDERATION.name} — ${FEDERATION.remoteEntry}, mf-manifest.json` },
            { label: 'Shared', value: `${FEDERATION.shared.join(', ')} (singletons)` },
            { label: 'Page contract', value: 'Lazy loaded, error boundary with Retry' },
          ]}
        />
      </DetailCard>

      <DetailCard
        title="External lookups"
        count={plural(LOOKUP_SUMMARY.length, 'reference', 'references')}
        flush
        actions={<span className="lab-muted lab-inline-icon"><Network size={14} aria-hidden="true" /> Relations are picked from the API that owns them</span>}
      >
        <DetailTable<LookupSummary> columns={LOOKUP_COLUMNS} rows={LOOKUP_SUMMARY} emptyText="No external lookups." minWidth={900} />
      </DetailCard>

      <p className="lab-muted lab-inline-icon">
        <Database size={14} aria-hidden="true" /> Source: TMF{API_INFO.tmfNumber} v{API_INFO.version} OpenAPI specification.
      </p>
    </div>
  );
}
