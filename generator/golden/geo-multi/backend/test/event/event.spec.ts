import { of, throwError } from 'rxjs';
import { EventStoreService } from '../../src/event/event-store.service';
import { EventEmitterService } from '../../src/event/event-emitter.service';
import { EventDeliveryService } from '../../src/event/event-delivery.service';
import { RabbitMqService } from '../../src/event/rabbitmq.service';

jest.mock('amqplib');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const amqplib = require('amqplib');

type AnyRec = Record<string, any>;

const flush = () => new Promise((r) => setImmediate(r));

describe('EventStoreService', () => {
  it('creates and saves a log row', async () => {
    const row = { id: 'l1' };
    const repo: AnyRec = {
      create: jest.fn((v: AnyRec) => ({ ...v })),
      save: jest.fn(async () => row),
      find: jest.fn(async () => [row]),
    };
    const store = new EventStoreService(repo as never);

    await expect(store.save('E', 'r1', 'R', { a: 1 })).resolves.toBe(row);
    expect(repo.create).toHaveBeenCalledWith({
      eventType: 'E',
      resourceId: 'r1',
      resourceType: 'R',
      payload: { a: 1 },
    });
  });

  it('looks logs up by resource', async () => {
    const repo: AnyRec = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(async () => []),
    };
    const store = new EventStoreService(repo as never);
    await store.findByResource('r1');
    expect(repo.find).toHaveBeenCalledWith({ where: { resourceId: 'r1' } });
  });
});

describe('EventEmitterService', () => {
  let emitter2: AnyRec;
  let store: AnyRec;
  let delivery: AnyRec;
  let rabbit: AnyRec;
  let svc: EventEmitterService;

  beforeEach(() => {
    emitter2 = { emit: jest.fn() };
    store = { save: jest.fn(async () => ({})) };
    delivery = { deliver: jest.fn(async () => ({ delivered: 1, failed: 0 })) };
    rabbit = { publish: jest.fn(async () => undefined) };
    svc = new EventEmitterService(
      emitter2 as never,
      store as never,
      delivery as never,
      rabbit as never,
    );
  });

  it('emits internally, persists, publishes and delivers', async () => {
    await svc.emitEvent('E', 'r1', 'R', { a: 1 });
    expect(emitter2.emit).toHaveBeenCalledWith('E', {
      resourceId: 'r1',
      resourceType: 'R',
      payload: { a: 1 },
    });
    expect(store.save).toHaveBeenCalledWith('E', 'r1', 'R', { a: 1 });
    expect(rabbit.publish).toHaveBeenCalled();
    expect(delivery.deliver).toHaveBeenCalled();
  });

  it('swallows a RabbitMQ publish failure', async () => {
    rabbit.publish.mockRejectedValue(new Error('broker down'));
    await expect(svc.emitEvent('E', 'r1', 'R')).resolves.toBeUndefined();
    await flush();
  });

  it('swallows a webhook delivery failure', async () => {
    delivery.deliver.mockRejectedValue(new Error('callback down'));
    await expect(svc.emitEvent('E', 'r1', 'R')).resolves.toBeUndefined();
    await flush();
  });
});

