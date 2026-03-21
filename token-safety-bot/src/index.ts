import express from 'express'
import { Telegraf, session } from 'telegraf'
import { config } from './config/environment'
import { logger } from './utils/logger'
import { DatabaseService } from './services/database'
import { SolanaService } from './services/solana'
import { SafetyScannerService } from './services/safety-scanner'
import { TelegramBotService } from './services/telegram-bot'
import { QueueService } from './services/queue'
import { MonitorService } from './services/monitor'
import { authMiddleware } from './middleware/auth'
import { errorHandler } from './middleware/error-handler'
import { rateLimitMiddleware } from './middleware/rate-limit'

class TokenSafetyBot {
  private app: express.Application
  private bot: Telegraf
  private db: DatabaseService
  private solana: SolanaService
  private safetyScanner: SafetyScannerService
  private telegramBot: TelegramBotService
  private queue: QueueService
  private monitor: MonitorService

  constructor() {
    this.app = express()
    this.bot = new Telegraf(config.telegram.botToken)
    this.db = new DatabaseService()
    this.solana = new SolanaService()
    this.safetyScanner = new SafetyScannerService()
    this.telegramBot = new TelegramBotService(this.bot)
    this.queue = new QueueService()
    this.monitor = new MonitorService()
    
    this.setupMiddleware()
    this.setupRoutes()
    this.setupTelegramBot()
    this.setupErrorHandling()
  }

