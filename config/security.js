import dotenv from 'dotenv';

dotenv.config();

let devWarningShown = false;

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();
  const isProd = process.env.NODE_ENV === 'production';

  if (secret && secret !== 'your_jwt_secret_key_change_in_production' && secret !== 'super_market_secret_jwt_key_2026_secure') {
    return secret;
  }

  if (isProd) {
    console.error('❌ CRITICAL SECURITY WARNING: JWT_SECRET is not configured or using default placeholder in production!');
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is strictly required in production.');
    }
  } else if (!devWarningShown) {
    console.warn('⚠️ Development warning: Using default JWT secret. Set JWT_SECRET in .env for production.');
    devWarningShown = true;
  }

  return secret || 'super_market_secret_jwt_key_2026_secure';
}
