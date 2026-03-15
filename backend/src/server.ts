import app from './app'
import { config } from './config/env'
import { connectDatabase, disconnectDatabase } from './config/db'
import { logger } from './utils/logger'

const startServer = async () => {
  try {
    // Initialize database connection
    await connectDatabase()

    // Start server
    const server = app.listen(config.server.port, () => {
      logger.info(`🚀 Decentrashare API Server running on port ${config.server.port}`)
      logger.info(`🌍 Environment: ${config.server.isDevelopment ? 'Development' : 'Production'}`)
      logger.info(`📚 API Documentation: http://localhost:${config.server.port}/api`)
      logger.info(`❤️  Health Check: http://localhost:${config.server.port}/api/health`)
    })

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully...`)

      server.close(async () => {
        logger.info('HTTP server closed')
        await disconnectDatabase()
        process.exit(0)
      })

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Force shutdown after timeout')
        process.exit(1)
      }, 30000)
    }
 
    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error)
      process.exit(1)
    })

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
      process.exit(1)
    })

  } catch (error) {
    logger.error('❌ Failed to start server:', error)
    process.exit(1)
  }
}

startServer()