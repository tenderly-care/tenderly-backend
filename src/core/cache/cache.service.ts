import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

@Injectable()
export class CacheService {
  private logger = new Logger('CacheService');
  private readonly client: Redis | null;
  private isRedisAvailable: boolean = false;

  constructor(private configService: ConfigService) {
    const redisHost = this.configService.get<string>('database.redis.host');
    
    // Skip Redis initialization if host is not configured or disabled
    if (!redisHost || redisHost === 'disabled' || redisHost === '') {
      this.logger.log('Redis disabled - running without cache');
      this.client = null;
      this.isRedisAvailable = false;
      return;
    }
    
    try {
      const redisOptions: RedisOptions = {
        host: redisHost,
        port: this.configService.get<number>('database.redis.port'),
        password: this.configService.get<string>('database.redis.password'),
        db: this.configService.get<number>('database.redis.db'),
        keyPrefix: this.configService.get<string>('database.redis.keyPrefix'),
        // Reduce timeouts and retries to fail faster
        maxRetriesPerRequest: 1,
        connectTimeout: 5000,
        maxLoadingRetryTime: 3000,
        lazyConnect: true, // Don't connect immediately
        showFriendlyErrorStack: false, // Reduce noise
        reconnectOnError: () => false, // Don't auto-reconnect on errors
        // Enable TLS for secure connections in production
        tls:
          this.configService.get<string>('app.env') === 'production'
            ? { rejectUnauthorized: false }
            : undefined,
      };

      this.client = new Redis(redisOptions);

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
