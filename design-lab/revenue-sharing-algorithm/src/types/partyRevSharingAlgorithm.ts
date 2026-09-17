/**
 * TMF736 Revenue Sharing Algorithm Management v5.0.0 — TypeScript Types
 * Aligned with D:\Neuronworks\project\tm-forum\documents\tmf736\5.0.0\openapi\
 *   TMF736-Revenue_Sharing_Algorithm_Management-v5.0.0.oas.yaml
 * and the generated backend entity at
 *   D:\Neuronworks\project\tm-forum\revenue-sharing-algorithm-service\backend\src\party-rev-sharing-algorithm\
 *
 * TODO: CUSTOMIZE — this whole file is the per-resource type set. For a new TMF
 * component, regenerate these interfaces from that component's OAS spec + entity.
 */

// --- References ---

export interface PolicyRef {
  id: string;
  href?: string;
  name?: string;
  version?: string;
  '@type'?: string;
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

export interface PolicyActionRef {
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

// --- Nested variable entries ---

export interface PartyRevSharingPolicyConditionVariable {
  value?: string;
  policyCondition?: PolicyConditionRef;
  policyConditionVariable?: PolicyVariableRef;
  '@type'?: string;
}

export interface PartyRevSharingPolicyActionVariable {
  value?: string;
  policyAction?: PolicyActionRef;
  policyActionVariable?: PolicyVariableRef;
  '@type'?: string;
}

// --- Main Resource ---

export interface PartyRevSharingAlgorithm {
  id: string;
  href?: string;
  name: string;
  description?: string;
  createdDate?: string;
  lastUpdate?: string;
  /** Required, minimum 1 item per backend @ArrayMinSize(1) */
  policy: PolicyRef[];
  conditionVariable?: PartyRevSharingPolicyConditionVariable[];
  actionVariable?: PartyRevSharingPolicyActionVariable[];
  '@type'?: string;
  '@baseType'?: string;
  '@schemaLocation'?: string;
}

// --- Create DTO (FVO) ---

export interface PartyRevSharingAlgorithm_FVO {
  name: string;
  description?: string;
  policy: PolicyRef[];
  conditionVariable?: PartyRevSharingPolicyConditionVariable[];
  actionVariable?: PartyRevSharingPolicyActionVariable[];
  '@type'?: string;
}

// --- Update DTO (MVO) — DO NOT include id/href, server-managed dates ---

export interface PartyRevSharingAlgorithm_MVO {
  name?: string;
  description?: string;
  policy?: PolicyRef[];
  conditionVariable?: PartyRevSharingPolicyConditionVariable[];
  actionVariable?: PartyRevSharingPolicyActionVariable[];
  '@type'?: string;
}

// --- Hub (event subscription) ---

export interface Hub {
  id: string;
  href?: string;
  callback: string;
  query?: string;
  '@type'?: string;
}

export interface Hub_FVO {
  callback: string;
  query?: string;
  '@type'?: string;
}

// --- List Params / Response ---

export interface ListParams {
  offset?: number;
  limit?: number;
  fields?: string;
  [key: string]: string | number | undefined;
}

export interface ListResponse<T> {
  data: T[];
  total: number;
  resultCount: number;
}
