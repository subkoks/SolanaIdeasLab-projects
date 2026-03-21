import Bull from 'bull'
import { config } from '../config/environment'
import { logger } from '../utils/logger'

export interface QueueJob<T = any> {
  id: string
  name: string
  data: T
  opts: Bull.JobOptions
  createdAt: Date
  processedOn?: Date
  finishedOn?: Date
  failedAt?: Date
  attemptsMade: number
  maxAttempts: number
}

export interface QueueStats {
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
  paused: number
}

export class QueueService {
  private tokenAnalysisQueue: Bull.Queue
  private alertQueue: Bull.Queue
  private notificationQueue: Bull.Queue
  private cleanupQueue: Bull.Queue
  private redisConnection: any

  constructor() {
    this.tokenAnalysisQueue = new Bull('token analysis', {
      redis: config.queue.redisUrl,
      defaultJobOptions: config.queue.defaultJobOptions,
      settings: {
        stalledInterval: 30 * 1000,
        maxStalledCount: 1,
      }
    })

    this.alertQueue = new Bull('alerts', {
      redis: config.queue.redisUrl,
      defaultJobOptions: config.queue.defaultJobOptions
    })

    this.notificationQueue = new Bull('notifications', {
      redis: config.queue.redisUrl,
      defaultJobOptions: config.queue.defaultJobOptions
    })

    this.cleanupQueue = new Bull('cleanup', {
      redis: config.queue.redisUrl,
      defaultJobOptions: config.queue.defaultJobOptions
    })

    this.setupEventListeners()
  }

  async connect(): Promise<void> {
    try {
      // Test Redis connection
      await this.tokenAnalysisQueue.isReady()
      logger.info('Queue service connected to Redis')
    } catch (error) {
      logger.error('Failed to connect to queue service:', error)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.tokenAnalysisQueue.close()
      await this.alertQueue.close()
      await this.notificationQueue.close()
      await this.cleanupQueue.close()
      logger.info('Queue service disconnected')
    } catch (error) {
      logger.error('Error disconnecting queue service:', error)
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.tokenAnalysisQueue.isReady()
      return true
    } catch (error) {
      logger.error('Queue health check failed:', error)
      return false
    }
  }

  private setupEventListeners(): void {
    // Token analysis queue events
    this.tokenAnalysisQueue.on('completed', (job, result) => {
      logger.info(`Token analysis job completed: ${job.id}`, { result })
    })

    this.tokenAnalysisQueue.on('failed', (job, err) => {
      logger.error(`Token analysis job failed: ${job.id}`, { error: err })
    })

    this.tokenAnalysisQueue.on('stalled', (job) => {
      logger.warn(`Token analysis job stalled: ${job.id}`)
    })

    // Alert queue events
    this.alertQueue.on('completed', (job, result) => {
      logger.info(`Alert job completed: ${job.id}`, { result })
    })

    this.alertQueue.on('failed', (job, err) => {
      logger.error(`Alert job failed: ${job.id}`, { error: err })
    })

    // Notification queue events
    this.notificationQueue.on('completed', (job, result) => {
      logger.info(`Notification job completed: ${job.id}`, { result })
    })

    this.notificationQueue.on('failed', (job, err) => {
      logger.error(`Notification job failed: ${job.id}`, { error: err })
    })

    // Cleanup queue events
    this.cleanupQueue.on('completed', (job, result) => {
      logger.info(`Cleanup job completed: ${job.id}`)
    })

    this.cleanupQueue.on('failed', (job, err) => {
      logger.error(`Cleanup job failed: ${job.id}`, { error: err })
    })
  }

  // Token analysis queue methods
  async addTokenAnalysis(tokenAddress: string, analysisDepth: string = 'quick'): Promise<Bull.Job> {
    return this.tokenAnalysisQueue.add('analyze-token', {
      tokenAddress,
      analysisDepth,
      timestamp: Date.now()
    }, {
      priority: 10,
      delay: 0,
      attempts: 3,
      backoff: 'exponential',
      removeOnComplete: 100,
      removeOnFail: 50
    })
  }

  async addBatchTokenAnalysis(tokenAddresses: string[], analysisDepth: string = 'quick'): Promise<Bull.Job[]> {
    const jobs = tokenAddresses.map(address => ({
      name: 'analyze-token',
      data: {
        tokenAddress: address,
        analysisDepth,
        timestamp: Date.now()
      },
      opts: {
        priority: 5,
        delay: Math.random() * 1000, // Stagger the jobs
        attempts: 3,
        backoff: 'exponential',
        removeOnComplete: 100,
        removeOnFail: 50
      }
    }))

    return this.tokenAnalysisQueue.addBulk(jobs)
  }

  async addRiskScoring(tokenAddress: string, riskFactors: any): Promise<Bull.Job> {
    return this.tokenAnalysisQueue.add('risk-scoring', {
      tokenAddress,
      riskFactors,
      timestamp: Date.now()
    }, {
      priority: 15,
      attempts: 2,
      backoff: 'exponential',
      removeOnComplete: 100,
      removeOnFail: 50
    })
  }

