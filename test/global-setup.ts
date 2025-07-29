import { MongoMemoryServer } from 'mongodb-memory-server';
import Redis from 'ioredis';

export default async function globalSetup() {
  console.log('🔧 Setting up test environment...');
  
  // Setup MongoDB Memory Server
  const mongoServer = MongoMemoryServer.create({
    instance: {
      port: 27017,
      dbName: 'tenderly-test',
    },
  });
  
  // Store the server instance globally
  (global as any).__MONGOSERVER__ = mongoServer;
  
  // Set the MongoDB URI for tests
  process.env.MONGODB_URI = (await mongoServer).getUri();
  
  // Setup Redis connection for tests
  try {
    const redis = new Redis({
      host: 'localhost',
      port: 6379,
      lazyConnect: true,
    });
    
    await redis.connect();
    
    // Clear any existing test data
    await redis.flushdb();
    
    redis.disconnect();
    
    console.log('✅ Redis connected and cleared for tests');
  } catch (error) {
    console.warn('⚠️  Redis connection failed, using memory cache for tests');
  }
  
  console.log('✅ Test environment setup complete');
}
