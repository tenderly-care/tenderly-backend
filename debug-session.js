const Redis = require('ioredis');

const redis = new Redis({
  host: 'localhost',
  port: 6379,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
});

async function debugSession() {
  try {
    console.log('🔍 Debugging session and payment data...\n');
    
    const sessionId = 'symptoms_68738db57e71f5951addafd5_1752649932269';
    const paymentId = 'mock_pay_1752650058712_k404q6wv9';
    
    // Check session keys
    console.log('📋 Checking session keys:');
    const sessionKeys = await redis.keys(`temp:${sessionId}*`);
    console.log('Session keys found:', sessionKeys);
    
    // Check payment keys
    console.log('\n💳 Checking payment keys:');
    const paymentKeys = await redis.keys(`payment:${sessionId}*`);
    console.log('Payment keys found:', paymentKeys);
    
    // Check all keys related to session
    console.log('\n🔑 All keys matching session:');
    const allSessionKeys = await redis.keys(`*${sessionId}*`);
    console.log('All session-related keys:', allSessionKeys);
    
    // Get actual data
    for (const key of allSessionKeys) {
      console.log(`\n📄 Data in ${key}:`);
      const data = await redis.get(key);
      try {
        console.log(JSON.stringify(JSON.parse(data), null, 2));
      } catch (e) {
        console.log(data);
      }
    }
    
    // Check payment data specifically
    console.log('\n💰 Payment data:');
    const paymentData = await redis.get(`payment:${sessionId}`);
    if (paymentData) {
      console.log('Payment data found:', JSON.stringify(JSON.parse(paymentData), null, 2));
    } else {
      console.log('No payment data found for session');
    }
    
    // Check if selection data exists
    console.log('\n🎯 Selection data:');
    const selectionData = await redis.get(`temp:${sessionId}_selection`);
    if (selectionData) {
      console.log('Selection data found:', JSON.stringify(JSON.parse(selectionData), null, 2));
    } else {
      console.log('No selection data found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await redis.quit();
  }
}

debugSession();
