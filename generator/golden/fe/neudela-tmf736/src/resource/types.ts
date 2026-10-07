import type { ListParams } from '../service/api';
import type { Expr } from './expr';
import type { ICONS } from '../app/icons';
import type { LookupOption } from '../service/lookupService';

// A resource page described as data. The runtime in src/resource renders it; the generator
// writes one config per page (src/pages/<page>/config.ts) from the neudela-fe/v1 spec.

export type IconName = keyof typeof ICONS;

export interface IconRef {
  icon: IconName;
  size: number;
}

export interface ResourceService {
  list: (params: ListParams) => Promise<{ data: any[]; total: number }>;
  get?: (id: string) => Promise<any>;
  /** Absent when the API has no create / delete operation for the resource. */
  create?: (body: any) => Promise<unknown>;
  /** Partial update (TMF PATCH, JSON merge): only the changed attributes are sent. */
  patch?: (id: string, body: any) => Promise<unknown>;
  remove?: (id: string) => Promise<unknown>;
}

export type LookupFn = (query: string) => Promise<LookupOption[]>;

// ── list ──

/** Cell renderers of the list and detail tables (see render.tsx). */
export type CellRender =
  | 'id-link'
  | 'primary'
  | 'primary-plain'
  | 'ellipsis'
  | 'mono'
  | 'mono-muted'
  | 'mono-plain'
  | 'count-badge'
  | 'datetime-stack'
  | 'ref-stack';

export interface ColumnConfig {
  key: string;
  label: string;
  /** Every column but one flexible text column has a width (fixed table layout). */
  width?: number;
  sortable?: boolean;
  render: CellRender;
  /** Value shown (and used as title) instead of row[key]. */
  value?: Expr;
  /** Shown when the value is empty: em dash, or a muted placeholder text. */
  empty?: 'em-dash' | { text: string };
  /** count-badge: icon + noun. */
  badge?: { icon: IconName; one: string; many: string };
}

export interface FilterFieldConfig {
  key: string;
  label: string;
  type: 'text' | 'date';
  param?: string;
  /** Embedded list the attribute belongs to (JSONPath `list[?( … )]`). */
  list?: string;
  placeholder?: string;
}

export interface RowActionConfig {
  key: string;
  label: string;
  /** "{field}" placeholders are filled from the row, e.g. "Delete {name}". */
  ariaLabel: string;
  icon: IconRef;
  tone: 'brand' | 'neutral' | 'danger';
  action: 'open-detail' | 'open-edit' | 'confirm-delete';
}

export interface ListConfig {
  breadcrumb: string[];
  title: string;
  subtitle: string;
  card: {
    title: string;
    description: string;
    noun: [string, string];
    minTableWidth: number;
    buttonActionVariant: 'inline' | 'menu';
    rowLabel: string;
    searchPlaceholder: string;
    /** Query parameter the search box sends. */
    searchParam: string;
    emptyTitle: string;
    emptyBody: string;
    /** The create button; absent for a read-only resource. */
    primaryAction?: { label: string; icon: IconRef };
    refresh: boolean;
    rowClick: 'open-detail' | 'none';
  };
  /** Row field → value read from the API item (raw values; formatting happens in the cell). */
  rowFrom: Record<string, Expr>;
  columns: ColumnConfig[];
  sortOptions: { key: string; label: string }[];
  filterFields: FilterFieldConfig[];
  rowActions: RowActionConfig[];
  mobileCard: {
    id: string;
    title: string;
    /** Column key whose cell is shown as the card badge. */
    badge?: string;
    subtitle?: Expr;
    meta?: Expr;
  };
  /** The delete confirmation; absent when the resource cannot be deleted. */
  delete?: {
    title: string;
    /** "<strong>{field}</strong> rest" — the bold part is the row field. */
    strong: string;
    strongClassName?: string;
    text: string;
    confirmLabel: string;
    toast: string;
  };
}

// ── form ──

export interface Rule {
  message: string;
}

/** A relation picked from its lookup (LOV): id + name, never typed. */
export interface RefFieldConfig {
  kind: 'ref';
  name: string;
  lookup: string;
  label: string;
  placeholder: string;
  required?: Rule;
  /** The first item carries the group's "select at least one" error instead of its own rule. */
  groupRuleOnFirst?: boolean;
}