describe('EventDeliveryService', () => {
  function build(subs: AnyRec[], post: AnyRec) {
    const repo: AnyRec = { find: jest.fn(async () => subs) };
    return new EventDeliveryService(repo as never, { post } as never);
  }

  it('delivers to every subscriber with a null query', async () => {
    const post = jest.fn(() => of({ status: 204 }));
    const svc = build([{ callback: 'https://a/hook', query: null }], post);
    await expect(svc.deliver('E', { x: 1 })).resolves.toEqual({
      delivered: 1,
      failed: 0,
    });
    expect(post).toHaveBeenCalledWith('https://a/hook', { x: 1 });
  });

  it('only delivers to subscribers whose query matches the event type', async () => {
    // NB: the filter is a plain substring test, so the two event names here are
    // deliberately not substrings of one another.
    const post = jest.fn(() => of({ status: 204 }));
    const svc = build(
      [
        {
          callback: 'https://match/hook',
          query: 'eventType=GeneralTestArtifactCreateEvent',
        },
        {
          callback: 'https://other/hook',
          query: 'eventType=GeneralTestArtifactDeleteEvent',
        },
      ],
      post,
    );
    const res = await svc.deliver('GeneralTestArtifactCreateEvent', {});
    expect(res.delivered).toBe(1);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('https://match/hook', {});
  });

  it('counts a failing callback without throwing', async () => {
    const post = jest.fn(() => throwError(() => new Error('refused')));
    const svc = build([{ callback: 'https://dead/hook', query: null }], post);
    const res = await svc.deliver('E', {});
    expect(res.failed).toBe(1);
  });

  it('reports nothing delivered when there are no subscribers', async () => {
    const svc = build([], jest.fn());
    await expect(svc.deliver('E', {})).resolves.toEqual({
      delivered: 0,
      failed: 0,
    });
  });
});

describe('RabbitMqService', () => {
  let channel: AnyRec;
  let model: AnyRec;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    channel = {
      assertExchange: jest.fn(async () => undefined),
      publish: jest.fn(),
      close: jest.fn(async () => undefined),
    };
    model = {
      createChannel: jest.fn(async () => channel),
      on: jest.fn(),
      close: jest.fn(async () => undefined),
    };
    amqplib.connect.mockResolvedValue(model);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('connects lazily on first publish and asserts the exchange', async () => {
    const svc = new RabbitMqService();
    await svc.publish('ex', 'rk', { a: 1 });
    expect(amqplib.connect).toHaveBeenCalledTimes(1);
    expect(channel.assertExchange).toHaveBeenCalled();
    expect(channel.publish).toHaveBeenCalledWith(
      'ex',
      'rk',
      expect.any(Buffer),
      { persistent: true },
    );
  });

  it('reuses the channel on a second publish', async () => {
    const svc = new RabbitMqService();
    await svc.publish('ex', 'rk', {});
    await svc.publish('ex', 'rk', {});
    expect(amqplib.connect).toHaveBeenCalledTimes(1);
    expect(channel.publish).toHaveBeenCalledTimes(2);
  });

  it('does not throw when the broker is unreachable', async () => {
    amqplib.connect.mockRejectedValue(new Error('ECONNREFUSED'));
    const svc = new RabbitMqService();
    await expect(svc.publish('ex', 'rk', {})).resolves.toBeUndefined();
    expect(channel.publish).not.toHaveBeenCalled();
    await svc.onApplicationShutdown();
  });

  it('schedules a reconnect after the connection closes', async () => {
    const svc = new RabbitMqService();
    await svc.publish('ex', 'rk', {});
    type Handler = [string, (...args: unknown[]) => void];
    const handlerFor = (name: string) =>
      (model.on.mock.calls as Handler[]).find((c) => c[0] === name)![1];
    const onClose = handlerFor('close');
    const onError = handlerFor('error');
    onError(new Error('channel error')); // logged, not thrown
    onClose();
    jest.advanceTimersByTime(5000);
    await Promise.resolve();
    expect(amqplib.connect).toHaveBeenCalledTimes(2);
  });

  it('closes channel and connection on shutdown', async () => {
    const svc = new RabbitMqService();
    await svc.publish('ex', 'rk', {});
    await svc.onApplicationShutdown();
    expect(channel.close).toHaveBeenCalled();
    expect(model.close).toHaveBeenCalled();
  });

  it('survives a close that throws during shutdown', async () => {
    channel.close.mockRejectedValue(new Error('already closed'));
    model.close.mockRejectedValue(new Error('already closed'));
    const svc = new RabbitMqService();
    await svc.publish('ex', 'rk', {});
    await expect(svc.onApplicationShutdown()).resolves.toBeUndefined();
  });
});
