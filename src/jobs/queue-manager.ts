import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { PlatformManager } from '../platforms/platform-manager';
import { ContextEngine } from '../context/context-engine';
import { logger } from '../utils/logger';
import { SyncJob, WebhookJob, PlatformType } from '../types/platform';

export interface QueueConfig {
  redis: {
    host: string;
    port: number;
  };
}

export interface JobHandlers {
  platformManager: PlatformManager;
  contextEngine: ContextEngine;
  notificationService?: any; // Will be implemented later
}

export class QueueManager {
  private queues = new Map<string, Queue>();
  private workers = new Map<string, Worker>();
  private queueEvents = new Map<string, QueueEvents>();
  private connection: Redis;

  constructor(
    private config: QueueConfig,
    private handlers: JobHandlers
  ) {
    this.connection = new Redis(this.config.redis);
    this.setupQueues();
    this.setupWorkers();
    this.setupEventHandlers();
  }

  private setupQueues() {
    // Platform sync queue
    this.queues.set(
      'platform-sync',
      new Queue('platform-sync', {
        connection: this.config.redis,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      })
    );

    // Webhook processing queue
    this.queues.set(
      'webhook-process',
      new Queue('webhook-process', {
        connection: this.config.redis,
        defaultJobOptions: {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 1000,
          removeOnFail: 1000,
        },
      })
    );

    // Context indexing queue
    this.queues.set(
      'context-index',
      new Queue('context-index', {
        connection: this.config.redis,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'fixed',
            delay: 1000,
          },
        },
      })
    );

    // Notification queue
    this.queues.set(
      'notification-send',
      new Queue('notification-send', {
        connection: this.config.redis,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      })
    );
  }

  private setupWorkers() {
    // Platform sync worker
    const syncWorker = new Worker(
      'platform-sync',
      async (job: Job<SyncJob>) => {
        const { platform, userId, type } = job.data;

        logger.info('Starting platform sync', {
          jobId: job.id,
          platform,
          userId,
          type,
        });

        try {
          // Update job progress
          await job.updateProgress(10);

          const result = await this.handlers.platformManager.syncPlatform(platform, userId, {
            full: type === 'full',
          });

          // Update job progress
          await job.updateProgress(90);

          // Send notification if available
          if (this.handlers.notificationService) {
            await this.enqueue('notification-send', {
              userId,
              type: 'sync:complete',
              data: {
                platform,
                itemsSynced: result.totalSynced,
                errors: result.errors.length,
              },
            });
          }

          await job.updateProgress(100);

          return {
            success: true,
            result,
          };
        } catch (error: any) {
          logger.error('Platform sync failed', {
            jobId: job.id,
            platform,
            error: error.message,
            stack: error.stack,
          });

          // Send error notification
          if (this.handlers.notificationService) {
            await this.enqueue('notification-send', {
              userId,
              type: 'sync:failed',
              data: {
                platform,
                error: error.message,
              },
            });
          }

          throw error;
        }
      },
      {
        connection: this.config.redis,
        concurrency: 5,
        limiter: {
          max: 10,
          duration: 60000, // 10 jobs per minute
        },
      }
    );

    this.workers.set('platform-sync', syncWorker);

    // Webhook processor worker
    const webhookWorker = new Worker(
      'webhook-process',
      async (job: Job<WebhookJob>) => {
        const { platform, event } = job.data;

        logger.info('Processing webhook', {
          jobId: job.id,
          platform,
          eventType: event.type,
          eventAction: event.action,
        });

        try {
          await this.handlers.platformManager.processWebhookEvent(platform, event);

          return {
            success: true,
            processed: true,
          };
        } catch (error: any) {
          logger.error('Webhook processing failed', {
            jobId: job.id,
            platform,
            eventType: event.type,
            error: error.message,
          });

          throw error;
        }
      },
      {
        connection: this.config.redis,
        concurrency: 10,
        limiter: {
          max: 100,
          duration: 60000, // 100 jobs per minute
        },
      }
    );

    this.workers.set('webhook-process', webhookWorker);

    // Context indexing worker
    const indexWorker = new Worker(
      'context-index',
      async (job: Job) => {
        const { nodeId, operation } = job.data;

        logger.info('Context indexing', {
          jobId: job.id,
          nodeId,
          operation,
        });

        try {
          // Context indexing logic would go here
          // For now, this is a placeholder

          return {
            success: true,
            indexed: true,
          };
        } catch (error: any) {
          logger.error('Context indexing failed', {
            jobId: job.id,
            nodeId,
            error: error.message,
          });

          throw error;
        }
      },
      {
        connection: this.config.redis,
        concurrency: 5,
      }
    );

    this.workers.set('context-index', indexWorker);

    // Notification worker
    const notificationWorker = new Worker(
      'notification-send',
      async (job: Job) => {
        const { userId, type, data } = job.data;

        logger.info('Sending notification', {
          jobId: job.id,
          userId,
          type,
        });

        try {
          if (this.handlers.notificationService) {
            await this.handlers.notificationService.notify(userId, {
              type,
              data,
              timestamp: new Date(),
            });
          }

          return {
            success: true,
            sent: true,
          };
        } catch (error: any) {
          logger.error('Notification failed', {
            jobId: job.id,
            userId,
            type,
            error: error.message,
          });

          throw error;
        }
      },
      {
        connection: this.config.redis,
        concurrency: 20,
      }
    );

    this.workers.set('notification-send', notificationWorker);
  }

  private setupEventHandlers() {
    // Set up queue event listeners for monitoring
    this.queues.forEach((_queue, name) => {
      const queueEvents = new QueueEvents(name, {
        connection: this.config.redis,
      });

      queueEvents.on('completed', ({ jobId, returnvalue }) => {
        logger.info(`Job completed: ${name}/${jobId}`, { returnvalue });
      });

      queueEvents.on('failed', ({ jobId, failedReason }) => {
        logger.error(`Job failed: ${name}/${jobId}`, { failedReason });
      });

      queueEvents.on('progress', ({ jobId, data }) => {
        logger.debug(`Job progress: ${name}/${jobId}`, { progress: data });
      });

      this.queueEvents.set(name, queueEvents);
    });

    // Worker event handlers
    this.workers.forEach((worker, name) => {
      worker.on('completed', (job) => {
        logger.info(`Worker completed job: ${name}/${job.id}`);
      });

      worker.on('failed', (job, err) => {
        logger.error(`Worker failed job: ${name}/${job?.id}`, { error: err.message });
      });

      worker.on('error', (err) => {
        logger.error(`Worker error: ${name}`, { error: err.message });
      });
    });
  }

  async enqueue(queueName: string, data: any, options?: any): Promise<Job> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    const job = await queue.add(queueName, data, options);
    logger.debug(`Job enqueued: ${queueName}/${job.id}`, { data });

    return job;
  }

  async enqueueSyncJob(
    platform: PlatformType,
    userId: string,
    teamId: string,
    type: 'full' | 'incremental' = 'incremental'
  ): Promise<Job> {
    const jobData: SyncJob = {
      id: '', // Will be set by BullMQ
      platform,
      userId,
      teamId,
      type,
      status: 'pending',
    };

    return this.enqueue('platform-sync', jobData, {
      priority: type === 'full' ? 1 : 10,
      delay: type === 'full' ? 0 : 5000, // Delay incremental syncs by 5 seconds
    });
  }

  async getJobStatus(queueName: string, jobId: string): Promise<any> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress;

    return {
      id: job.id,
      state,
      progress,
      data: job.data,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
  }

  async getQueueStats(queueName: string): Promise<any> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused: 0,
      total: waiting + active + completed + failed + delayed,
    };
  }

  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    await queue.pause();
    logger.info(`Queue paused: ${queueName}`);
  }

  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    await queue.resume();
    logger.info(`Queue resumed: ${queueName}`);
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down queue manager');

    // Close all workers
    await Promise.all(Array.from(this.workers.values()).map((worker) => worker.close()));

    // Close all queue events
    await Promise.all(Array.from(this.queueEvents.values()).map((events) => events.close()));

    // Close all queues
    await Promise.all(Array.from(this.queues.values()).map((queue) => queue.close()));

    // Close Redis connection
    await this.connection.quit();

    logger.info('Queue manager shutdown complete');
  }
}
