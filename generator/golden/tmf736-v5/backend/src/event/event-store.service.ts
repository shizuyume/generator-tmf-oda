import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventLog } from './entities/event-log.entity';

@Injectable()
export class EventStoreService {
  constructor(
    @InjectRepository(EventLog)
    private readonly repository: Repository<EventLog>,
  ) {}

  async save(
    eventType: string,
    resourceId: string,
    resourceType: string,
    payload?: Record<string, any>,
  ): Promise<EventLog> {
    const log = this.repository.create({
      eventType,
      resourceId,
      resourceType,
      payload,
    });
    return this.repository.save(log);
  }

  async findByResource(resourceId: string): Promise<EventLog[]> {
    return this.repository.find({ where: { resourceId } });
  }
}
