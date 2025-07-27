const Redis = require('ioredis');

const REDIS_CONFIG = {
  host: 'localhost',
  port: 6379,
  password: '',
  db: 0,
  keyPrefix: 'tenderly:',
};

async function checkSessionData() {
  const redis = new Redis(REDIS_CONFIG);
  
  try {
    console.log('🔍 Checking session data...\n');
    
    const sessionId = 'session_6884d739c1ceb202ca8066e8_1753536313472';
    const sessionKey = `session_manager:${sessionId}`;
    
    console.log('Looking for session key:', sessionKey);
    
    // Get session data
    const sessionData = await redis.get(sessionKey);
    
    if (sessionData) {
      console.log('✅ Session found!');
      const data = JSON.parse(sessionData);
      console.log('Session data:', JSON.stringify(data, null, 2));
      
      if (data.data && data.data.paymentDetails) {
        console.log('\n💳 Payment Details:');
        console.log('- Payment ID:', data.data.paymentDetails.paymentId);
        console.log('- Amount:', data.data.paymentDetails.amount);
        console.log('- Currency:', data.data.paymentDetails.currency);
      }
    } else {
      console.log('❌ Session not found');
      
      // List all session keys to see what's available
      console.log('\n🔍 Looking for similar keys...');
      const allKeys = await redis.keys('session_manager:*');
      console.log('Available session keys:', allKeys);
      
      // Also check the raw session keys
      const rawKeys = await redis.keys('session:*');
      console.log('Raw session keys:', rawKeys);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await redis.quit();
  }
}

checkSessionData();