  // Alert queue methods
  async addTokenAlert(alertData: any): Promise<Bull.Job> {
    return this.alertQueue.add('token-alert', {
      ...alertData,
      timestamp: Date.now()
    }, {
      priority: 20,
      delay: 0,
      attempts: 5,
      backoff: 'exponential',
      removeOnComplete: 200,
      removeOnFail: 100
    })
  }

  async addRiskAlert(tokenAddress: string, riskLevel: string, details: any): Promise<Bull.Job> {
    return this.alertQueue.add('risk-alert', {
      tokenAddress,
      riskLevel,
      details,
      timestamp: Date.now()
    }, {
      priority: 25,
      attempts: 5,
      backoff: 'exponential',
      removeOnComplete: 200,
      removeOnFail: 100
    })
  }

  async addWhaleAlert(whaleData: any): Promise<Bull.Job> {
    return this.alertQueue.add('whale-alert', {
      ...whaleData,
      timestamp: Date.now()
    }, {
      priority: 30,
      attempts: 5,
      backoff: 'exponential',
      removeOnComplete: 200,
      removeOnFail: 100
    })
  }

  async addBundleAlert(bundleData: any): Promise<Bull.Job> {
    return this.alertQueue.add('bundle-alert', {
      ...bundleData,
      timestamp: Date.now()
    }, {
      priority: 25,
      attempts: 3,
      backoff: 'exponential',
      removeOnComplete: 200,
      removeOnFail: 100
    })
  }

  // Notification queue methods
  async addTelegramNotification(userId: number, message: string, type: string = 'info'): Promise<Bull.Job> {
    return this.notificationQueue.add('telegram-notification', {
      userId,
      message,
      type,
      timestamp: Date.now()
    }, {
      priority: 10,
      attempts: 3,
      backoff: 'exponential',
      removeOnComplete: 500,
      removeOnFail: 200
    })
  }

  async addEmailNotification(email: string, subject: string, content: string): Promise<Bull.Job> {
    return this.notificationQueue.add('email-notification', {
      email,
      subject,
      content,
      timestamp: Date.now()
    }, {
      priority: 5,
      attempts: 3,
      backoff: 'exponential',
      removeOnComplete: 500,
      removeOnFail: 200
    })
  }

  async addPushNotification(userId: string, title: string, body: string, data?: any): Promise<Bull.Job> {
    return this.notificationQueue.add('push-notification', {
      userId,
      title,
      body,
      data,
      timestamp: Date.now()
    }, {
      priority: 8,
      attempts: 3,
      backoff: 'exponential',
      removeOnComplete: 500,
      removeOnFail: 200
    })
  }

  // Cleanup queue methods
  async addCacheCleanup(cacheKey: string): Promise<Bull.Job> {
    return this.cleanupQueue.add('cache-cleanup', {
      cacheKey,
      timestamp: Date.now()
    }, {
      priority: 1,
      delay: 0,
      attempts: 2,
      backoff: 'exponential',
      removeOnComplete: 100,
      removeOnFail: 50
    })
  }

  async addDatabaseCleanup(operation: string, data: any): Promise<Bull.Job> {
    return this.cleanupQueue.add('database-cleanup', {
      operation,
      data,
      timestamp: Date.now()
    }, {
      priority: 2,
      delay: 0,
      attempts: 2,
      backoff: 'exponential',
      removeOnComplete: 100,
      removeOnFail: 50
    })
  }

  async addLogCleanup(logType: string, retentionDays: number): Promise<Bull.Job> {
    return this.cleanupQueue.add('log-cleanup', {
      logType,
      retentionDays,
      timestamp: Date.now()
    }, {
      priority: 1,
      delay: 0,
      attempts: 2,
      backoff: 'exponential',
      removeOnComplete: 100,
      removeOnFail: 50
    })
  }

