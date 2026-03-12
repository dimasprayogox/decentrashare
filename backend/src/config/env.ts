import { z } from 'zod'
import dotenv from 'dotenv'

dotenv.config()

const envSchema = z.object({
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string(),

  // JWT
  JWT_SECRET: z.string(),
  JWT_REFRESH_SECRET: z.string(),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Security
  BCRYPT_ROUNDS: z.string().default('12'),
  RATE_LIMIT_WINDOW_MS: z.string().default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100'),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // Webhook
  WEBHOOK_BASE_URL: z.string().default('http://localhost:3000'),
})

const parseEnv = () => {
  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.format())
    process.exit(1)
  }

  return result.data
}

export const env = parseEnv()

export const config = {
  server: {
    port: parseInt(env.PORT),
    isDevelopment: env.NODE_ENV === 'development',
    isProduction: env.NODE_ENV === 'production',
  },

  database: {
    url: env.DATABASE_URL,
  },

  jwt: {
    secret: env.JWT_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },

  security: {
    bcryptRounds: parseInt(env.BCRYPT_ROUNDS),
    rateLimitWindowMs: parseInt(env.RATE_LIMIT_WINDOW_MS),
    rateLimitMaxRequests: parseInt(env.RATE_LIMIT_MAX_REQUESTS),
  },

  cors: {
    origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
  },

  webhook: {
    baseUrl: env.WEBHOOK_BASE_URL,
  },
}
