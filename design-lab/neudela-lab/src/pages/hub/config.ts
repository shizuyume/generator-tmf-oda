import type { ResourceConfig } from '../../resource/types';
import { hubService } from '../../app/services';

export const config: ResourceConfig = {
  service: hubService,
  lookups: {},
  list: {
    breadcrumb: ['Revenue Sharing Algorithm', 'Event Hub'],
    title: 'Event Hub Subscriptions',
    subtitle: 'TMF736 Revenue Sharing Algorithm Management · hub',
    card: {
      title: 'Subscriptions',
      description: 'Listeners notified on revenue sharing algorithm create, change and delete events.',
      noun: ['subscription', 'subscriptions'],
      minTableWidth: 860,
      buttonActionVariant: 'menu',
      rowLabel: 'callback',
      searchPlaceholder: 'Search by callback URL',
      searchParam: 'callback',
      emptyTitle: 'No event subscriptions yet',
      emptyBody: 'Add a listener with “New Subscription” to receive TMF736 events.',
      primaryAction: { label: 'New Subscription', icon: { icon: 'Plus', size: 16 } },
      refresh: true,
      rowClick: 'open-detail',
    },
    rowFrom: { id: { path: 'id' }, callback: { path: 'callback' }, query: { path: 'query' } },
    columns: [
      { key: 'id', label: 'ID', width: 170, sortable: true, render: 'mono-muted' },
      { key: 'callback', label: 'Callback URL', sortable: true, render: 'primary' },
      { key: 'query', label: 'Query Filter', width: 320, render: 'mono', empty: { text: 'All events' } },
    ],
    sortOptions: [{ key: 'callback', label: 'Callback URL' }, { key: 'id', label: 'ID' }],
    filterFields: [
      { key: 'id', label: 'ID', type: 'text' },
      { key: 'callback', label: 'Callback URL', type: 'text' },
      { key: 'query', label: 'Query Filter', type: 'text', placeholder: 'e.g. CreateEvent' },
    ],
    rowActions: [
      {
        key: 'view',
        label: 'View details',
        ariaLabel: 'View subscription {callback}',
        icon: { icon: 'Eye', size: 16 },
        tone: 'brand',
        action: 'open-detail',
      },
      {
        key: 'remove',
        label: 'Remove',
        ariaLabel: 'Remove subscription {callback}',
        icon: { icon: 'Trash2', size: 16 },
        tone: 'danger',
        action: 'confirm-delete',
      },
    ],
    mobileCard: { id: 'id', title: 'callback', subtitle: { path: 'query', empty: 'All events' } },
    delete: {
      title: 'Remove subscription?',
      strong: 'callback',
      strongClassName: 'lab-break',
      text: 'will stop receiving events.',
      confirmLabel: 'Remove',
      toast: 'Subscription removed',
    },
  },
  form: {
    formId: 'create-hub-form',
    width: 'narrow',
    title: 'Create event subscription',
    description: 'The callback URL receives a POST for every matching TMF736 event.',
    submitLabel: 'Subscribe',
    validateOn: 'touched',
    fields: [
      {
        kind: 'url',
        name: 'callback',
        label: 'Callback URL',
        ariaLabel: 'Callback URL',
        placeholder: 'https://your-server.com/webhook',
        required: { message: 'Callback URL is required.' },
        pattern: { message: 'Enter a full http(s) URL, e.g. https://your-server.com/webhook' },
      },
      {
        kind: 'textarea',
        name: 'query',
        label: 'Query Filter',
        placeholder: 'eventType=<EventName>',
        minRows: 3,
        helperText: 'e.g. eventType=PartyRevSharingAlgorithmCreateEvent. Empty = all events.',
      },
    ],
    guard: [],
    payload: { '@type': { const: 'Hub' }, callback: { from: 'callback' }, query: { from: 'query', omitEmpty: true } },
    toast: 'Subscription created',
  },
  detail: {
    idPrefix: 'hub',
    tabsAriaLabel: 'Subscription sections',
    breadcrumbRoot: 'Event Hub',
    header: { title: 'callback', recordId: 'id', description: 'query' },
    loadingText: 'Loading subscription…',
    notFound: {
      title: 'Subscription not found',
      alertTitle: 'Subscription not found',
      alertDescription: 'No event subscription with id {id} exists, or it was removed.',
    },
    tabs: [{ key: 'overview', label: 'Overview', icon: { icon: 'FileText', size: 16 } }],
    overview: {
      stats: {
        label: 'Subscription summary',
        items: [
          {
            key: 'events',
            label: 'Events',
            icon: { icon: 'BellRing', size: 14 },
            value: { ifAny: 'query', then: 'Filtered', else: 'All events' },
            hint: { path: 'query', empty: 'No query filter' },
          },
          {
            key: 'delivery',
            label: 'Delivery',
            icon: { icon: 'Send', size: 14 },
            value: { text: 'POST' },
            hint: { path: 'callback' },
          },
        ],
      },
      main: [
        {
          block: 'key-value',
          title: 'Subscription',
          items: [
            { label: 'ID', path: 'id', mono: true },
            { label: 'Callback URL', path: 'callback', link: true },
            { label: 'Query filter', path: 'query', mono: true, value: { path: 'query', empty: 'All events' } },
            { label: 'Type', path: '@type', mono: true },
          ],
        },
      ],
      aside: [
        {
          block: 'key-value',
          title: 'Notification',
          items: [
            { label: 'Method', path: 'callback', value: { text: 'POST to the callback URL' } },
            { label: 'Body', path: 'callback', value: { text: 'TMF736 event (JSON)' } },
            { label: 'API href', path: 'href', mono: true, link: true },
          ],
        },
      ],
    },
    collections: [],
  },
};
