import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, Pencil } from 'lucide-react';
import { NeuronAlert, NeuronButton } from 'neudela';
import type { BreadcrumbItem } from 'neudela';
import DetailHeader from '../components/detail/DetailHeader';
import { DetailTabPanel, DetailTabs } from '../components/detail/DetailTabs';
import type { DetailTab } from '../components/detail/DetailTabs';
import {
  DetailCard,
  DetailSearch,
  EntityCard,
  EntityGrid,
  KeyValueList,
  ViewAllButton,
  searchableText,
} from '../components/detail/DetailCard';
import type { EntityField } from '../components/detail/DetailCard';
import DetailTable from '../components/detail/DetailTable';
import { EntityRows, RuleSection, StatStrip, Timeline } from '../components/detail/OverviewBlocks';
import type { RuleItem } from '../components/detail/OverviewBlocks';
import ViewToggle from '../components/detail/ViewToggle';
import type { ViewMode } from '../components/detail/ViewToggle';
import { formatDateTime, formatRelativeTime } from '../components/list-table/format';
import { Toast, useToast } from '../components/Toast';
import { getErrorMessage } from '../service';
import ResourceFormDialog from './ResourceFormDialog';
import ResourceListPage from './ResourceListPage';
import { at, countOf, plural, text } from './expr';
import { icon, tableColumns } from './render';
import type { CardFieldConfig, CollectionConfig, NestedConfig, OverviewBlockConfig, ResourceConfig, RuleSideConfig } from './types';

// Record page in the layout of the Neudela Logistics Dashboard shipment detail: header with
// the copyable id, underlined tabs with counts, an Overview of preview cards + key dates,
// and one tab per embedded list — all from the resource's detail config. Edit (when the API
// has an update operation) opens the form dialog prefilled with the record.

type Rec = Record<string, any>;

const PREVIEW_ROWS = 5;

/** Every attribute of a nested reference (TMF *Ref), labelled with its role. */
const refFields = (role: string, r?: Rec): EntityField[] => [
  { label: `${role} ID`, value: r?.id, mono: true },
  { label: `${role} type`, value: r?.['@referredType'] ?? r?.['@type'], mono: true },
  { label: `${role} href`, value: r?.href, mono: true },
  { label: `${role} base type`, value: r?.['@baseType'], mono: true },
  { label: `${role} schema`, value: r?.['@schemaLocation'], mono: true },
];

const cardFields = (fields: CardFieldConfig[], item: Rec): EntityField[] => fields.flatMap((f) => (
  'refOf' in f ? refFields(f.role, at(item, f.refOf) as Rec | undefined) : [{ label: f.label, value: text(f.value, item), mono: f.mono }]
));

interface Props {
  config: ResourceConfig;
  id: string;
  onBack: () => void;
  /** Ancestors in the breadcrumb (a nested record: the parent list, then the parent record). */
  crumbs?: BreadcrumbItem[];
}

/** A nested resource's page config, bound to the open parent record. */
const bindNested = (n: NestedConfig, parentId: string): ResourceConfig => ({
  service: n.service(parentId),
  lookups: n.lookups,
  list: n.list,
  ...(n.form ? { form: n.form } : {}),
  ...(n.detail ? { detail: n.detail } : {}),
});

