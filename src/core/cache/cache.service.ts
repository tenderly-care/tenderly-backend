import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

@Injectable()
export class CacheService {
  private logger = new Logger('CacheService');
  private readonly client: Redis | null;
  private isRedisAvailable: boolean = false;

  constructor(private configService: ConfigService) {
    // Check for Railway-style REDIS_URL first
    const redisUrl = this.configService.get<string>('database.redis.url');
    const redisHost = this.configService.get<string>('database.redis.host');
    
    // Skip Redis initialization if no connection info is available
    if (!redisUrl && (!redisHost || redisHost === 'disabled' || redisHost === '')) {
      this.logger.log('Redis disabled - running without cache');
      this.client = null;
      this.isRedisAvailable = false;
      return;
    }
    
    try {
      let redisOptions: RedisOptions;
      
      if (redisUrl) {
        // Use Railway's REDIS_URL (preferred method)
        this.logger.log(`Connecting to Redis using URL: ${redisUrl.replace(/:([^:@]{2,})@/, ':***@')}`);
        redisOptions = {
          // Parse the URL for connection
          connectionName: 'tenderly-cache',
          keyPrefix: this.configService.get<string>('database.redis.keyPrefix'),
          // Reduced timeouts for Railway
          maxRetriesPerRequest: 3,
          connectTimeout: 10000,
          lazyConnect: true,
          showFriendlyErrorStack: true,
          // Auto-reconnect with backoff
          reconnectOnError: (err) => {
            const targetError = 'READONLY';
            return err.message.includes(targetError);
          },
          retryDelayOnFailover: 100,
          // Production optimizations
          enableReadyCheck: true,
          maxLoadingRetryTime: 5000,
        };
        
        // Create Redis client with URL
        this.client = new Redis(redisUrl, redisOptions);
      } else {
        // Fallback to individual parameters
        this.logger.log(`Connecting to Redis at ${redisHost}:${this.configService.get<number>('database.redis.port')}`);
        redisOptions = {
          host: redisHost,
          port: this.configService.get<number>('database.redis.port'),
          password: this.configService.get<string>('database.redis.password'),
          db: this.configService.get<number>('database.redis.db'),
          keyPrefix: this.configService.get<string>('database.redis.keyPrefix'),
          // Connection settings
          maxRetriesPerRequest: 3,
          connectTimeout: 10000,
          lazyConnect: true,
          showFriendlyErrorStack: true,
          reconnectOnError: (err) => {
            const targetError = 'READONLY';
            return err.message.includes(targetError);
          },
          // TLS for production
          tls:
            this.configService.get<string>('app.env') === 'production'
              ? { rejectUnauthorized: false }
              : undefined,
        };
        
        this.client = new Redis(redisOptions);
      }

      this.client.on('connect', () => {
        this.logger.log('Redis connected successfully');
        this.isRedisAvailable = true;
      });
      
      this.client.on('error', (err) => {
        this.logger.warn(`Redis connection failed: ${err.message}. Cache operations will be disabled.`);
        this.isRedisAvailable = false;
      });

      this.client.on('close', () => {
        this.isRedisAvailable = false;
      });

      // Try to connect silently
      this.client.connect().catch((err) => {
        this.logger.warn(`Failed to connect to Redis: ${err.message}. Running without cache.`);
        this.isRedisAvailable = false;
      });
      
    } catch (error) {
      this.logger.warn(`Redis initialization failed: ${error.message}. Cache will be disabled.`);
      this.client = null;
      this.isRedisAvailable = false;
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    if (!this.client || !this.isRedisAvailable) {
      this.logger.debug(`Cache unavailable - skipping set operation for key: ${key}`);
      return;
    }

    try {
      const expiry =
        ttl || this.configService.get<number>('database.redis.ttl') || 3600;
      this.logger.debug(`Setting cache key: ${key} with TTL: ${expiry}`);
      await this.client.setex(key, expiry, JSON.stringify(value));
      this.logger.debug(`Successfully set cache key: ${key}`);
    } catch (error) {
      this.logger.warn(`Failed to set cache key ${key}: ${error.message}`);
    }
  }

  async get(key: string): Promise<any> {
    if (!this.client || !this.isRedisAvailable) {
      this.logger.debug(`Cache unavailable - skipping get operation for key: ${key}`);
      return null;
    }

    try {
      this.logger.debug(`Getting cache key: ${key}`);
      const value = await this.client.get(key);
      this.logger.debug(
        `Cache key ${key} result: ${value ? 'found' : 'not found'}`,
      );
      return value ? JSON.parse(value) : null;
    } catch (error) {
      this.logger.warn(`Failed to get cache key ${key}: ${error.message}`);
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.client || !this.isRedisAvailable) {
      this.logger.debug(`Cache unavailable - skipping delete operation for key: ${key}`);
      return;
    }

    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.warn(`Failed to delete cache key ${key}: ${error.message}`);
    }
  }

  // Lock mechanism to prevent duplicate transactions
  async lock(key: string, ttl: number): Promise<boolean> {
    if (!this.client || !this.isRedisAvailable) {
      this.logger.debug(`Cache unavailable - skipping lock operation for key: ${key}`);
      return false; // Return false as if lock failed
    }

    try {
      const result = await this.client.set(key, 'locked', 'EX', ttl, 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.warn(`Failed to acquire lock for key ${key}: ${error.message}`);
      return false;
    }
  }

  async unlock(key: string): Promise<void> {
    if (!this.client || !this.isRedisAvailable) {
      this.logger.debug(`Cache unavailable - skipping unlock operation for key: ${key}`);
      return;
    }

    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.warn(`Failed to unlock key ${key}: ${error.message}`);
    }
  }
}
