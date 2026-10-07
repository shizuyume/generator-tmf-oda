import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { applyQueryFilters } from '../common/filter/filter-typeorm';
import { EventSubscription } from './entities/event-subscription.entity';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { EVENT_SUBSCRIPTION_FILTER } from './subscription.filter';

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(EventSubscription)
    private readonly repository: Repository<EventSubscription>,
  ) {}

  async create(dto: CreateSubscriptionDto): Promise<EventSubscription> {
    const subscription = this.repository.create({
      id: uuidv4(),
      callback: dto.callback,
      query: dto.query,
    });
    return this.repository.save(subscription);
  }

  /**
   * GET /hub: TMF630 filters (callback, query, id; JSONPath `filter=` too) and sort, newest
   * first unless the client sorts.
   */
  async findAll(
    query: Record<string, unknown> = {},
    offset = 0,
    limit = 20,
  ): Promise<{ data: EventSubscription[]; total: number }> {
    const qb = this.repository.createQueryBuilder('e');
    applyQueryFilters(qb, query, EVENT_SUBSCRIPTION_FILTER, 'e');
    if (!query.sort) qb.addOrderBy('e.createdDate', 'DESC');
    const total = await qb.getCount();
    const data = await qb.skip(offset).take(limit).getMany();
    return { data, total };
  }

  async findOne(id: string): Promise<EventSubscription> {
    const subscription = await this.repository.findOne({ where: { id } });
    if (!subscription) throw new NotFoundException(`Hub ${id} not found`);
    return subscription;
  }

  async remove(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
