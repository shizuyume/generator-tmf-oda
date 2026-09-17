import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventLog } from './entities/event-log.entity';
import { EventSubscription } from '../subscription/entities/event-subscription.entity';
import { EventEmitterService } from './event-emitter.service';
import { EventStoreService } from './event-store.service';
import { EventDeliveryService } from './event-delivery.service';
import { RabbitMqService } from './rabbitmq.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventLog, EventSubscription]),
    HttpModule,
  ],
  providers: [
    EventEmitterService,
    EventStoreService,
    EventDeliveryService,
    RabbitMqService,
  ],
  exports: [EventEmitterService, EventDeliveryService],
})
export class EventModule {}
