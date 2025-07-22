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
    this.secretKey = this.configService.get<string>('ai.diagnosis.secretKey') || 'development_jwt_secret_key_change_in_production';
  }

  /**
   * Get a valid JWT token for AI service communication
   * Returns cached token if valid, generates new one if expired
   */
  async getValidToken(): Promise<string> {
    try {
      // Check if we have a cached token
      const cachedToken = await this.cacheService.get(this.tokenCacheKey);
      
      if (cachedToken && this.isTokenValid(cachedToken)) {
        this.logger.debug('Using cached AI service token');
        return cachedToken;
      }

      // Generate new token
      const newToken = this.generateToken();
      
      // Cache the token with appropriate TTL
      const tokenPayload = jwt.decode(newToken) as any;
      const expiresIn = tokenPayload.exp - Math.floor(Date.now() / 1000);
      const cacheTtl = Math.max(expiresIn - this.tokenValidityBuffer, 60); // At least 1 minute

      await this.cacheService.set(this.tokenCacheKey, newToken, cacheTtl);
      
      this.logger.log('Generated new AI service token');
      return newToken;
      
    } catch (error) {
      this.logger.error('Failed to get AI service token:', error);
      throw new Error('Failed to generate AI service token');
    }
  }

  /**
   * Generate a new JWT token for AI service
   */
  private generateToken(): string {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = this.configService.get<number>('ai.diagnosis.tokenExpiry') || 3600; // 1 hour default
    
    const payload = {
      sub: 'tenderly-backend-service',
      username: 'backend-service',
      exp: now + expiresIn,
      iat: now,
      aud: 'ai-diagnosis-service',
      iss: 'tenderly-backend',
      service: true, // Flag to indicate this is a service token
    };

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
      const token = await this.getValidToken();
      const payload = jwt.decode(token) as any;
      
      return {
        subject: payload.sub,
        username: payload.username,
        issuedAt: new Date(payload.iat * 1000),
        expiresAt: new Date(payload.exp * 1000),
        audience: payload.aud,
        issuer: payload.iss,
        isService: payload.service,
        validFor: payload.exp - Math.floor(Date.now() / 1000),
      };
    } catch (error) {
      this.logger.error('Failed to get token info:', error);
      return null;
    }
  }
}
