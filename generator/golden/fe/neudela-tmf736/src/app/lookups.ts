// Relation lookups of this app: one per referenced entity, each calling the API that owns it.
import { searchLookup } from '../service/lookupService';
import type { LookupConfig } from '../service/lookupService';

const POLICY_MANAGEMENT_URL = import.meta.env.VITE_POLICY_API_BASE_URL;

export const LOOKUPS: Record<string, LookupConfig> = {
  policy: {
    noun: 'policies',
    service: 'Policy Management',
    baseUrl: POLICY_MANAGEMENT_URL,
    basePath: '/tmf-api/policyManagement/v5',
    path: '/policy',
    queryParam: 'name',
    limit: 20,
    labelField: 'name',
    valueField: 'id',
  },
  policyCondition: {
    noun: 'policy conditions',
    service: 'Policy Management',
    baseUrl: POLICY_MANAGEMENT_URL,
    basePath: '/tmf-api/policyManagement/v5',
    path: '/policyCondition',
    queryParam: 'name',
    limit: 20,
    labelField: 'name',
    valueField: 'id',
  },
  policyVariable: {
    noun: 'policy variables',
    service: 'Policy Management',
    baseUrl: POLICY_MANAGEMENT_URL,
    basePath: '/tmf-api/policyManagement/v5',
    path: '/policyVariable',
    queryParam: 'name',
    limit: 20,
    labelField: 'name',
    valueField: 'id',
  },
  policyAction: {
    noun: 'policy actions',
    service: 'Policy Management',
    baseUrl: POLICY_MANAGEMENT_URL,
    basePath: '/tmf-api/policyManagement/v5',
    path: '/policyAction',
    queryParam: 'name',
    limit: 20,
    labelField: 'name',
    valueField: 'id',
  },
};

/** Base-URL env var of each lookup (shown on the Overview). */
export const LOOKUP_ENV: Record<string, string> = {
  policy: 'VITE_POLICY_API_BASE_URL',
  policyCondition: 'VITE_POLICY_API_BASE_URL',
  policyVariable: 'VITE_POLICY_API_BASE_URL',
  policyAction: 'VITE_POLICY_API_BASE_URL',
};

/** The referenced *Ref type of each lookup. */
export const LOOKUP_REFS: Record<string, string> = {
  policy: 'PolicyRef',
  policyCondition: 'PolicyConditionRef',
  policyVariable: 'PolicyVariableRef',
  policyAction: 'PolicyActionRef',
};

/** Stable search functions, one per lookup (the form keeps one state per key). */
export const LOOKUP_FNS = Object.fromEntries(
  Object.entries(LOOKUPS).map(([key, config]) => [key, (query: string) => searchLookup(config, query)]),
);
