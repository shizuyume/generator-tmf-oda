import { apiGet, apiGetList, apiPost, apiPatch, apiDelete } from './api';
import type {
  PartyRevSharingAlgorithm,
  PartyRevSharingAlgorithm_FVO,
  PartyRevSharingAlgorithm_MVO,
  ListParams,
} from '../types';

// TODO: CUSTOMIZE — the single ENDPOINT const is the per-resource template point;
// everything else in this file is boilerplate CRUD binding.
const ENDPOINT = '/partyRevSharingAlgorithm';

export async function listPartyRevSharingAlgorithms(params?: ListParams) {
  return apiGetList<PartyRevSharingAlgorithm>(ENDPOINT, params);
}

export async function getPartyRevSharingAlgorithm(id: string, fields?: string) {
  return apiGet<PartyRevSharingAlgorithm>(`${ENDPOINT}/${id}`, fields ? { fields } : undefined);
}

export async function createPartyRevSharingAlgorithm(body: PartyRevSharingAlgorithm_FVO) {
  return apiPost<PartyRevSharingAlgorithm>(ENDPOINT, body);
}

export async function patchPartyRevSharingAlgorithm(id: string, body: PartyRevSharingAlgorithm_MVO) {
  return apiPatch<PartyRevSharingAlgorithm>(`${ENDPOINT}/${id}`, body);
}

export async function deletePartyRevSharingAlgorithm(id: string) {
  return apiDelete(`${ENDPOINT}/${id}`);
}
