import { Router } from 'express'
import authRoutes from './modules/auth/auth.routes'
import documentRoutes from './modules/document/document.routes'
import folderRoutes from './modules/folder/folder.routes'
import userRoutes from './modules/user/user.routes'

const router = Router()

// API Routes
router.use('/auth', authRoutes)
router.use('/documents', documentRoutes)
router.use('/folders', folderRoutes)
router.use('/user', userRoutes)

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Decentrashare API is healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  })
})

// API info endpoint
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to Decentrashare API',
    description: 'A secure and scalable backend for Decentrashare, built with Express',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',

    },
  })
})

export default router