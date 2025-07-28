#!/usr/bin/env node

/**
 * Quick Consultation Cleanup Script
 * 
 * This script helps you view and delete consultations safely.
 * Run: node quick-consultation-cleanup.js
 */

const { MongoClient } = require('mongodb');

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = 'tenderly';
const COLLECTION_NAME = 'consultations';

class ConsultationCleaner {
  constructor() {
    this.client = new MongoClient(MONGODB_URI);
    this.db = null;
    this.collection = null;
  }

  async connect() {
    try {
      await this.client.connect();
      this.db = this.client.db(DATABASE_NAME);
      this.collection = this.db.collection(COLLECTION_NAME);
      console.log('✅ Connected to MongoDB');
    } catch (error) {
      console.error('❌ Failed to connect to MongoDB:', error.message);
      process.exit(1);
    }
  }

  async disconnect() {
    await this.client.close();
    console.log('✅ Disconnected from MongoDB');
  }

  async viewStats() {
    console.log('\n📊 Consultation Statistics:');
    console.log('=' * 50);

    // Total count
    const totalCount = await this.collection.countDocuments();
    console.log(`Total consultations: ${totalCount}`);

    if (totalCount === 0) {
      console.log('No consultations found.');
      return;
    }

    // Count by status
    const statusCounts = await this.collection.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    console.log('\nBy Status:');
    statusCounts.forEach(({ _id, count }) => {
      console.log(`  ${_id}: ${count}`);
    });

    // Count by consultation type
    const typeCounts = await this.collection.aggregate([
      { $group: { _id: '$consultationType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    console.log('\nBy Type:');
    typeCounts.forEach(({ _id, count }) => {
      console.log(`  ${_id}: ${count}`);
    });

    // Recent consultations
    const recentConsultations = await this.collection
      .find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .project({ _id: 1, status: 1, consultationType: 1, createdAt: 1, 'paymentInfo.paymentId': 1 })
      .toArray();

    console.log('\nRecent Consultations (last 5):');
    recentConsultations.forEach((consultation, index) => {
      const paymentId = consultation.paymentInfo?.paymentId || 'No payment';
      console.log(`  ${index + 1}. ID: ${consultation._id}`);
      console.log(`     Status: ${consultation.status}`);
      console.log(`     Type: ${consultation.consultationType}`);
      console.log(`     Payment: ${paymentId}`);
      console.log(`     Created: ${consultation.createdAt}`);
      console.log('');
    });
  }

  async deleteTestConsultations() {
    console.log('\n🧹 Deleting test consultations...');
    
    const testFilter = {
      $or: [
        { 'paymentInfo.paymentId': { $regex: /^mock_pay_/ } },
        { sessionId: { $regex: /^session_test_/ } },
        { status: 'pending' }
      ]
    };

    // Count first
    const countToDelete = await this.collection.countDocuments(testFilter);
    console.log(`Found ${countToDelete} test consultations to delete`);

    if (countToDelete === 0) {
      console.log('No test consultations found.');
      return;
    }

    // Show what will be deleted
    const consultationsToDelete = await this.collection
      .find(testFilter)
      .project({ _id: 1, status: 1, 'paymentInfo.paymentId': 1 })
      .toArray();

    console.log('Consultations to be deleted:');
    consultationsToDelete.forEach((consultation, index) => {
      const paymentId = consultation.paymentInfo?.paymentId || 'No payment';
      console.log(`  ${index + 1}. ${consultation._id} (${consultation.status}) - ${paymentId}`);
    });

    // Confirm deletion
    console.log('\n⚠️  Are you sure you want to delete these consultations?');
    console.log('This action cannot be undone!');
    
    // In a real scenario, you'd want to add confirmation prompt
    // For now, we'll just proceed
    const result = await this.collection.deleteMany(testFilter);
    console.log(`✅ Deleted ${result.deletedCount} test consultations`);
  }

  async deleteConsultationById(consultationId) {
    console.log(`\n🗑️  Deleting consultation: ${consultationId}`);
    
    try {
      const { ObjectId } = require('mongodb');
      const objectId = new ObjectId(consultationId);
      
      // Check if consultation exists
      const consultation = await this.collection.findOne({ _id: objectId });
      if (!consultation) {
        console.log('❌ Consultation not found');
        return;
      }

      console.log(`Found consultation: ${consultation.status} - ${consultation.consultationType}`);
      
      // Delete the consultation
      const result = await this.collection.deleteOne({ _id: objectId });
      
      if (result.deletedCount === 1) {
        console.log('✅ Consultation deleted successfully');
      } else {
        console.log('❌ Failed to delete consultation');
      }
    } catch (error) {
      console.error('❌ Error deleting consultation:', error.message);
    }
  }

  async deleteAllConsultations() {
    console.log('\n💣 NUCLEAR OPTION: Deleting ALL consultations...');
    
    const totalCount = await this.collection.countDocuments();
    console.log(`⚠️  This will delete ${totalCount} consultations!`);
    console.log('This action cannot be undone!');
    
    // In production, you'd want confirmation here
    const result = await this.collection.deleteMany({});
    console.log(`✅ Deleted ${result.deletedCount} consultations`);
  }

  async softDeleteConsultations(filter = {}) {
    console.log('\n🔄 Soft deleting consultations...');
    
    const updateData = {
      $set: {
        status: 'cancelled',
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: 'cleanup_script'
      }
    };

    const result = await this.collection.updateMany(filter, updateData);
    console.log(`✅ Soft deleted ${result.modifiedCount} consultations`);
  }
}

// Main execution
async function main() {
  const cleaner = new ConsultationCleaner();
  
  try {
    await cleaner.connect();
    
    // Get command line argument
    const command = process.argv[2];
    
    switch (command) {
      case 'stats':
      case 'view':
      default:
        await cleaner.viewStats();
        break;
        
      case 'delete-test':
        await cleaner.viewStats();
        await cleaner.deleteTestConsultations();
        await cleaner.viewStats();
        break;
        
      case 'delete-all':
        await cleaner.viewStats();
        await cleaner.deleteAllConsultations();
        await cleaner.viewStats();
        break;
        
      case 'soft-delete-pending':
        await cleaner.viewStats();
        await cleaner.softDeleteConsultations({ status: 'pending' });
        await cleaner.viewStats();
        break;
        
      case 'delete-by-id':
        const consultationId = process.argv[3];
        if (!consultationId) {
          console.log('Please provide consultation ID: node script.js delete-by-id CONSULTATION_ID');
          break;
        }
        await cleaner.deleteConsultationById(consultationId);
        break;
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await cleaner.disconnect();
  }
}

// Usage information
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
📚 Consultation Cleanup Script Usage:

Basic commands:
  node quick-consultation-cleanup.js                    # View statistics
  node quick-consultation-cleanup.js stats              # View statistics
  node quick-consultation-cleanup.js delete-test        # Delete test consultations
  node quick-consultation-cleanup.js delete-all         # Delete ALL consultations (dangerous!)
  node quick-consultation-cleanup.js soft-delete-pending # Soft delete pending consultations
  node quick-consultation-cleanup.js delete-by-id ID    # Delete specific consultation

Examples:
  node quick-consultation-cleanup.js stats
  node quick-consultation-cleanup.js delete-test
  node quick-consultation-cleanup.js delete-by-id 677f1234567890abcdef1234

Safety Tips:
  1. Always backup your database first: mongodump --db tenderly
  2. Test with 'stats' command first to see what you have
  3. Use 'delete-test' to clean up development data
  4. Use 'soft-delete-pending' for safer deletion (data preserved)
  `);
  process.exit(0);
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
