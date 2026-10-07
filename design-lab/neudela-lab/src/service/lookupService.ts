/**
 * Lookups (LOVs) behind the relation pickers of the create dialogs: the user selects a
 * referenced entity instead of typing an id. Every lookup calls the API that owns the entity
 * directly; its contract is a LookupConfig (src/app/lookups.ts, one per relation).
 *
 * The referenced service is not required to be up: a missing base URL, a network failure or a
 * non-OK response throws a LookupError whose message is shown under the picker, so the form
 * still opens and explains why the options are missing.
 */

export interface LookupOption {
  id: string;
  name: string;
  href?: string;
}

export interface LookupConfig {
  /** Plural noun for messages, e.g. "policies". */
  noun: string;
  /** Human name of the owning service, e.g. "Policy Management". */
  service: string;
  /** Host of the owning service (env); the base path and resource path are appended. */
  baseUrl: string | undefined;
  basePath: string;
  path: string;
  /** Query parameter carrying the search text (TMF630 attribute filter). */
  queryParam: string;
  limit: number;
  labelField: string;
  valueField: string;
}

export type LookupErrorReason = 'unconfigured' | 'unavailable';

export class LookupError extends Error {
  reason: LookupErrorReason;

  constructor(reason: LookupErrorReason, message: string) {
    super(message);
    this.name = 'LookupError';
    this.reason = reason;
  }
}

export async function searchLookup(config: LookupConfig, query: string): Promise<LookupOption[]> {
  if (!config.baseUrl) {
    throw new LookupError('unconfigured', `Couldn't load ${config.noun} — the ${config.service} service isn't connected yet.`);
  }
  const params = new URLSearchParams({ limit: String(config.limit) });
  if (query.trim()) params.set(config.queryParam, query.trim());
  const unavailable = new LookupError('unavailable', `Couldn't load ${config.noun} — the ${config.service} service is unavailable. Reopen the form to try again.`);

  let data: unknown;
  try {
    const res = await fetch(`${config.baseUrl}${config.basePath}${config.path}?${params}`);
    if (!res.ok) throw unavailable;
    data = await res.json();
  } catch {
    throw unavailable;
  }
  if (!Array.isArray(data)) throw unavailable;
  return data.map((d: Record<string, any>) => ({
    id: String(d[config.valueField]),
    name: String(d[config.labelField] ?? d[config.valueField]),
    href: d.href,
  }));
}
