// Types of the Overview page's data (src/app/summary.ts) and the external-lookup rows,
// derived from the app's lookups (src/app/lookups.ts).
import { LOOKUPS, LOOKUP_ENV, LOOKUP_REFS } from '../../app/lookups';

export interface ApiInfo {
  tmfNumber: string;
  title: string;
  version: string;
  description: string;
  basePath: string;
  /** Header sent when VITE_API_KEY is set. */
  authHeader: string;
}

export interface ResourceSummary {
  name: string;
  description: string;
  route: string;
  /** Nav label of the page the "Open" button goes to. */
  pageLabel: string;
  collectionPath: string;
  itemPath: string;
  requiredOnCreate: string[];
  /** Embedded lists: `ref` = references to another API's entity, `entry` = owned rows. */
  subResources: { name: string; kind: 'ref' | 'entry'; minItems?: number }[];
}

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface OperationSummary {
  method: HttpMethod;
  path: string;
  operationId: string;
  summary: string;
  /** 2xx statuses declared by the OAS. */
  success: string[];
  /** Called by this frontend although the OAS does not define it. */
  notInSpec?: boolean;
}

export interface EventSummary {
  name: string;
  kind: string;
  listenerPath: string;
}

export interface ModuleSummary {
  /** Module Federation expose key. */
  key: string;
  pageName: string;
  route: string;
  label: string;
}

/** This app as a Module Federation remote (vite.config.ts). */
export interface FederationSummary {
  /** Remote name a host registers. */
  name: string;
  remoteEntry: string;
  /** Shared singletons (the host provides its copy when it has one). */
  shared: string[];
}

export interface LookupSummary {
  reference: string;
  service: string;
  path: string;
  env: string;
  configured: boolean;
}

export const LOOKUP_SUMMARY: LookupSummary[] = Object.entries(LOOKUPS).map(([key, config]) => ({
  reference: LOOKUP_REFS[key],
  service: config.service,
  path: `${config.basePath}${config.path}`,
  env: LOOKUP_ENV[key],
  configured: Boolean(config.baseUrl),
}));
