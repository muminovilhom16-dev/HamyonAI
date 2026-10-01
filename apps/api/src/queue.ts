import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import type { Bot } from 'grammy';
import type { Update } from 'grammy/types';
import type { FastifyBaseLogger } from 'fastify';
import type { BotContext } from './bot';

/**
 * Background queue (TZ §43). Heavy Telegram updates (voice) are acknowledged
 * immediately ("Qabul qilindi") and processed by a worker, which re-dispatches
 * the original update through the same bot code path. The proactive scheduler
 * runs as a BullMQ job scheduler so several replicas never double-send.
 */

const DEFERRED = '_hamyonDeferred';
export const isDeferred = (update: Update) => (update as Update & { [DEFERRED]?: boolean })[DEFERRED] === true;

export interface Queues {
  enqueueUpdate: (update: Update) => Promise<void>;
  close: () => Promise<void>;
  connection: IORedis;
  prefix: string;
}

export function createQueues(redisUrl: string, prefix: string): Queues {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: false });
  const updates = new Queue('telegram-updates', { connection, prefix });
  return {
    connection,
    prefix,
    async enqueueUpdate(update) {
      await updates.add('update', update, {
        jobId: `upd-${update.update_id}`, // re-deliveries never enqueue twice
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
    },
    async close() {
      await updates.close();
      await connection.quit().catch(() => {});
    },
  };
}

export interface WorkerHandle {
  close: () => Promise<void>;
}

export async function startWorkers(opts: {
  queues: Queues;
  bot: Bot<BotContext>;
  log: FastifyBaseLogger;
  tick: () => Promise<unknown>;
  concurrency?: number;
  tickEveryMs?: number;
}): Promise<WorkerHandle> {
  const { connection, prefix } = opts.queues;
  const updatesWorker = new Worker(
    'telegram-updates',
    async (job: Job<Update>) => {
      await opts.bot.handleUpdate({ ...job.data, [DEFERRED]: true } as Update);
    },
    { connection: connection.duplicate({ maxRetriesPerRequest: null }), prefix, concurrency: opts.concurrency ?? 8 },
  );
  updatesWorker.on('failed', (job, err) => opts.log.error({ jobId: job?.id, err: err.message }, 'update job failed'));

  const scheduler = new Queue('scheduler', { connection, prefix });
  await scheduler.upsertJobScheduler('proactive-tick', { every: opts.tickEveryMs ?? 60_000 }, { name: 'tick' });
  const schedulerWorker = new Worker(
    'scheduler',
    async () => {
      await opts.tick();
    },
    { connection: connection.duplicate({ maxRetriesPerRequest: null }), prefix, concurrency: 1 },
  );
  schedulerWorker.on('failed', (_job, err) => opts.log.error({ err: err.message }, 'scheduler tick failed'));

  return {
    async close() {
      await Promise.all([updatesWorker.close(), schedulerWorker.close()]);
      await scheduler.close();
    },
  };
}
