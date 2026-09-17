import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { EventSubscription } from './entities/event-subscription.entity';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';

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

  async findAll(
    offset = 0,
    limit = 20,
  ): Promise<{ data: EventSubscription[]; total: number }> {
    const [data, total] = await this.repository.findAndCount({
      skip: offset,
      take: limit,
      order: { createdDate: 'DESC' as const },
    });
    return { data, total };
  }

  async remove(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
