import { apiGet, apiGetList, apiPost, apiDelete } from './api';
import type { Hub, Hub_FVO, ListParams } from '../types';

const ENDPOINT = '/hub';

export async function listHubs(params?: ListParams) {
  return apiGetList<Hub>(ENDPOINT, params);
}

export async function getHub(id: string, fields?: string) {
  return apiGet<Hub>(`${ENDPOINT}/${id}`, fields ? { fields } : undefined);
}

export async function createHub(body: Hub_FVO) {
  return apiPost<Hub>(ENDPOINT, body);
}

export async function deleteHub(id: string) {
  return apiDelete(`${ENDPOINT}/${id}`);
}
