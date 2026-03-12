import jwt from 'jsonwebtoken'
import { config } from '../config/env'
import { logger } from './logger'

export interface TokenPayload {
  userId: string
  email: string
  role: string
}

export interface JWTTokens {
  accessToken: string
  refreshToken: string
}

export const generateAccessToken = (payload: object): string => {
  return jwt.sign(payload, config.jwt.secret)
}

export const generateRefreshToken = (payload: object): string => {
  return jwt.sign(payload, config.jwt.refreshSecret)
}

export const generateTokens = (payload: TokenPayload): JWTTokens => {
  const accessToken = generateAccessToken(payload)
  const refreshToken = generateRefreshToken(payload)

  return {
    accessToken,
    refreshToken,
  }
}

export const verifyAccessToken = (token: string): TokenPayload | null => {
  try {
    const decoded = jwt.verify(token, config.jwt.secret, {
      issuer: 'ether-platform',
      audience: 'ether-api',
    }) as TokenPayload

    return decoded
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logger.debug('Access token expired')
    } else if (error instanceof jwt.JsonWebTokenError) {
      logger.warn('Invalid access token')
    } else {
      logger.error('Access token verification failed:', error)
    }
    return null
  }
}

export const verifyRefreshToken = (token: string): TokenPayload | null => {
  try {
    const decoded = jwt.verify(token, config.jwt.refreshSecret, {
      issuer: 'ether-platform',
      audience: 'ether-api',
    }) as TokenPayload

    return decoded
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logger.debug('Refresh token expired')
    } else if (error instanceof jwt.JsonWebTokenError) {
      logger.warn('Invalid refresh token')
    } else {
      logger.error('Refresh token verification failed:', error)
    }
    return null
  }
}

export const extractTokenFromHeader = (authHeader: string | undefined): string | null => {
  if (!authHeader) {
    return null
  }

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null
  }

  return parts[1]
}

export const decodeToken = (token: string): any => {
  try {
    return jwt.decode(token)
  } catch (error) {
    logger.error('Failed to decode token:', error)
    return null
  }
}

export const getTokenExpirationTime = (token: string): number | null => {
  try {
    const decoded = jwt.decode(token) as any
    return decoded?.exp ? decoded.exp * 1000 : null // Convert to milliseconds
  } catch (error) {
    logger.error('Failed to get token expiration:', error)
    return null
  }
}

export const isTokenExpired = (token: string): boolean => {
  const expTime = getTokenExpirationTime(token)
  if (!expTime) return true

  return Date.now() >= expTime
}
