import { apiDelete, apiGet, apiGetList, apiPatch, apiPost } from './api';
import type { ListParams } from './api';

/**
 * CRUD binding of one TMF resource collection (TMF630: list with offset/limit and
 * X-Total-Count, retrieve, create, partial update, delete). `endpoint` is the collection
 * path under the API base path, e.g. '/partyRevSharingAlgorithm'.
 */
export function resourceService<T = any, TCreate = any, TUpdate = any>(endpoint: string) {
  return {
    list: (params?: ListParams) => apiGetList<T>(endpoint, params),
    get: (id: string, fields?: string) => apiGet<T>(`${endpoint}/${id}`, fields ? { fields } : undefined),
    create: (body: TCreate) => apiPost<T>(endpoint, body),
    patch: (id: string, body: TUpdate) => apiPatch<T>(`${endpoint}/${id}`, body),
    remove: (id: string) => apiDelete(`${endpoint}/${id}`),
  };
}

/**
 * A collection nested under a parent record (OAS path `/parent/{parentId}/child`): bound to one
 * parent id, it is the same CRUD binding as resourceService.
 */
export function nestedResourceService<T = any, TCreate = any, TUpdate = any>(template: string) {
  return (parentId: string) => resourceService<T, TCreate, TUpdate>(template.replace(/\{[^}]+\}/, encodeURIComponent(parentId)));
}
