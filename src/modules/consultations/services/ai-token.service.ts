import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../../../core/cache/cache.service';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AITokenService {
  private readonly logger = new Logger(AITokenService.name);
  private readonly secretKey: string;
  private readonly tokenCacheKey = 'ai-service-token';
  private readonly tokenValidityBuffer = 5 * 60; // 5 minutes buffer before expiry

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
  ) {
this.secretKey = this.configService.get<string>('AI_DIAGNOSIS_SECRET_KEY') || 'shared-jwt-secret-key-for-ai-agent';
  }

  /**
   * Get a valid JWT token for AI service communication
   * Returns cached token if valid, generates new one if expired
   */
  async getValidToken(): Promise<string> {
    try {
      this.logger.debug('🔍 [DEBUG] Getting valid AI service token...');
      
      // Check if we have a cached token
      this.logger.debug('🔍 [DEBUG] Checking cache for existing token...');
      const cachedToken = await this.cacheService.get(this.tokenCacheKey);
      this.logger.debug('🔍 [DEBUG] Cached token found:', !!cachedToken);
      
      if (cachedToken && this.isTokenValid(cachedToken)) {
        this.logger.debug('🔍 [DEBUG] Using cached AI service token');
        return cachedToken;
      }

      // Generate new token
      this.logger.debug('🔍 [DEBUG] Generating new token...');
      const newToken = this.generateToken();
      this.logger.debug('🔍 [DEBUG] New token generated successfully:', !!newToken);
      
      // Cache the token with appropriate TTL
      this.logger.debug('🔍 [DEBUG] Decoding token payload for caching...');
      const tokenPayload = jwt.decode(newToken) as any;
      const expiresIn = tokenPayload.exp - Math.floor(Date.now() / 1000);
      const cacheTtl = Math.max(expiresIn - this.tokenValidityBuffer, 60); // At least 1 minute
      this.logger.debug('🔍 [DEBUG] Cache TTL calculated:', cacheTtl);

      this.logger.debug('🔍 [DEBUG] Caching token...');
      await this.cacheService.set(this.tokenCacheKey, newToken, cacheTtl);
      
      this.logger.log('✅ Generated new AI service token successfully');
      return newToken;
      
    } catch (error) {
      this.logger.error('❌ [ERROR] Failed to get AI service token:', error.message);
      this.logger.error('❌ [ERROR] Stack trace:', error.stack);
      throw new Error(`Failed to generate AI service token: ${error.message}`);
    }
  }

  /**
   * Generate a new JWT token for AI service
   */
  private generateToken(): string {
    const now = Math.floor(Date.now() / 1000);
    const configValue = this.configService.get('AI_DIAGNOSIS_TOKEN_EXPIRY');
    const expiresIn = configValue ? parseInt(String(configValue), 10) : 3600; // 1 hour default
    
    // Debug logging for token generation
    this.logger.debug('🔍 [DEBUG] Token generation details:', {
      now,
      configValue,
      expiresIn,
      expiresInType: typeof expiresIn,
      expClaim: now + expiresIn,
      expClaimType: typeof (now + expiresIn)
    });
    
    // Validate that expiresIn is a valid number
    if (isNaN(expiresIn) || expiresIn <= 0) {
      this.logger.error('❌ [ERROR] Invalid expiresIn value:', { configValue, expiresIn });
      throw new Error(`Invalid AI_DIAGNOSIS_TOKEN_EXPIRY value: ${configValue}. Must be a positive number.`);
    }
    
    const payload = {
      sub: 'tenderly-backend-service',
      username: 'backend-service',
      exp: now + expiresIn,
      iat: now,
      aud: 'ai-diagnosis-service',
      iss: 'tenderly-backend',
      service: true, // Flag to indicate this is a service token
    };
    
    this.logger.debug('🔍 [DEBUG] Final JWT payload:', payload);

    return jwt.sign(payload, this.secretKey, { algorithm: 'HS256' });
  }

  /**
   * Check if token is valid and not expired
   */
  private isTokenValid(token: string): boolean {
    try {
      const payload = jwt.decode(token) as any;
      if (!payload || !payload.exp) {
        return false;
      }

      const now = Math.floor(Date.now() / 1000);
      const bufferTime = now + this.tokenValidityBuffer;
      
      return payload.exp > bufferTime;
    } catch (error) {
      this.logger.warn('Invalid token format:', error);
      return false;
    }
  }

  /**
   * Force refresh the token (useful for testing or when token is rejected)
   */
  async refreshToken(): Promise<string> {
    this.logger.log('Force refreshing AI service token');
    await this.cacheService.delete(this.tokenCacheKey);
    return this.getValidToken();
  }

  /**
   * Get token information for debugging
   */
  async getTokenInfo(): Promise<any> {
    try {
      this.logger.debug('🔍 [DEBUG] Getting token info...');
      this.logger.debug('🔍 [DEBUG] Secret key configured:', !!this.secretKey);
      this.logger.debug('🔍 [DEBUG] Secret key length:', this.secretKey?.length || 0);
      
      const token = await this.getValidToken();
      this.logger.debug('🔍 [DEBUG] Token generated successfully:', !!token);
      
      const payload = jwt.decode(token) as any;
      this.logger.debug('🔍 [DEBUG] Token payload decoded:', !!payload);
      
      const tokenInfo = {
        subject: payload.sub,
        username: payload.username,
        issuedAt: new Date(payload.iat * 1000),
        expiresAt: new Date(payload.exp * 1000),
        audience: payload.aud,
        issuer: payload.iss,
        isService: payload.service,
        validFor: payload.exp - Math.floor(Date.now() / 1000),
      };
      
      this.logger.debug('🔍 [DEBUG] Token info created:', JSON.stringify(tokenInfo, null, 2));
      return tokenInfo;
      
    } catch (error) {
      this.logger.error('❌ [ERROR] Failed to get token info:', error.message);
      this.logger.error('❌ [ERROR] Stack trace:', error.stack);
      return null;
    }
  }
}
