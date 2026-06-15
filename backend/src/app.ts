// ── BigInt JSON serialization patch ───────────────────────────────
// Prisma mengembalikan kolom BigInt (mis. User.storageLimit) sebagai BigInt,
// yang tidak bisa di-serialize oleh JSON.stringify (dipakai res.json()).
// Konversi ke Number aman karena nilai jauh di bawah Number.MAX_SAFE_INTEGER.
; (BigInt.prototype as any).toJSON = function () {
  return Number(this)
}

import express from 'express'
import cors from 'cors'
import cron from 'node-cron';
import { CRON_SCHEDULES } from './config/cron';
import { runOrphanedPinCleanup } from './jobs/cleanup-orphaned-pins';
import { runExpiredTrashCleanup } from './jobs/cleanup-expired-trash';
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import cookieParser from 'cookie-parser'
import { config } from './config/env'
import { logger, requestLogger } from './utils/logger'
import { errorMiddleware, notFoundMiddleware } from './middlewares/error.middleware'
import routes from './routes'

const app = express()

// Trust proxy for accurate client IPs
app.set('trust proxy', 1)

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
}))

logger.info(`[RAW CORS_ORIGIN] ${env.CORS_ORIGIN}`)
logger.info(`[CONFIG CORS ORIGIN] ${JSON.stringify(config.cors.origin)}`)

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = config.cors.origin;

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.error(`[CORS Blocked] Origin not allowed: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-callback-token'],
}))

// Rate limiting
const limiter = rateLimit({
  windowMs: config.security.rateLimitWindowMs,
  max: config.security.rateLimitMaxRequests,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for webhooks
  skip: (req) => req.path.startsWith('/api/webhooks/'),
})
app.use(limiter)

// Body parsing middleware
app.use(express.json({
  limit: '10mb',
  // Raw body for webhook signature verification
  verify: (req: any, res, buf) => {
    if (req.path.startsWith('/api/webhooks/')) {
      req.rawBody = buf.toString()
    }
  }
}))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Cookie parsing
app.use(cookieParser())

// Request logging
app.use(requestLogger)

// API routes
app.use('/api', routes)

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Decentrashare API Server',
    description: 'A secure and scalable backend for Decentrashare, built with Express',
    version: '1.0.0',
    documentation: '/api',
    health: '/api/health',
  })
})

if (process.env.ENABLE_JOBS !== 'false') {
  void runOrphanedPinCleanup().catch((error: unknown) => {
    logger.error('Initial orphaned pin cleanup crashed', { error });
  });

  void runExpiredTrashCleanup().catch((error: unknown) => {
    logger.error('Initial expired trash cleanup crashed', { error });
  });

  // Cleanup orphaned pins
  cron.schedule(CRON_SCHEDULES.CLEANUP_ORPHANED_PINS, async () => {
    logger.info('Starting orphaned pin cleanup job...');
    try {
      await runOrphanedPinCleanup();
    } catch (error) {
      logger.error('Cleanup job crashed', { error });
    }
  });

  cron.schedule(CRON_SCHEDULES.CLEANUP_EXPIRED_TRASH, async () => {
    logger.info('Starting expired trash cleanup job...');
    try {
      await runExpiredTrashCleanup();
    } catch (error) {
      logger.error('Expired trash cleanup job crashed', { error });
    }
  });

  logger.info(`Scheduled orphaned pin cleanup job: ${CRON_SCHEDULES.CLEANUP_ORPHANED_PINS}`);
  logger.info(`Scheduled expired trash cleanup job: ${CRON_SCHEDULES.CLEANUP_EXPIRED_TRASH}`);
}

// 404 handler
app.use(notFoundMiddleware)

// Error handler (must be last)
app.use(errorMiddleware)

export default app