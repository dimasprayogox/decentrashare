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
