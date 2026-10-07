import type { FilterSchema } from '../common/filter/filter.types';
import { EventSubscription } from './entities/event-subscription.entity';

/** What GET /hub can be filtered and sorted on (TMF630, common/filter): the Hub attributes. */
export const EVENT_SUBSCRIPTION_FILTER: FilterSchema = {
  entity: EventSubscription,
  attrs: {
    id: { property: 'id', type: 'string' },
    callback: { property: 'callback', type: 'string' },
    query: { property: 'query', type: 'string' },
  },
  refs: {},
  arrays: {},
  timestamps: {
    createdDate: { property: 'createdDate', type: 'date' },
  },
  reserved: [],
};
