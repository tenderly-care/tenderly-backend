import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

@Injectable()
export class CacheService {
  private logger = new Logger('CacheService');
  private readonly client: Redis;

  constructor(private configService: ConfigService) {
    const redisOptions: RedisOptions = {
      host: this.configService.get<string>('database.redis.host'),
      port: this.configService.get<number>('database.redis.port'),
      password: this.configService.get<string>('database.redis.password'),
      db: this.configService.get<number>('database.redis.db'),
      keyPrefix: this.configService.get<string>('database.redis.keyPrefix'),
      // Additional performance optimizations
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      maxLoadingRetryTime: 5000,
      showFriendlyErrorStack: true,
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          // Only reconnect when the error contains "READONLY"
          return true; // or you can send to your logging service
        }
        return false;
      },
      // Enable TLS for secure connections in production
      tls: this.configService.get<string>('app.env') === 'production'
        ? { rejectUnauthorized: false } : undefined,
    };

    this.client = new Redis(redisOptions);

    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('error', (err) => this.logger.error('Redis error:', err));
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    const expiry = ttl || this.configService.get<number>('database.redis.ttl') || 3600;
    this.logger.debug(`Setting cache key: ${key} with TTL: ${expiry}`);
    await this.client.setex(key, expiry, JSON.stringify(value));
    this.logger.debug(`Successfully set cache key: ${key}`);
  }

  async get(key: string): Promise<any> {
    this.logger.debug(`Getting cache key: ${key}`);
    const value = await this.client.get(key);
    this.logger.debug(`Cache key ${key} result: ${value ? 'found' : 'not found'}`);
    return value ? JSON.parse(value) : null;
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  // Lock mechanism to prevent duplicate transactions
  async lock(key: string, ttl: number): Promise<boolean> {
    const result = await this.client.set(key, 'locked', 'EX', ttl, 'NX');
    return result === 'OK';
  }

  async unlock(key: string): Promise<void> {
    await this.client.del(key);
  }
}

