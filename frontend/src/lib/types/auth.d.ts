// src/lib/types/auth.d.ts

// ── User Types ──────────────────────────────────────────────

export interface AuthUser {
  id: string;
  walletAddress: string;
  username?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  website?: string | null;
  role: 'user' | 'admin';
  isRegistered: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// ── Request Body Types ──────────────────────────────────────

export interface AuthNonceRequest {
  walletAddress: string;
}

export interface AuthLoginRequest {
  walletAddress: string;
  signature: string;
  nonce: string;
}

export interface AuthRegisterRequest {
  walletAddress: string;
  signature: string;
  nonce: string;
  username?: string;
  email?: string;
}

// ── API Response Types (Discriminated Unions) ───────────────

export interface AuthNonceResponse {
  success: true;
  data: { 
    nonce: string; 
    loginMessage: string; 
    registerMessage: string;
  };
  message?: string;
}

export interface AuthLoginResponse {
  success: true;
  data: { 
    user: AuthUser; 
    token: string; 
    refreshToken: string;
    isProfileComplete: boolean;
  };
  message?: string;
}

export interface AuthRegisterResponse {
  success: true;
  data: { 
    user: AuthUser; 
    token: string; 
    refreshToken: string;
    isProfileComplete: boolean;
  };
  message?: string;
}

export interface AuthLogoutResponse {
  success: true;
  message: string;
}

// ✅ Error Response - Lengkap & Single Source of Truth
export interface AuthErrorResponse {
  success: false;
  message: string;
  errorCode?: 
    | 'MISSING_PARAMS'
    | 'INVALID_ADDRESS_FORMAT'
    | 'WALLET_NOT_FOUND'
    | 'WALLET_NOT_REGISTERED'
    | 'NONCE_EXPIRED'
    | 'SIGNATURE_INVALID'
    | 'USERNAME_TAKEN'
    | 'EMAIL_TAKEN'
    | 'UNAUTHORIZED'
    | 'NETWORK_ERROR'
    | 'PARSE_ERROR'
    | 'INTERNAL_ERROR';
  data?: never; // ← Mencegah akses .data saat success: false
}

// ── Union Types untuk Type Narrowing ────────────────────────

export type AuthResponse<T = AuthLoginResponse | AuthNonceResponse | AuthRegisterResponse> = 
  | T 
  | AuthErrorResponse;

export type AuthApiResult<T> = 
  | { success: true; data: T }
  | { success: false; message: string; errorCode?: string };

export type AuthApiResponse<T> = T | AuthErrorResponse;

// ── Session/Cookie Types ────────────────────────────────────

export interface SessionData {
  userId: string;
  walletAddress: string;
  role: AuthUser['role'];
  iat: number;
  exp: number;
}

// ── Custom Error Classes ────────────────────────────────────

export class AuthError extends Error {
  constructor(
    message: string,
    public errorCode: AuthErrorResponse['errorCode'],
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export class UnauthorizedError extends AuthError {
  constructor(message = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export class ValidationError extends AuthError {
  constructor(message: string, errorCode?: AuthErrorResponse['errorCode']) {
    super(message, errorCode || 'MISSING_PARAMS', 400);
  }
}

export class NetworkError extends AuthError {
  constructor(message = 'Network error') {
    super(message, 'NETWORK_ERROR', 503);
  }
}