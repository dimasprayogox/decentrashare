import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import cookieParser from 'cookie-parser'
import { config } from './config/env'
import { requestLogger } from './utils/logger'
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

// CORS configuration
app.use(cors({
  origin: config.cors.origin,
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

// 404 handler
app.use(notFoundMiddleware)

// Error handler (must be last)
app.use(errorMiddleware)

export default app