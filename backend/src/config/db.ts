import { PrismaClient } from '@prisma/client'
import { config } from './env'
import { logger } from '../utils/logger'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.server.isDevelopment ? ['query', 'error', 'warn'] : ['error'],
  })

if (config.server.isDevelopment) globalForPrisma.prisma = prisma

// Helper function to prune user activity logs to exactly 100 entries
const pruneUserActivityLogs = async (userId: string) => {
  try {
    const count = await prisma.activityLog.count({
      where: { userId }
    })

    if (count > 100) {
      const logsToDelete = await prisma.activityLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: 100,
        select: { id: true }
      })

      if (logsToDelete.length > 0) {
        await prisma.activityLog.deleteMany({
          where: {
            id: { in: logsToDelete.map(l => l.id) }
          }
        })
      }
    }
  } catch (error) {
    logger.error('❌ Failed to prune user activity logs:', error)
  }
}

// Register middleware for auto-pruning activity logs
prisma.$use(async (params, next) => {
  const result = await next(params)
  if (params.model === 'ActivityLog' && (params.action === 'create' || params.action === 'createMany')) {
    let userId: string | null = null
    if (params.action === 'create') {
      userId = params.args?.data?.userId
    } else if (params.action === 'createMany') {
      const data = params.args?.data
      if (data) {
        const items = Array.isArray(data) ? data : [data]
        userId = items[0]?.userId
      }
    }

    if (userId) {
      pruneUserActivityLogs(userId).catch(err => {
        logger.error('❌ Error in activityLog auto-pruning middleware:', err)
      })
    }
  }
  return result
})

// Connection test
export const connectDatabase = async () => {
  try {
    await prisma.$connect()
    logger.info('✅ Database connected successfully')
  } catch (error) {
    logger.error('❌ Failed to connect to database:', error)
    process.exit(1)
  }
}

// Graceful shutdown
export const disconnectDatabase = async () => {
  try {
    await prisma.$disconnect()
    logger.info('✅ Database disconnected successfully')
  } catch (error) {
    logger.error('❌ Error disconnecting database:', error)
  }
}

// Health check
export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}
