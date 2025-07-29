const mongoose = require('mongoose');

const deleteAllConsultations = async () => {
  try {
    console.log('🗑️ Deleting all consultations...');
    
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/tenderly', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to MongoDB');

    // Get the consultations collection
    const db = mongoose.connection.db;
    const consultationsCollection = db.collection('consultations');

    // Count consultations before deletion
    const countBefore = await consultationsCollection.countDocuments();
    console.log(`📊 Found ${countBefore} consultations to delete`);

    if (countBefore === 0) {
      console.log('ℹ️ No consultations found to delete');
      return;
    }

    // Delete all consultations
    const result = await consultationsCollection.deleteMany({});
    
    console.log(`✅ Successfully deleted ${result.deletedCount} consultations`);
    
    // Verify deletion
    const countAfter = await consultationsCollection.countDocuments();
    console.log(`📊 Remaining consultations: ${countAfter}`);

    // Also clear Redis cache if needed
    console.log('🧹 Clearing Redis cache...');
    const redis = require('redis');
    const client = redis.createClient({
      host: 'localhost',
      port: 6379
    });
    
    await client.connect();
    const keys = await client.keys('consultation:*');
    if (keys.length > 0) {
      await client.del(keys);
      console.log(`✅ Cleared ${keys.length} Redis cache entries`);
    } else {
      console.log('ℹ️ No Redis cache entries found');
    }
    
    await client.disconnect();

  } catch (error) {
    console.error('❌ Error deleting consultations:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

deleteAllConsultations(); 