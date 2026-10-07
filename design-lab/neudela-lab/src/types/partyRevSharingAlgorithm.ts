/**
 * TMF736 Revenue Sharing Algorithm Management v5.0.0 — TypeScript types, from the neudela-fe/v1 spec
 * (`app.schemas`, aligned with the OAS). Optional unless the OAS / backend requires it.
 */

export interface PolicyRef {
  id: string;
  href?: string;
  name?: string;
  version?: string;
  '@type'?: string;
  '@baseType'?: string;
  '@schemaLocation'?: string;
  '@referredType'?: string;
}

export interface PolicyConditionRef {
  id: string;
  href?: string;
  name?: string;
  '@type'?: string;
  '@baseType'?: string;
  '@schemaLocation'?: string;
  '@referredType'?: string;
}

export interface PolicyVariableRef {
  id: string;
  href?: string;
  name?: string;
  '@type'?: string;
  '@baseType'?: string;
  '@schemaLocation'?: string;
  '@referredType'?: string;
}

export interface PolicyActionRef {
  id: string;
  href?: string;
  name?: string;
  '@type'?: string;
  '@baseType'?: string;
  '@schemaLocation'?: string;
  '@referredType'?: string;
}

export interface PartyRevSharingPolicyConditionVariable {
  id?: string;
  href?: string;
  value?: string;
  policyCondition?: PolicyConditionRef;
  policyConditionVariable?: PolicyVariableRef;
  '@type'?: string;
  '@baseType'?: string;
  '@schemaLocation'?: string;
}

export interface PartyRevSharingPolicyActionVariable {
  id?: string;
  href?: string;
  value?: string;
  policyAction?: PolicyActionRef;
  policyActionVariable?: PolicyVariableRef;
  '@type'?: string;
  '@baseType'?: string;
  '@schemaLocation'?: string;
}

export interface PartyRevSharingAlgorithm {
  id: string;
  href?: string;
  name?: string;
  description?: string;
  /** Not in the OAS — added by the backend. */
  createdDate?: string;
  /** Not in the OAS — added by the backend. */
  lastUpdate?: string;
  policy: PolicyRef[];
  conditionVariable?: PartyRevSharingPolicyConditionVariable[];
  actionVariable?: PartyRevSharingPolicyActionVariable[];
  '@type'?: string;
  '@baseType'?: string;
  '@schemaLocation'?: string;
}

/** Create body (FVO): id, href and server-managed dates are never sent. */
export interface PartyRevSharingAlgorithm_FVO {
  name: string;
  description?: string;
  policy: PolicyRef[];
  conditionVariable?: PartyRevSharingPolicyConditionVariable[];
  actionVariable?: PartyRevSharingPolicyActionVariable[];
  '@type': string;
}

/** Update body (MVO). */
export interface PartyRevSharingAlgorithm_MVO {
  name?: string;
  description?: string;
  policy?: PolicyRef[];
  conditionVariable?: PartyRevSharingPolicyConditionVariable[];
  actionVariable?: PartyRevSharingPolicyActionVariable[];
  '@type'?: string;
}

export interface Hub {
  id: string;
  href?: string;
  callback: string;
  query?: string;
  '@type'?: string;
}

/** Create body (FVO): id, href and server-managed dates are never sent. */
export interface Hub_FVO {
  callback: string;
  query?: string;
  '@type'?: string;
}