/** One-value controls: usable at the top of a form, inside a group and inside a list item. */
export type ScalarFieldConfig =
  | {
      kind: 'text' | 'url';
      name: string;
      label: string;
      ariaLabel: string;
      placeholder: string;
      required?: Rule;
      /** url: a full http(s) URL. */
      pattern?: Rule;
      /** Muted line under the field (replaced by the error message when invalid). */
      helperText?: string;
      /**
       * An identifier of another system that has no lookup (no *Ref schema), typed by hand —
       * allowed by the generator's field policy. Relations never are: they come from a LOV.
       */
      manualId?: boolean;
    }
  | {
      kind: 'textarea';
      name: string;
      label: string;
      placeholder: string;
      autoResize?: boolean;
      minRows: number;
      maxRows?: number;
      helperText?: string;
    }
  | {
      /** A yes/no attribute: one checkbox (never a toggle — a toggle acts at once, a form submits). */
      kind: 'boolean';
      name: string;
      label: string;
      /** Muted line under the label. */
      description?: string;
    }
  | {
      /** A date (date-time attribute): popover date picker; the value is sent as ISO 8601 (start of the local day). */
      kind: 'date';
      name: string;
      label: string;
      placeholder: string;
      required?: Rule;
      helperText?: string;
    }
  | {
      /** A value from a fixed list (OAS enum): single-select dropdown. */
      kind: 'enum';
      name: string;
      label: string;
      placeholder: string;
      options: { value: string; label: string }[];
      required?: Rule;
      helperText?: string;
    }
  | {
      /** A number attribute: numeric input; sent as a JSON number (payload `as: number`). */
      kind: 'number';
      name: string;
      label: string;
      placeholder: string;
      /** OAS type integer: whole numbers only. */
      integer?: boolean;
      required?: Rule;
      helperText?: string;
    }
  | {
      /** A free-form object / array attribute: JSON text, checked on entry, sent parsed (payload `as: json`). */
      kind: 'json';
      name: string;
      label: string;
      placeholder: string;
      /** What the text must parse to. */
      jsonType: 'object' | 'array';
      required?: Rule;
      helperText?: string;
    };

export type ItemFieldConfig =
  | RefFieldConfig
  | {
      kind: 'value';
      name: string;
      /** Visible label (default "Value"). */
      label?: string;
      /** An identifier with no lookup, typed by hand (field policy) — see the text field's manualId. */
      manualId?: boolean;
      /** "{n}" = item number. */
      ariaLabel: string;
      placeholder: string;
      required: Rule;
    }
  | ScalarFieldConfig
  | {
      /** A list inside each item (an entry's own embedded list): one level deep. */
      kind: 'list';
      name: string;
      title: string;
      emptyText: string;
      addLabel: string;
      item: { title: string; removeLabel: string; grid?: 2 | 3; fields: Exclude<ItemFieldConfig, { kind: 'list' }>[] };
    };

export type FieldConfig =
  | ScalarFieldConfig
  /** A single relation (top-level *Ref / RefOrValue): one LOV picker. */
  | RefFieldConfig
  | {
      /** A small value object (TimePeriod, Money, Quantity…): its attributes side by side. */
      kind: 'group';
      name: string;
      label: string;
      hint: string;
      fields: ScalarFieldConfig[];
    }
  | {
      kind: 'repeatable';
      name: string;
      section: { title: string; required?: boolean; hint: string };
      initialItems: number;
      /** At least one item with `path` filled (array-level rule). */
      minItems?: { path: string; message: string };
      emptyText?: string;
      item: {
        title: string;
        removeLabel: string;
        canRemove: 'more-than-one' | 'always';
        grid?: 2 | 3;
        fields: ItemFieldConfig[];
      };
      addLabel: string;
    };

/** Request body, key order = emit order. */
export type PayloadNode =
  | { const: string }
  /** `as`: number → a JSON number, json → the parsed JSON text. */
  | { from: string; omitEmpty?: boolean; as?: 'number' | 'json' }
  /** Items kept when any `keepWhen` path is filled; each becomes `item` (an object) or `each` (one value). */
  | { array: string; keepWhen: string[]; omitEmpty?: boolean; item: Record<string, PayloadNode> }
  | { array: string; keepWhen: string[]; omitEmpty?: boolean; each: PayloadNode }
  | { lovRef: string; type: string; referredType: string; omitEmpty?: boolean }
  /** A value object built from the values under `object` (dropped when it comes out empty). */
  | { object: string; omitEmpty?: boolean; item: Record<string, PayloadNode> };

