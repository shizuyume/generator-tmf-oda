import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventSubscription } from '../subscription/entities/event-subscription.entity';
import { lastValueFrom } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';

@Injectable()
export class EventDeliveryService {
  private readonly logger = new Logger(EventDeliveryService.name);

  constructor(
    @InjectRepository(EventSubscription)
    private readonly subscriptionRepo: Repository<EventSubscription>,
    private readonly httpService: HttpService,
  ) {}

  async deliver(
    eventType: string,
    payload: any,
  ): Promise<{ delivered: number; failed: number }> {
    const subscriptions = await this.subscriptionRepo.find();
    const matching = subscriptions.filter((sub) => {
      if (!sub.query) return true; // null query = all events
      return sub.query.includes(eventType);
    });

    let delivered = 0;
    let failed = 0;

    await Promise.allSettled(
      matching.map((sub) =>
        lastValueFrom(
          this.httpService.post(sub.callback, payload).pipe(
            timeout(10000),
            catchError((err) => {
              this.logger.warn(
                `Webhook delivery failed to ${sub.callback}: ${err.message}`,
              );
              failed++;
              return []; // don't throw
            }),
          ),
        ).then(() => {
          delivered++;
        }),
      ),
    );

    return { delivered, failed };
  }
}
