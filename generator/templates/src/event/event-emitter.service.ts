import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventStoreService } from './event-store.service';
import { EventDeliveryService } from './event-delivery.service';
import { RabbitMqService } from './rabbitmq.service';
import { {{EVENT_EXCHANGE_CONST}} } from '../common/constants/tmf.constants';

@Injectable()
export class EventEmitterService {
  private readonly logger = new Logger(EventEmitterService.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly eventStore: EventStoreService,
    private readonly eventDelivery: EventDeliveryService,
    private readonly rabbitMq: RabbitMqService,
  ) {}

  async emitEvent(
    eventType: string,
    resourceId: string,
    resourceType: string,
    payload?: Record<string, any>,
  ): Promise<void> {
    // 1. Emit internal event via EventEmitter2
    this.eventEmitter.emit(eventType, { resourceId, resourceType, payload });
    // 2. Persist to event_log
    await this.eventStore.save(eventType, resourceId, resourceType, payload);
    // 3. Publish to RabbitMQ (fire-and-forget)
    this.rabbitMq
      .publish({{EVENT_EXCHANGE_CONST}}, eventType, {
        eventType,
        resourceId,
        resourceType,
        payload,
      })
      .catch((err) =>
        this.logger.warn(`RabbitMQ publish error: ${err.message}`),
      );
    // 4. Deliver to webhook subscribers (fire-and-forget)
    this.eventDelivery
      .deliver(eventType, { eventType, resourceId, resourceType, payload })
      .catch((err) =>
        this.logger.warn(`Webhook delivery error: ${err.message}`),
      );
  }
}
