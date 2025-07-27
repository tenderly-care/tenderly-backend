const mongoose = require('mongoose');

async function testDatabaseConnection() {
  try {
    console.log('🔍 Testing database connection...');
    
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/tenderly', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
    
    // Test basic operations
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log('📋 Available collections:', collections.map(c => c.name));
    
    // Test consultations collection
    const consultationsCount = await db.collection('consultations').countDocuments();
    console.log('📊 Total consultations:', consultationsCount);
    
    // Test creating a simple document
    const testDoc = {
      patientId: new mongoose.Types.ObjectId('6884d6abc1ceb202ca8066c4'),
      session_id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
      consultationType: 'chat',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    console.log('📝 Inserting test document...');
    const result = await db.collection('consultations').insertOne(testDoc);
    console.log('✅ Test document inserted:', result.insertedId);
    
    // Clean up
    await db.collection('consultations').deleteOne({ _id: result.insertedId });
    console.log('🧹 Test document cleaned up');
    
    await mongoose.disconnect();
    console.log('✅ Database connection test completed successfully');
    
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    console.error('Error stack:', error.stack);
  }
}

testDatabaseConnection(); 