export interface FormConfig {
  formId: string;
  width: 'wide' | 'narrow';
  title: string;
  description: string;
  submitLabel: string;
  /** react-hook-form mode: submit (default) or touched (validate a field once it is left). */
  validateOn: 'submit' | 'touched';
  fields: FieldConfig[];
  /** Last check before the request (shown as an error toast). */
  guard: ({ required: string; message: string } | { anyItem: string; path: string; message: string })[];
  payload: Record<string, PayloadNode>;
  toast: string;
  /** The same dialog in edit mode (PATCH); absent when the API has no update operation. */
  edit?: EditFormConfig;
}

export interface EditFormConfig {
  formId: string;
  /** "{field}" placeholders are filled from the record, e.g. "Edit {name}". */
  title: string;
  description: string;
  submitLabel: string;
  /** Form fields shown when editing: the update schema's (_MVO) subset of `fields`, by name. */
  fields: string[];
  /** Request attributes a PATCH may carry (the _MVO, without @type); only changed ones are sent. */
  payload: string[];
  toast: string;
  /** Toast when the form is saved unchanged (no request is made). */
  noChanges: string;
}

// ── detail ──

export interface StatItemConfig {
  key: string;
  label: string;
  icon: IconRef;
  value: Expr;
  hint: Expr;
  goTo?: string;
  ariaLabel?: Expr;
}

export interface RuleSideConfig {
  label: string;
  icon: IconRef;
  source: string;
  emptyText: string;
  title: Expr;
  variable: Expr;
  value: string;
  ids: { label: string; path: string }[];
}

export type OverviewBlockConfig =
  | {
      block: 'rule-flow';
      title: string;
      count: Expr;
      viewAll: { label: string; goTo: string };
      when: RuleSideConfig;
      then: RuleSideConfig;
    }
  | {
      block: 'entity-rows';
      title: string;
      source: string;
      viewAll: { label: string; goTo: string };
      emptyText: string;
      icon: IconRef;
      itemTitle: Expr;
      subtitle: Expr;
      meta: string;
    }
  | {
      block: 'timeline';
      title: string;
      items: { key: string; path: string; icon: IconRef; title: string }[];
    }
  | {
      block: 'key-value';
      title: string;
      /** `value` (an Expr) formats the attribute, e.g. { yesNo } for a boolean or { dateTime } for a date. */
      items: { label: string; path: string; mono?: boolean; link?: boolean; value?: Expr }[];
    };

/** One line of an entity card; `refOf` expands into every attribute of a TMF *Ref. */
export type CardFieldConfig =
  | { label: string; value: Expr; mono?: boolean }
  | { refOf: string; role: string };

export interface CollectionConfig {
  tab: string;
  source: string;
  title: string;
  count: { one: string; many: string };
  search: { label: string; placeholder: string };
  defaultView: 'card' | 'table';
  card: { icon: IconRef; title: Expr; subtitle: Expr; fields: CardFieldConfig[] };
  columns: ColumnConfig[];
}

/**
 * A resource nested under this one (OAS `/parent/{id}/child`): one tab of the record page holds
 * its list, and its rows open its own record page (breadcrumbs through the parent).
 */
export interface NestedConfig {
  /** Tab key (in DetailConfig.tabs) that shows the nested list. */
  tab: string;
  /** The child collection, bound to the open parent record. */
  service: (parentId: string) => ResourceService;
  lookups: Record<string, LookupFn>;
  list: ListConfig;
  form?: FormConfig;
  detail?: DetailConfig;
}

export interface DetailConfig {
  idPrefix: string;
  tabsAriaLabel: string;
  breadcrumbRoot: string;
  header: { title: string; recordId: string; description: string };
  loadingText: string;
  notFound: { title: string; alertTitle: string; alertDescription: string };
  tabs: { key: string; label: string; icon: IconRef; count?: string }[];
  overview: {
    stats: { label: string; items: StatItemConfig[] };
    main: OverviewBlockConfig[];
    aside: OverviewBlockConfig[];
  };
  collections: CollectionConfig[];
  /** Resources nested under this one, each in its own tab. */
  nested?: NestedConfig[];
}

export interface ResourceConfig {
  service: ResourceService;
  lookups: Record<string, LookupFn>;
  list: ListConfig;
  /** Absent for a resource without a create operation. */
  form?: FormConfig;
  detail?: DetailConfig;
}
