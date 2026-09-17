import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import * as amqplib from 'amqplib';
import type { Channel, ChannelModel } from 'amqplib';
import { TMF736_EVENT_EXCHANGE } from '../common/constants/tmf.constants';

@Injectable()
export class RabbitMqService implements OnApplicationShutdown {
  private model: ChannelModel | null = null;
  private channel: Channel | null = null;
  private readonly logger = new Logger(RabbitMqService.name);
  private connecting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private get url(): string {
    return process.env.RABBITMQ_URL || 'amqp://localhost:5672';
  }

  private get reconnectDelay(): number {
    return Number(process.env.RABBITMQ_RECONNECT_DELAY_MS) || 5000;
  }

  private async connect(): Promise<void> {
    if (this.channel) return;
    if (this.connecting) return;
    this.connecting = true;
    try {
      this.model = await amqplib.connect(this.url);
      this.channel = await this.model.createChannel();
      await this.channel.assertExchange(TMF736_EVENT_EXCHANGE, 'topic', {
        durable: true,
      });
      this.logger.log(
        `Connected to RabbitMQ, exchange=${TMF736_EVENT_EXCHANGE}`,
      );

      this.model.on('close', () => {
        this.logger.warn('RabbitMQ connection closed');
        this.channel = null;
        this.model = null;
        this.scheduleReconnect();
      });

      this.model.on('error', (err: Error) => {
        this.logger.warn(`RabbitMQ connection error: ${err.message}`);
      });
    } catch (err: any) {
      this.logger.warn(
        `RabbitMQ connection failed: ${err.message}. Will retry in ${this.reconnectDelay}ms`,
      );
      this.channel = null;
      this.model = null;
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {});
    }, this.reconnectDelay);
  }

  async publish(
    exchange: string,
    routingKey: string,
    message: any,
  ): Promise<void> {
    try {
      if (!this.channel) await this.connect();
      if (!this.channel) return;
      const buf = Buffer.from(JSON.stringify(message));
      this.channel.publish(exchange, routingKey, buf, { persistent: true });
    } catch (err: any) {
      this.logger.warn(`RabbitMQ publish failed: ${err.message}`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try {
      await this.channel?.close();
    } catch {}
    try {
      await this.model?.close();
    } catch {}
  }
}
