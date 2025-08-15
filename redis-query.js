const Redis = require('ioredis');

// Using your Railway Redis connection details
const redis = new Redis({
  host: 'redis-xjxw.railway.internal',
  port: 6379,
  password: 'cbRXoJuXmInteMIlihyaUUjiuOQAzYQX',
  db: 0,
});

async function queryUserSessions() {
  try {
    console.log('🔍 Connecting to Railway Redis...');
    await redis.ping();
    console.log('✅ Connected successfully!');

    // 1. Find all session keys
    console.log('\n📋 Looking for user sessions...');
    const sessionKeys = await redis.keys('tenderly:session:*');
    console.log(`Found ${sessionKeys.length} session(s)`);

    if (sessionKeys.length === 0) {
      console.log('❓ No active sessions found. This could mean:');
      console.log('   - User sessions have expired');
      console.log('   - Sessions are stored with a different key pattern');
      console.log('   - User hasn\'t logged in recently');
    }

    // 2. Show details of each session
    for (const key of sessionKeys) {
      console.log(`\n🔑 ${key}:`);
      const sessionData = await redis.get(key);
      if (sessionData) {
        const session = JSON.parse(sessionData);
        console.log(`   👤 User ID: ${session.userId}`);
        console.log(`   📅 Created: ${session.createdAt}`);
        console.log(`   🌐 IP: ${session.ipAddress}`);
        console.log(`   🖥️  Device: ${session.userAgent?.substring(0, 50)}...`);
      }
    }

    // 3. Check for other key types
    console.log('\n🔍 Checking for other key types...');
    const allKeys = await redis.keys('tenderly:*');
    console.log(`Total keys with 'tenderly:' prefix: ${allKeys.length}`);
    
    // Group keys by type
    const keyTypes = {};
    allKeys.forEach(key => {
      const type = key.split(':')[1] || 'unknown';
      keyTypes[type] = (keyTypes[type] || 0) + 1;
    });
    
    console.log('\n📊 Key types found:');
    Object.entries(keyTypes).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });

    // 4. Show some sample keys for each type
    if (allKeys.length > 0) {
      console.log('\n📝 Sample keys:');
      allKeys.slice(0, 10).forEach(key => {
        console.log(`   ${key}`);
      });
      if (allKeys.length > 10) {
        console.log(`   ... and ${allKeys.length - 10} more`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'ENOTFOUND') {
      console.error('💡 The Redis host might not be accessible from outside Railway\'s network');
      console.error('💡 Try running this script from within Railway or use Railway\'s Redis proxy');
    }
  } finally {
    await redis.quit();
    console.log('\n👋 Disconnected from Redis');
  }
}

// Run the query
queryUserSessions();
