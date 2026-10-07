// What the Overview page shows about the TMF API and this frontend: values from the TMF736 IR
// (meta, resources, hub, listeners), the OAS `info` block and this app's exposes.
import { partyRevSharingAlgorithmService } from './services';
import type { ApiInfo, EventSummary, FederationSummary, ModuleSummary, OperationSummary, ResourceSummary } from '../pages/overview/summary';

export const API_INFO: ApiInfo = {
  tmfNumber: '736',
  title: 'Revenue Sharing Algorithm Management',
  version: '5.0.0',
  description: 'Revenue Sharing Algorithm Management API goal is to provide the Algorithm to calculate a revenue share.',
  basePath: '/tmf-api/revenueSharingAlgorithmManagement/v5',
  authHeader: 'X-API-Key',
};

export const RESOURCES: ResourceSummary[] = [
  {
    name: 'PartyRevSharingAlgorithm',
    description: 'Policy type of algorithm to calculate revenue share: a named set of policies plus the condition and action variables that parameterise it.',
    route: '/party-rev-sharing-algorithm',
    pageLabel: 'Revenue Sharing Algorithms',
    collectionPath: '/partyRevSharingAlgorithm',
    itemPath: '/partyRevSharingAlgorithm/{id}',
    requiredOnCreate: ['name', '@type'],
    subResources: [
      { name: 'policy', kind: 'ref', minItems: 1 },
      { name: 'conditionVariable', kind: 'entry' },
      { name: 'actionVariable', kind: 'entry' },
    ],
  },
];

export const OPERATIONS: OperationSummary[] = [
  { method: 'GET', path: '/partyRevSharingAlgorithm', operationId: 'listPartyRevSharingAlgorithm', summary: 'List or find PartyRevSharingAlgorithm objects', success: ['200'] },
  { method: 'POST', path: '/partyRevSharingAlgorithm', operationId: 'createPartyRevSharingAlgorithm', summary: 'Creates a PartyRevSharingAlgorithm', success: ['201', '202'] },
  { method: 'GET', path: '/partyRevSharingAlgorithm/{id}', operationId: 'retrievePartyRevSharingAlgorithm', summary: 'Retrieves a PartyRevSharingAlgorithm by ID', success: ['200'] },
  { method: 'PATCH', path: '/partyRevSharingAlgorithm/{id}', operationId: 'patchPartyRevSharingAlgorithm', summary: 'Updates partially a PartyRevSharingAlgorithm', success: ['200', '202'] },
  { method: 'DELETE', path: '/partyRevSharingAlgorithm/{id}', operationId: 'deletePartyRevSharingAlgorithm', summary: 'Deletes a PartyRevSharingAlgorithm', success: ['202', '204'] },
  { method: 'POST', path: '/hub', operationId: 'createHub', summary: 'Create a subscription (hub) to receive Events', success: ['201'] },
  { method: 'DELETE', path: '/hub/{id}', operationId: 'hubDelete', summary: 'Remove a subscription (hub) to receive Events', success: ['204'] },
  { method: 'GET', path: '/hub', operationId: 'listHub', summary: 'List event subscriptions (Event Hub page)', success: ['200'], notInSpec: true },
  { method: 'GET', path: '/hub/{id}', operationId: 'retrieveHub', summary: 'Retrieve an event subscription (hub record page)', success: ['200'], notInSpec: true },
];

export const EVENTS: EventSummary[] = [
  { name: 'partyRevSharingAlgorithmAttributeValueChangeEvent', kind: 'Attribute value change', listenerPath: '/listener/partyRevSharingAlgorithmAttributeValueChangeEvent' },
  { name: 'partyRevSharingAlgorithmCreateEvent', kind: 'Create', listenerPath: '/listener/partyRevSharingAlgorithmCreateEvent' },
  { name: 'partyRevSharingAlgorithmDeleteEvent', kind: 'Delete', listenerPath: '/listener/partyRevSharingAlgorithmDeleteEvent' },
  { name: 'partyRevSharingAlgorithmStateChangeEvent', kind: 'State change', listenerPath: '/listener/partyRevSharingAlgorithmStateChangeEvent' },
];

export const MODULES: ModuleSummary[] = [
  { key: './PartyRevSharingAlgorithm', pageName: 'PartyRevSharingAlgorithm', route: '/party-rev-sharing-algorithm', label: 'Revenue Sharing Algorithms' },
  { key: './Hub', pageName: 'Hub', route: '/hub', label: 'Event Hub' },
];

/** This app as a Module Federation remote (vite.config.ts). */
export const FEDERATION: FederationSummary = {
  name: 'neudela_lab',
  remoteEntry: 'remoteEntry.js',
  shared: ['react', 'react-dom', 'neudela'],
};

/** Read cheaply for the live KPI: `limit=1`, total from X-Total-Count. */
export const countPrimaryResource = partyRevSharingAlgorithmService.list;
export const PRIMARY_RESOURCE_NOUN = 'Algorithms';
