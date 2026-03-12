import winston from 'winston'
import { config } from '../config/env'

const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
}

const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
}

winston.addColors(logColors)

const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`
    
    // Add stack trace for errors
    if (stack) {
      log += `\n${stack}`
    }
    
    // Add metadata if exists
    const metaString = Object.keys(meta).length > 0 ? `\n${JSON.stringify(meta, null, 2)}` : ''
    
    return log + metaString
  })
)

export const logger = winston.createLogger({
  levels: logLevels,
  level: config.server.isDevelopment ? 'debug' : 'info',
  format,
  transports: [
    // Console transport
    new winston.transports.Console({
      stderrLevels: ['error'],
    }),
    
    // File transports
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: winston.format.combine(
        winston.format.uncolorize(),
        winston.format.json()
      ),
    }),
    
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: winston.format.combine(
        winston.format.uncolorize(),
        winston.format.json()
      ),
    }),
  ],
  
  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({ filename: 'logs/exceptions.log' }),
  ],
  
  rejectionHandlers: [
    new winston.transports.File({ filename: 'logs/rejections.log' }),
  ],
})

// Create request ID for tracing
export const generateRequestId = (): string => {
  return Math.random().toString(36).substr(2, 9)
}

// Middleware logger
export const requestLogger = (req: any, res: any, next: any) => {
  const requestId = generateRequestId()
  req.requestId = requestId
  
  const start = Date.now()
  
  // Log request
  logger.info(`[${requestId}] ${req.method} ${req.url}`, {
    requestId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
  })
  
  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start
    logger.info(`[${requestId}] ${res.statusCode} ${duration}ms`, {
      requestId,
      statusCode: res.statusCode,
      duration,
    })
  })
  
  next()
}