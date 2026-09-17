/**
 * Lookup service for the Policy / PolicyCondition / PolicyAction / PolicyVariable
 * entities referenced by PartyRevSharingAlgorithm — used to back the Autocomplete
 * fields in CreatePartyRevSharingAlgorithmDialog so users search-and-select instead
 * of typing an id by hand (id/name are relations to another domain's data, not
 * something this MFE owns or can validate on its own).
 *
 * TODO: CUSTOMIZE — no Policy Management service exists yet anywhere in this
 * workspace (verified: no `*polic*` service directory under tm-forum or
 * tm-forum/mcs/general). Set REACT_APP_POLICY_API_BASE_URL once one exists, and
 * confirm the actual resource paths below (`/policy`, `/policyCondition`,
 * `/policyAction`, `/policyVariable`) and search param name (`q` is a guess —
 * follow whatever that service's list endpoint actually supports) match its API.
 * Until then this always resolves to an empty list, so the Autocomplete renders
 * correctly (no options, no crash) rather than hitting a fabricated URL.
 */

export interface PolicyOption {
  id: string;
  name: string;
  href?: string;
}

const POLICY_BASE_URL = process.env.REACT_APP_POLICY_API_BASE_URL;

let warnedMissingBaseUrl = false;

async function searchLookup(path: string, query: string): Promise<PolicyOption[]> {
  if (!POLICY_BASE_URL) {
    if (!warnedMissingBaseUrl) {
      // eslint-disable-next-line no-console
      console.warn('[policyLookupService] REACT_APP_POLICY_API_BASE_URL is not set — Policy/PolicyCondition/PolicyAction/PolicyVariable autocomplete fields will show no options until a real Policy Management service is wired up.');
      warnedMissingBaseUrl = true;
    }
    return [];
  }
  try {
    const url = `${POLICY_BASE_URL}${path}?q=${encodeURIComponent(query)}&limit=20`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((d: any) => ({ id: d.id, name: d.name ?? d.id, href: d.href }));
  } catch {
    return [];
  }
}

export const searchPolicies = (query: string) => searchLookup('/policy', query);
export const searchPolicyConditions = (query: string) => searchLookup('/policyCondition', query);
export const searchPolicyActions = (query: string) => searchLookup('/policyAction', query);
export const searchPolicyVariables = (query: string) => searchLookup('/policyVariable', query);