  private setupMiddleware(): void {
    this.app.use(express.json())
    this.app.use(express.urlencoded({ extended: true }))
    this.app.use(rateLimitMiddleware())
    this.app.use(cors())
    this.app.use(helmet())
    this.app.use(compression())
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.getHealthStatus()
        res.json(health)
      } catch (error) {
        res.status(500).json({ status: 'error', message: 'Health check failed' })
      }
    })

    // API routes
    this.app.use('/api/v1/auth', this.authRoutes())
    this.app.use('/api/v1/scan', this.scanRoutes())
    this.app.use('/api/v1/safety', this.safetyRoutes())
    this.app.use('/api/v1/monitor', this.monitorRoutes())
    this.app.use('/api/v1/users', authMiddleware, this.userRoutes())

    // Webhook for Telegram
    this.app.post('/webhook/telegram', (req, res) => {
      this.bot.handleUpdate(req.body)
      res.sendStatus(200)
    })

    // Admin routes (protected)
    this.app.use('/api/v1/admin', authMiddleware, this.adminRoutes())
  }

  private setupTelegramBot(): void {
    // Session middleware for bot
    this.bot.use(session())

    // Register bot commands
    this.telegramBot.registerCommands()

    // Start bot
    this.bot.launch().catch((error) => {
      logger.error('Failed to start Telegram bot:', error)
      process.exit(1)
    })
  }

  private setupErrorHandling(): void {
    this.app.use(errorHandler)

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
    })

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error)
      process.exit(1)
    })
  }

  private authRoutes(): express.Router {
    const router = express.Router()
    
    router.post('/wallet/connect', async (req, res) => {
      try {
        const { walletAddress, signature } = req.body
        const auth = await this.db.authenticateWallet(walletAddress, signature)
        res.json(auth)
      } catch (error) {
        res.status(401).json({ error: 'Authentication failed' })
      }
    })

    router.post('/refresh', async (req, res) => {
      try {
        const { refreshToken } = req.body
        const auth = await this.db.refreshToken(refreshToken)
        res.json(auth)
      } catch (error) {
        res.status(401).json({ error: 'Token refresh failed' })
      }
    })

    return router
  }

  private scanRoutes(): express.Router {
    const router = express.Router()
    
    router.post('/', authMiddleware, async (req, res) => {
      try {
        const { tokenAddress, analysisDepth = 'quick' } = req.body
        const scan = await this.safetyScanner.scanToken(tokenAddress, analysisDepth)
        res.json(scan)
      } catch (error) {
        res.status(500).json({ error: 'Token scan failed' })
      }
    })

    router.get('/:tokenAddress', async (req, res) => {
      try {
        const { tokenAddress } = req.params
        const scan = await this.safetyScanner.getLatestScan(tokenAddress)
        res.json(scan)
      } catch (error) {
        res.status(404).json({ error: 'Scan not found' })
      }
    })

    return router
  }

  private safetyRoutes(): express.Router {
    const router = express.Router()
    
    router.get('/score/:tokenAddress', async (req, res) => {
      try {
        const { tokenAddress } = req.params
        const score = await this.safetyScanner.getSafetyScore(tokenAddress)
        res.json(score)
      } catch (error) {
        res.status(404).json({ error: 'Safety score not found' })
      }
    })

    router.get('/report/:tokenAddress', async (req, res) => {
      try {
        const { tokenAddress } = req.params
        const report = await this.safetyScanner.generateReport(tokenAddress)
        res.json(report)
      } catch (error) {
        res.status(500).json({ error: 'Report generation failed' })
      }
    })

    router.post('/contract/analyze', async (req, res) => {
      try {
        const { programId, analysisType = 'security' } = req.body
        const analysis = await this.safetyScanner.analyzeContract(programId, analysisType)
        res.json(analysis)
      } catch (error) {
        res.status(500).json({ error: 'Contract analysis failed' })
      }
    })

    router.post('/rug-pull/detect', async (req, res) => {
      try {
        const { tokenAddress, timeWindow = 3600 } = req.body
        const detection = await this.safetyScanner.detectRugPullRisk(tokenAddress, timeWindow)
        res.json(detection)
      } catch (error) {
        res.status(500).json({ error: 'Rug pull detection failed' })
      }
    })

    return router
  }

  private monitorRoutes(): express.Router {
    const router = express.Router()
    
    router.post('/:tokenAddress', authMiddleware, async (req, res) => {
      try {
        const { tokenAddress } = req.params
        const userId = req.user!.id
        const monitoring = await this.monitor.startMonitoring(tokenAddress, userId)
        res.json(monitoring)
      } catch (error) {
        res.status(400).json({ error: 'Failed to start monitoring' })
      }
    })

    router.get('/:tokenAddress', authMiddleware, async (req, res) => {
      try {
        const { tokenAddress } = req.params
        const status = await this.monitor.getMonitoringStatus(tokenAddress)
        res.json(status)
      } catch (error) {
        res.status(404).json({ error: 'Monitoring not found' })
      }
    })

    router.delete('/:tokenAddress', authMiddleware, async (req, res) => {
      try {
        const { tokenAddress } = req.params
        const userId = req.user!.id
        await this.monitor.stopMonitoring(tokenAddress, userId)
        res.json({ success: true })
      } catch (error) {
        res.status(400).json({ error: 'Failed to stop monitoring' })
      }
    })

    return router
  }

  private userRoutes(): express.Router {
    const router = express.Router()
    
    router.get('/profile', async (req, res) => {
      try {
        const userId = req.user!.id
        const profile = await this.db.getUserProfile(userId)
        res.json(profile)
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch profile' })
      }
    })

    router.put('/profile', async (req, res) => {
      try {
        const userId = req.user!.id
        const profile = await this.db.updateUserProfile(userId, req.body)
        res.json(profile)
      } catch (error) {
        res.status(400).json({ error: 'Failed to update profile' })
      }
    })

    router.get('/scans', async (req, res) => {
      try {
        const userId = req.user!.id
        const scans = await this.db.getUserScans(userId)
        res.json(scans)
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch scans' })
      }
    })

    router.get('/alerts', async (req, res) => {
      try {
        const userId = req.user!.id
        const alerts = await this.db.getUserAlerts(userId)
        res.json(alerts)
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch alerts' })
      }
    })

    router.post('/upgrade', async (req, res) => {
      try {
        const userId = req.user!.id
        const { tier } = req.body
        const subscription = await this.db.upgradeSubscription(userId, tier)
        res.json(subscription)
      } catch (error) {
        res.status(400).json({ error: 'Failed to upgrade subscription' })
      }
    })

    return router
  }

  private adminRoutes(): express.Router {
    const router = express.Router()
    
    router.get('/stats', async (req, res) => {
      try {
        const stats = await this.getAdminStats()
        res.json(stats)
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats' })
      }
    })

    router.post('/broadcast', async (req, res) => {
      try {
        const { message, targetTier = 'all' } = req.body
        const result = await this.telegramBot.broadcastSafetyAlert(message, targetTier)
        res.json(result)
      } catch (error) {
        res.status(400).json({ error: 'Broadcast failed' })
      }
    })

    router.get('/scans', async (req, res) => {
      try {
        const scans = await this.db.getAllScans()
        res.json(scans)
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch scans' })
      }
    })

    router.post('/blacklist', async (req, res) => {
      try {
        const { tokenAddress, reason, evidence } = req.body
        const blacklist = await this.db.blacklistToken(tokenAddress, reason, evidence)
        res.json(blacklist)
      } catch (error) {
        res.status(400).json({ error: 'Failed to blacklist token' })
      }
    })

    router.get('/blacklist', async (req, res) => {
      try {
        const blacklist = await this.db.getBlacklistedTokens()
        res.json(blacklist)
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch blacklist' })
      }
    })

    return router
  }

  private async getHealthStatus(): Promise<any> {
    const [dbStatus, redisStatus, solanaStatus] = await Promise.allSettled([
      this.db.healthCheck(),
      this.queue.healthCheck(),
      this.solana.healthCheck()
    ])

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus.status === 'fulfilled' ? 'healthy' : 'unhealthy',
        redis: redisStatus.status === 'fulfilled' ? 'healthy' : 'unhealthy',
        solana: solanaStatus.status === 'fulfilled' ? 'healthy' : 'unhealthy',
        telegram: 'healthy'
      },
      metrics: await this.getBotMetrics()
    }
  }

  private async getAdminStats(): Promise<any> {
    const [userStats, scanStats, alertStats, detectionStats] = await Promise.all([
      this.db.getUserStats(),
      this.db.getScanStats(),
      this.db.getAlertStats(),
      this.db.getDetectionStats()
    ])

    return {
      users: userStats,
      scans: scanStats,
      alerts: alertStats,
      detections: detectionStats,
      performance: await this.getPerformanceMetrics()
    }
  }

  private async getBotMetrics(): Promise<any> {
    return {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      activeConnections: this.queue.getActiveConnections(),
      queueSize: await this.queue.getQueueSize(),
      monitoringTokens: await this.monitor.getActiveMonitoringCount()
    }
  }

  private async getPerformanceMetrics(): Promise<any> {
    return {
      scanAccuracy: await this.db.getScanAccuracy(),
      avgScanTime: await this.db.getAverageScanTime(),
      detectionRate: await this.db.getDetectionRate(),
      falsePositiveRate: await this.db.getFalsePositiveRate()
    }
  }

  public async start(): Promise<void> {
    try {
      // Initialize database
      await this.db.connect()
      logger.info('Database connected')

      // Initialize queue
      await this.queue.connect()
      logger.info('Queue service connected')

      // Initialize Solana connection
      await this.solana.connect()
      logger.info('Solana RPC connected')

      // Start queue processors
      this.queue.startProcessors()
      logger.info('Queue processors started')

      // Start monitoring service
      await this.monitor.start()
      logger.info('Monitoring service started')

      // Start HTTP server
      const port = config.server.port || 8000
      this.app.listen(port, () => {
        logger.info(`Token Safety Bot server started on port ${port}`)
        logger.info(`Telegram bot: @${config.telegram.botUsername}`)
      })
    } catch (error) {
      logger.error('Failed to start server:', error)
      process.exit(1)
    }
  }

  public async stop(): Promise<void> {
    logger.info('Shutting down Token Safety Bot...')
    
    try {
      await this.monitor.stop()
      await this.queue.disconnect()
      await this.solana.disconnect()
      await this.db.disconnect()
      this.bot.stop()
      logger.info('Token Safety Bot stopped gracefully')
    } catch (error) {
      logger.error('Error during shutdown:', error)
      process.exit(1)
    }
  }
}

// Start the bot
const bot = new TokenSafetyBot()

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully')
  await bot.stop()
  process.exit(0)
})

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully')
  await bot.stop()
  process.exit(0)
})

// Start the bot
bot.start().catch((error) => {
  logger.error('Failed to start bot:', error)
  process.exit(1)
})