export default function ResourceDetailPage({ config, id, onBack, crumbs }: Readonly<Props>) {
  const detail = config.detail!;
  const [data, setData] = useState<Rec | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const { toast, showToast, closeToast } = useToast();
  const [views, setViews] = useState<Record<string, ViewMode>>(
    () => Object.fromEntries(detail.collections.map((c) => [c.tab, c.defaultView])),
  );
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const canEdit = !!(config.form?.edit && config.service.patch);
  // the nested record open on top of this one (its tab stays selected when coming back)
  const [openNested, setOpenNested] = useState<{ tab: string; id: string } | null>(null);
  const nestedConfigs = useMemo(
    () => Object.fromEntries((detail.nested ?? []).map((n) => [n.tab, bindNested(n, id)])),
    [detail.nested, id],
  );

  const loadDetail = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const result = await config.service.get!(id);
      setData(result);
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [config.service, id, showToast]);

  useEffect(() => { void loadDetail(); }, [loadDetail]);

  const lists = useMemo(
    () => Object.fromEntries(detail.collections.map((c) => [c.tab, ((data?.[c.source] as Rec[] | undefined) ?? [])])),
    [data, detail.collections],
  );

  const breadcrumbRoot = { label: detail.breadcrumbRoot, onClick: onBack };
  const ancestors = crumbs ?? [breadcrumbRoot];
  const backButton = (
    <NeuronButton type="button" variant="secondary" leadingIcon={<ArrowLeft size={16} />} onClick={onBack}>
      {crumbs ? `Back to ${crumbs[crumbs.length - 1].label}` : 'Back to list'}
    </NeuronButton>
  );

  if (loading) {
    return (
      <div className="lab-page dt-page" aria-busy="true">
        <span className="dt-sr-only" role="status">{detail.loadingText}</span>
        <div className="dt-header">
          <div className="dt-skel dt-skel--crumb" />
          <div className="dt-skel dt-skel--title" />
          <div className="dt-skel dt-skel--text" />
        </div>
        <div className="dt-skel dt-skel--tabs" />
        <div className="dt-overview">
          <div className="dt-overview__main"><div className="dt-skel dt-skel--card" /></div>
          <div className="dt-overview__aside"><div className="dt-skel dt-skel--card" /></div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="lab-page dt-page">
        <DetailHeader breadcrumbs={[...ancestors, { label: id }]} title={detail.notFound.title} actions={backButton} />
        <NeuronAlert
          variant="danger"
          title={detail.notFound.alertTitle}
          description={detail.notFound.alertDescription.replace('{id}', id)}
        />
        <Toast toast={toast} onClose={closeToast} />
      </div>
    );
  }

  const recordTitle = String(at(data, detail.header.title) ?? '');

  // a nested record replaces this page; its breadcrumb runs through this record
  if (openNested && nestedConfigs[openNested.tab]?.detail) {
    return (
      <ResourceDetailPage
        key={`${openNested.tab}:${openNested.id}`}
        config={nestedConfigs[openNested.tab]}
        id={openNested.id}
        onBack={() => setOpenNested(null)}
        crumbs={[...ancestors, { label: recordTitle, onClick: () => setOpenNested(null) }]}
      />
    );
  }

  const goTo = (tab: string) => () => setActiveTab(tab);

  // ── Overview ──
  const ruleItems = (side: RuleSideConfig): RuleItem[] => ((data[side.source] as Rec[] | undefined) ?? [])
    .slice(0, PREVIEW_ROWS)
    .map((item, i) => ({
      key: item.id ?? String(i),
      title: text(side.title, item, i) ?? '',
      variable: text(side.variable, item, i),
      value: at(item, side.value) as string | undefined,
      ids: side.ids.map((x) => ({ label: x.label, value: at(item, x.path) as string | undefined })),
    }));

  const block = (b: OverviewBlockConfig): ReactNode => {
    if (b.block === 'rule-flow') {
      const hidden = [b.when, b.then].reduce((n, side) => n + Math.max(0, countOf(data, side.source) - PREVIEW_ROWS), 0);
      return (
        <DetailCard
          key={b.title}
          title={b.title}
          count={text(b.count, data)}
          flush
          actions={hidden > 0 ? <ViewAllButton label={b.viewAll.label} onClick={goTo(b.viewAll.goTo)} /> : undefined}
        >
          <div className="dt-rules">
            <RuleSection kind="when" label={b.when.label} icon={icon(b.when.icon)} items={ruleItems(b.when)} emptyText={b.when.emptyText} />
            <RuleSection kind="then" label={b.then.label} icon={icon(b.then.icon)} items={ruleItems(b.then)} emptyText={b.then.emptyText} />
          </div>
        </DetailCard>
      );
    }
    if (b.block === 'entity-rows') {
      const items = (data[b.source] as Rec[] | undefined) ?? [];
      return (
        <DetailCard
          key={b.title}
          title={b.title}
          count={items.length}
          flush
          actions={items.length > 0 ? <ViewAllButton label={b.viewAll.label} onClick={goTo(b.viewAll.goTo)} /> : undefined}
        >
          <EntityRows
            emptyText={b.emptyText}
            items={items.slice(0, PREVIEW_ROWS).map((x, i) => ({
              key: x.id ?? String(i),
              icon: icon(b.icon),
              title: text(b.itemTitle, x, i) ?? '',
              subtitle: text(b.subtitle, x, i) ?? '',
              meta: at(x, b.meta) as string | undefined,
            }))}
          />
        </DetailCard>
      );
    }
    if (b.block === 'timeline') {
      return (
        <DetailCard key={b.title} title={b.title} flush>
          <Timeline
            items={b.items.flatMap((t) => {
              const v = at(data, t.path) as string | undefined;
              return v ? [{ key: t.key, icon: icon(t.icon), title: t.title, time: formatDateTime(v), sub: formatRelativeTime(v) }] : [];
            })}
          />
        </DetailCard>
      );
    }
    return (
      <DetailCard key={b.title} title={b.title} flush>
        <KeyValueList
          items={b.items.map((kv) => {
            const v = (kv.value ? text(kv.value, data) : at(data, kv.path)) as string | undefined;
            return { label: kv.label, value: kv.link && v ? <a href={v} target="_blank" rel="noreferrer">{v}</a> : v, mono: kv.mono };
          })}
        />
      </DetailCard>
    );
  };

  const overview = (
    <div className="dt-overview-stack">
      <StatStrip
        label={detail.overview.stats.label}
        items={detail.overview.stats.items.map((s) => ({
          key: s.key,
          label: s.label,
          icon: icon(s.icon),
          value: text(s.value, data) ?? '',
          hint: text(s.hint, data),
          ...(s.goTo ? { onClick: goTo(s.goTo) } : {}),
          ...(s.ariaLabel ? { ariaLabel: text(s.ariaLabel, data) } : {}),
        }))}
      />

      {/* no main blocks (a record without embedded lists): the side cards share the full width */}
      <div className={detail.overview.main.length ? 'dt-overview' : 'dt-overview dt-overview--aside-only'}>
        {detail.overview.main.length > 0 && (
          <div className="dt-overview__main">
            {detail.overview.main.map(block)}
          </div>
        )}

        <aside className="dt-overview__aside" aria-label="Record details">
          {detail.overview.aside.map(block)}
        </aside>
      </div>
    </div>
  );

  // ── Embedded lists ──
  const noMatch = (q: string) => `Nothing matches “${q}”.`;
  const collectionTab = (c: CollectionConfig) => {
    const items = lists[c.tab];
    const query = queries[c.tab] ?? '';
    const q = query.trim().toLowerCase();
    const filtered = q ? items.filter((i) => searchableText(i).includes(q)) : items;
    const view = views[c.tab];
    const empty = q ? noMatch(query.trim()) : `No ${c.title.toLowerCase()}.`;
    return (
      <DetailCard
        title={c.title}
        count={plural(items.length, c.count.one, c.count.many)}
        flush={view === 'table'}
        actions={
          <>
            <DetailSearch label={c.search.label} placeholder={c.search.placeholder} value={query} onChange={(v) => setQueries((s) => ({ ...s, [c.tab]: v }))} />
            <ViewToggle value={view} onChange={(v) => setViews((s) => ({ ...s, [c.tab]: v }))} />
          </>
        }
      >
        {view === 'card' ? (
          filtered.length === 0 ? (
            <p className="dt-empty">{empty}</p>
          ) : (
            <EntityGrid>
              {filtered.map((item, i) => (
                <EntityCard
                  key={item.id ?? i}
                  icon={icon(c.card.icon)}
                  title={text(c.card.title, item, i) ?? ''}
                  subtitle={text(c.card.subtitle, item, i)}
                  fields={cardFields(c.card.fields, item)}
                />
              ))}
            </EntityGrid>
          )
        ) : (
          <DetailTable<Rec>
            key={q}
            columns={tableColumns<Rec>(c.columns)}
            rows={filtered}
            emptyText={empty}
          />
        )}
      </DetailCard>
    );
  };

  const tabContent = (key: string): ReactNode => {
    const nested = nestedConfigs[key];
    if (nested) {
      // the nested collection, live from its own API path (list, search, filters, create / delete)
      return (
        <ResourceListPage
          config={nested}
          embedded
          onViewDetail={nested.detail ? (childId) => setOpenNested({ tab: key, id: childId }) : undefined}
        />
      );
    }
    const collection = detail.collections.find((c) => c.tab === key);
    return collection ? collectionTab(collection) : overview;
  };

  const tabs: (DetailTab & { content: ReactNode })[] = detail.tabs.map((t) => ({
    key: t.key,
    label: t.label,
    icon: icon(t.icon),
    ...(t.count ? { count: countOf(data, t.count) } : {}),
    content: tabContent(t.key),
  }));

  const actions = canEdit ? (
    <>
      {backButton}
      <NeuronButton type="button" variant="primary" leadingIcon={<Pencil size={16} />} onClick={() => setEditing(true)}>
        Edit
      </NeuronButton>
    </>
  ) : backButton;

  return (
    <div className="lab-page dt-page">
      <DetailHeader
        breadcrumbs={[...ancestors, { label: recordTitle }]}
        title={recordTitle}
        recordId={at(data, detail.header.recordId) as string | undefined}
        description={at(data, detail.header.description) as string | undefined}
        actions={actions}
      />

      <DetailTabs
        idPrefix={detail.idPrefix}
        ariaLabel={detail.tabsAriaLabel}
        tabs={tabs}
        value={activeTab}
        onChange={setActiveTab}
      />

      <DetailTabPanel idPrefix={detail.idPrefix} tabKey={activeTab}>
        {tabs.find((t) => t.key === activeTab)?.content}
      </DetailTabPanel>

      {canEdit && (
        <ResourceFormDialog
          config={config}
          open={editing}
          record={data}
          onClose={() => setEditing(false)}
          onSaved={async (message) => {
            setEditing(false);
            showToast(message);
            await loadDetail(true);
          }}
          onError={(message) => showToast(message, 'error')}
        />
      )}

      <Toast toast={toast} onClose={closeToast} />
    </div>
  );
}
