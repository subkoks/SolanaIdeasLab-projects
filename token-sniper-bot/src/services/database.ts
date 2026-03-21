import { PrismaClient } from '@prisma/client'
import { createClient } from 'redis'
import { config } from '../config/environment'
import { logger } from '../utils/logger'

export class DatabaseService {
  private prisma: PrismaClient
  private redis: ReturnType<typeof createClient>

  constructor() {
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: config.database.url
        }
      },
      log: [
        {
          emit: 'event',
          level: 'query',
        },
        {
          emit: 'event',
          level: 'error',
        },
        {
          emit: 'event',
          level: 'info',
        },
      ],
    })

    this.redis = createClient({
      url: config.database.redisUrl,
      retry_delay_on_failover: 100,
      socket: {
        connectTimeout: 5000,
        lazyConnect: true,
      },
    })

    this.redis.on('error', (err) => {
      logger.error('Redis connection error:', err)
    })

    this.redis.on('connect', () => {
      logger.info('Redis connected successfully')
    })
  }

  async connect(): Promise<void> {
    try {
      await this.prisma.$connect()
      logger.info('Database connected successfully')
      
      await this.redis.connect()
      logger.info('Redis connected successfully')
    } catch (error) {
      logger.error('Failed to connect to database:', error)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.prisma.$disconnect()
      await this.redis.disconnect()
      logger.info('Database disconnected successfully')
    } catch (error) {
      logger.error('Error disconnecting from database:', error)
      throw error
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`
      await this.redis.ping()
      return true
    } catch (error) {
      logger.error('Database health check failed:', error)
      return false
    }
  }

  // User management
  async authenticateWallet(walletAddress: string, signature: string): Promise<any> {
    try {
      const user = await this.prisma.user.upsert({
        where: { walletAddress },
        update: { lastLogin: new Date() },
        create: {
          walletAddress,
          subscriptionTier: 'free',
          isActive: true
        }
      })

      const token = this.generateJWT(user.id)
      const refreshToken = this.generateRefreshToken(user.id)

      return {
        user: {
          id: user.id,
          walletAddress: user.walletAddress,
          subscriptionTier: user.subscriptionTier
        },
        token,
        refreshToken
      }
    } catch (error) {
      logger.error('Wallet authentication failed:', error)
      throw new Error('Authentication failed')
    }
  }

  async refreshToken(refreshToken: string): Promise<any> {
    try {
      const payload = this.verifyRefreshToken(refreshToken)
      const user = await this.prisma.user.findUnique({
        where: { id: payload.userId }
      })

      if (!user || !user.isActive) {
        throw new Error('Invalid refresh token')
      }

      const newToken = this.generateJWT(user.id)
      const newRefreshToken = this.generateRefreshToken(user.id)

      return {
        token: newToken,
        refreshToken: newRefreshToken
      }
    } catch (error) {
      logger.error('Token refresh failed:', error)
      throw new Error('Token refresh failed')
    }
  }

  // Alert management
  async getUserAlerts(userId: string): Promise<any[]> {
    try {
      return await this.prisma.tokenAlert.findMany({
        where: { userId, active: true },
        orderBy: { createdAt: 'desc' }
      })
    } catch (error) {
      logger.error('Failed to get user alerts:', error)
      throw error
    }
  }

  async createAlert(userId: string, alertData: any): Promise<any> {
    try {
      return await this.prisma.tokenAlert.create({
        data: {
          userId,
          tokenAddress: alertData.tokenAddress,
          alertType: alertData.alertType,
          criteria: alertData.criteria,
          active: true
        }
      })
    } catch (error) {
      logger.error('Failed to create alert:', error)
      throw error
    }
  }

  async deleteAlert(userId: string, alertId: string): Promise<void> {
    try {
      await this.prisma.tokenAlert.deleteMany({
        where: {
          id: alertId,
          userId
        }
      })
    } catch (error) {
      logger.error('Failed to delete alert:', error)
      throw error
    }
  }

  // User profile management
  async getUserProfile(userId: string): Promise<any> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          subscriptions: {
            where: { status: 'active' },
            orderBy: { createdAt: 'desc' },
            take: 1
          },
          tokenAlerts: {
            where: { active: true },
            orderBy: { createdAt: 'desc' }
          }
        }
      })

      if (!user) {
        throw new Error('User not found')
      }

      return {
        id: user.id,
        walletAddress: user.walletAddress,
        subscriptionTier: user.subscriptionTier,
        preferences: user.preferences || {},
        subscription: user.subscriptions[0] || null,
        alerts: user.tokenAlerts
      }
    } catch (error) {
      logger.error('Failed to get user profile:', error)
      throw error
    }
  }

  async updateUserProfile(userId: string, profileData: any): Promise<any> {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: {
          preferences: profileData.preferences,
          updatedAt: new Date()
        }
      })
    } catch (error) {
      logger.error('Failed to update user profile:', error)
      throw error
    }
  }

  // Subscription management
  async upgradeSubscription(userId: string, tier: string): Promise<any> {
    try {
      // Cancel existing subscription
      await this.prisma.subscription.updateMany({
        where: { 
          userId, 
          status: 'active' 
        },
        data: { 
          status: 'cancelled',
          cancelledAt: new Date()
        }
      })

      // Create new subscription
      return await this.prisma.subscription.create({
        data: {
          userId,
          tier,
          status: 'active',
          stripeSubscriptionId: `mock_${Date.now()}`,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        }
      })
    } catch (error) {
      logger.error('Failed to upgrade subscription:', error)
      throw error
    }
  }

  // Analytics and metrics
  async getUserStats(): Promise<any> {
    try {
      const [totalUsers, activeUsers, premiumUsers, newUsers] = await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { isActive: true } }),
        this.prisma.user.count({ 
          where: { 
            isActive: true,
            subscriptionTier: { in: ['basic', 'pro', 'enterprise'] }
          }
        }),
        this.prisma.user.count({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
            }
          }
        })
      ])

      return {
        total: totalUsers,
        active: activeUsers,
        premium: premiumUsers,
        newToday: newUsers,
        premiumRate: activeUsers > 0 ? (premiumUsers / activeUsers) * 100 : 0
      }
    } catch (error) {
      logger.error('Failed to get user stats:', error)
      throw error
    }
  }

  async getAlertStats(): Promise<any> {
    try {
      const [totalAlerts, activeAlerts, alertsByType] = await Promise.all([
        this.prisma.tokenAlert.count(),
        this.prisma.tokenAlert.count({ where: { active: true } }),
        this.prisma.tokenAlert.groupBy({
          by: ['alertType'],
          _count: { id: true }
        })
      ])

      return {
        total: totalAlerts,
        active: activeAlerts,
        byType: alertsByType.reduce((acc, item) => {
          acc[item.alertType] = item._count.id
          return acc
        }, {} as Record<string, number>)
      }
    } catch (error) {
      logger.error('Failed to get alert stats:', error)
      throw error
    }
  }

  async getRevenueStats(): Promise<any> {
    try {
      const subscriptions = await this.prisma.subscription.findMany({
        where: { status: 'active' }
      })

      const revenueByTier = subscriptions.reduce((acc, sub) => {
        const price = this.getPriceByTier(sub.tier)
        acc[sub.tier] = (acc[sub.tier] || 0) + price
        return acc
      }, {} as Record<string, number>)

      const totalMRR = Object.values(revenueByTier).reduce((sum, price) => sum + price, 0)

      return {
        mrr: totalMRR,
        arr: totalMRR * 12,
        byTier: revenueByTier,
        activeSubscriptions: subscriptions.length
      }
    } catch (error) {
      logger.error('Failed to get revenue stats:', error)
      throw error
    }
  }

  // Cache operations
  async setCache(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const serializedValue = JSON.stringify(value)
      if (ttl) {
        await this.redis.setEx(key, ttl, serializedValue)
      } else {
        await this.redis.set(key, serializedValue)
      }
    } catch (error) {
      logger.error('Failed to set cache:', error)
    }
  }

  async getCache(key: string): Promise<any> {
    try {
      const value = await this.redis.get(key)
      return value ? JSON.parse(value) : null
    } catch (error) {
      logger.error('Failed to get cache:', error)
      return null
    }
  }

  async deleteCache(key: string): Promise<void> {
    try {
      await this.redis.del(key)
    } catch (error) {
      logger.error('Failed to delete cache:', error)
    }
  }

  // Helper methods
  private generateJWT(userId: string): string {
    // This would use a real JWT library in production
    return `jwt_token_${userId}_${Date.now()}`
  }

  private generateRefreshToken(userId: string): string {
    // This would use a real JWT library in production
    return `refresh_token_${userId}_${Date.now()}`
  }

  private verifyRefreshToken(token: string): any {
    // This would use a real JWT library in production
    const parts = token.split('_')
    return { userId: parts[2] }
  }

  private getPriceByTier(tier: string): number {
    const prices = {
      free: 0,
      basic: 20,
      pro: 50,
      enterprise: 100
    }
    return prices[tier as keyof typeof prices] || 0
  }

  // Admin operations
  async getAllUsers(): Promise<any[]> {
    try {
      return await this.prisma.user.findMany({
        include: {
          subscriptions: true,
          tokenAlerts: true
        },
        orderBy: { createdAt: 'desc' }
      })
    } catch (error) {
      logger.error('Failed to get all users:', error)
      throw error
    }
  }

  async getAllScans(): Promise<any[]> {
    try {
      return await this.prisma.tokenAnalysis.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100
      })
    } catch (error) {
      logger.error('Failed to get all scans:', error)
      throw error
    }
  }

  async blacklistToken(tokenAddress: string, reason: string, evidence: any): Promise<any> {
    try {
      return await this.prisma.blacklistedToken.create({
        data: {
          tokenAddress,
          reason,
          evidence,
          blacklistedBy: 'system'
        }
      })
    } catch (error) {
      logger.error('Failed to blacklist token:', error)
      throw error
    }
  }

  async getBlacklistedTokens(): Promise<any[]> {
    try {
      return await this.prisma.blacklistedToken.findMany({
        orderBy: { createdAt: 'desc' }
      })
    } catch (error) {
      logger.error('Failed to get blacklisted tokens:', error)
      throw error
    }
  }
}