  // Queue management methods
  async getQueueStats(queueName: string): Promise<QueueStats> {
    let queue: Bull.Queue

    switch (queueName) {
      case 'token-analysis':
        queue = this.tokenAnalysisQueue
        break
      case 'alerts':
        queue = this.alertQueue
        break
      case 'notifications':
        queue = this.notificationQueue
        break
      case 'cleanup':
        queue = this.cleanupQueue
        break
      default:
        throw new Error(`Unknown queue: ${queueName}`)
    }

    const waiting = await queue.getWaiting()
    const active = await queue.getActive()
    const completed = await queue.getCompleted()
    const failed = await queue.getFailed()
    const delayed = await queue.getDelayed()
    const paused = await queue.getPaused()

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      paused: paused.length
    }
  }

  async pauseQueue(queueName: string): Promise<void> {
    let queue: Bull.Queue

    switch (queueName) {
      case 'token-analysis':
        queue = this.tokenAnalysisQueue
        break
      case 'alerts':
        queue = this.alertQueue
        break
      case 'notifications':
        queue = this.notificationQueue
        break
      case 'cleanup':
        queue = this.cleanupQueue
        break
      default:
        throw new Error(`Unknown queue: ${queueName}`)
    }

    await queue.pause()
    logger.info(`Queue ${queueName} paused`)
  }

  async resumeQueue(queueName: string): Promise<void> {
    let queue: Bull.Queue

    switch (queueName) {
      case 'token-analysis':
        queue = this.tokenAnalysisQueue
        break
      case 'alerts':
        queue = this.alertQueue
        break
      case 'notifications':
        queue = this.notificationQueue
        break
      case 'cleanup':
        queue = this.cleanupQueue
        break
      default:
        throw new Error(`Unknown queue: ${queueName}`)
    }

    await queue.resume()
    logger.info(`Queue ${queueName} resumed`)
  }

  async clearQueue(queueName: string): Promise<void> {
    let queue: Bull.Queue

    switch (queueName) {
      case 'token-analysis':
        queue = this.tokenAnalysisQueue
        break
      case 'alerts':
        queue = this.alertQueue
        break
      case 'notifications':
        queue = this.notificationQueue
        break
      case 'cleanup':
        queue = this.cleanupQueue
        break
      default:
        throw new Error(`Unknown queue: ${queueName}`)
    }

    await queue.clean(0, 'completed')
    await queue.clean(0, 'failed')
    logger.info(`Queue ${queueName} cleared`)
  }

  async getJob(jobId: string, queueName: string): Promise<Bull.Job | null> {
    let queue: Bull.Queue

    switch (queueName) {
      case 'token-analysis':
        queue = this.tokenAnalysisQueue
        break
      case 'alerts':
        queue = this.alertQueue
        break
      case 'notifications':
        queue = this.notificationQueue
        break
      case 'cleanup':
        queue = this.cleanupQueue
        break
      default:
        throw new Error(`Unknown queue: ${queueName}`)
    }

    return await queue.getJob(jobId)
  }

  async removeJob(jobId: string, queueName: string): Promise<void> {
    let queue: Bull.Queue

    switch (queueName) {
      case 'token-analysis':
        queue = this.tokenAnalysisQueue
        break
      case 'alerts':
        queue = this.alertQueue
        break
      case 'notifications':
        queue = this.notificationQueue
        break
      case 'cleanup':
        queue = this.cleanupQueue
        break
      default:
        throw new Error(`Unknown queue: ${queueName}`)
    }

    const job = await queue.getJob(jobId)
    if (job) {
      await job.remove()
      logger.info(`Job ${jobId} removed from queue ${queueName}`)
    }
  }

  async retryJob(jobId: string, queueName: string): Promise<void> {
    let queue: Bull.Queue

    switch (queueName) {
      case 'token-analysis':
        queue = this.tokenAnalysisQueue
        break
      case 'alerts':
        queue = this.alertQueue
        break
      case 'notifications':
        queue = this.notificationQueue
        break
      case 'cleanup':
        queue = this.cleanupQueue
        break
      default:
        throw new Error(`Unknown queue: ${queueName}`)
    }

    const job = await queue.getJob(jobId)
    if (job) {
      await job.retry()
      logger.info(`Job ${jobId} retried in queue ${queueName}`)
    }
  }

  // Start queue processors
  startProcessors(): void {
    // Token analysis processor
    this.tokenAnalysisQueue.process(5, async (job) => {
      const { tokenAddress, analysisDepth } = job.data
      logger.info(`Processing token analysis for ${tokenAddress}`)
      
      // This would be replaced with actual analysis logic
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      return {
        tokenAddress,
        analysisDepth,
        result: 'completed',
        processedAt: new Date()
      }
    })

    // Alert processor
    this.alertQueue.process(10, async (job) => {
      const { type, data } = job.data
      logger.info(`Processing ${type} alert`)
      
      // This would be replaced with actual alert processing logic
      await new Promise(resolve => setTimeout(resolve, 500))
      
      return {
        type,
        data,
        result: 'alert sent',
        processedAt: new Date()
      }
    })

    // Notification processor
    this.notificationQueue.process(20, async (job) => {
      const { type, data } = job.data
      logger.info(`Processing ${type} notification`)
      
      // This would be replaced with actual notification logic
      await new Promise(resolve => setTimeout(resolve, 200))
      
      return {
        type,
        data,
        result: 'notification sent',
        processedAt: new Date()
      }
    })

    // Cleanup processor
    this.cleanupQueue.process(2, async (job) => {
      const { operation, data } = job.data
      logger.info(`Processing ${operation} cleanup`)
      
      // This would be replaced with actual cleanup logic
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      return {
        operation,
        data,
        result: 'cleanup completed',
        processedAt: new Date()
      }
    })

    logger.info('Queue processors started')
  }

  async getActiveConnections(): Promise<number> {
    try {
      // This would get actual Redis connection count
      return 1
    } catch (error) {
      logger.error('Failed to get active connections:', error)
      return 0
    }
  }

  async getQueueSize(): Promise<number> {
    try {
      const stats = await this.getQueueStats('token-analysis')
      return stats.waiting + stats.active + stats.delayed
    } catch (error) {
      logger.error('Failed to get queue size:', error)
      return 0
    }
  }
}
