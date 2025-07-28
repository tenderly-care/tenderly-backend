# Consultation Deletion Guide

## 🔥 **WARNING**: Always backup your database before performing bulk deletions!

## Method 1: Using API Endpoint (Production Safe - Soft Delete)

### Delete Single Consultation via API
```bash
# Get your JWT token first (if needed)
export JWT_TOKEN="your-jwt-token-here"

# Delete specific consultation (soft delete)
curl -X DELETE \
  "http://localhost:3000/api/v1/consultations/{consultationId}" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Note**: This performs a soft delete (sets status to `CANCELLED`) - data is preserved.

## Method 2: Direct MongoDB Commands

### Connect to MongoDB
```bash
# Connect to MongoDB
mongosh mongodb://localhost:27017/tenderly

# Or if using authentication
mongosh mongodb://username:password@localhost:27017/tenderly
```

### View Existing Consultations
```javascript
// Count total consultations
db.consultations.countDocuments()

// View all consultations (limited)
db.consultations.find().limit(5).pretty()

// View consultations by status
db.consultations.find({status: "completed"}).pretty()

// View consultations by patient
db.consultations.find({patientId: ObjectId("6884d6abc1ceb202ca8066c4")}).pretty()

// View consultations by date range
db.consultations.find({
  createdAt: {
    $gte: ISODate("2025-01-26T00:00:00Z"),
    $lte: ISODate("2025-01-27T23:59:59Z")
  }
}).pretty()
```

### Delete Single Consultation
```javascript
// Delete by consultation ID (hard delete)
db.consultations.deleteOne({_id: ObjectId("CONSULTATION_ID_HERE")})

// Delete by session ID
db.consultations.deleteOne({sessionId: ObjectId("SESSION_ID_HERE")})

// Soft delete - update status to cancelled
db.consultations.updateOne(
  {_id: ObjectId("CONSULTATION_ID_HERE")},
  {
    $set: {
      status: "cancelled",
      consultationEndTime: new Date(),
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: "admin"
    }
  }
)
```

### Delete Multiple Consultations
```javascript
// Delete all consultations for a specific patient (BE CAREFUL!)
db.consultations.deleteMany({patientId: ObjectId("PATIENT_ID_HERE")})

// Delete consultations by status
db.consultations.deleteMany({status: "pending"})

// Delete consultations by date range
db.consultations.deleteMany({
  createdAt: {
    $gte: ISODate("2025-01-26T00:00:00Z"),
    $lte: ISODate("2025-01-27T23:59:59Z")
  }
})

// Delete test consultations (if you have test data)
db.consultations.deleteMany({
  "paymentInfo.paymentId": {$regex: /^mock_pay_/}
})
```

### Delete All Consultations (Nuclear Option!)
```javascript
// ⚠️ DANGER: This deletes ALL consultations
db.consultations.deleteMany({})

// Verify deletion
db.consultations.countDocuments()
```

## Method 3: Node.js Script for Safe Deletion

Create a script file `delete-consultations.js`:

```javascript
const { MongoClient } = require('mongodb');

async function deleteConsultations() {
  const client = new MongoClient('mongodb://localhost:27017');
  
  try {
    await client.connect();
    const db = client.db('tenderly');
    const collection = db.collection('consultations');

    // Example: Delete test consultations
    const result = await collection.deleteMany({
      'paymentInfo.paymentId': { $regex: /^mock_pay_/ }
    });

    console.log(`Deleted ${result.deletedCount} test consultations`);

    // Example: Soft delete by status
    const softDeleteResult = await collection.updateMany(
      { status: 'pending' },
      {
        $set: {
          status: 'cancelled',
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: 'cleanup_script'
        }
      }
    );

    console.log(`Soft deleted ${softDeleteResult.modifiedCount} pending consultations`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

deleteConsultations();
```

Run the script:
```bash
node delete-consultations.js
```

## Method 4: HTTP Requests for Bulk Operations

### Create a bulk delete script using curl
```bash
#!/bin/bash
# bulk-delete-consultations.sh

JWT_TOKEN="your-jwt-token-here"
BASE_URL="http://localhost:3000/api/v1"

# Array of consultation IDs to delete
CONSULTATION_IDS=(
  "consultation_id_1"
  "consultation_id_2" 
  "consultation_id_3"
)

for id in "${CONSULTATION_IDS[@]}"; do
  echo "Deleting consultation: $id"
  curl -X DELETE \
    "$BASE_URL/consultations/$id" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -w "Status: %{http_code}\n"
  echo "---"
done
```

Make it executable and run:
```bash
chmod +x bulk-delete-consultations.sh
./bulk-delete-consultations.sh
```

## Method 5: Using MongoDB Compass (GUI)

1. Open MongoDB Compass
2. Connect to `mongodb://localhost:27017`
3. Navigate to `tenderly` → `consultations`
4. Use the filter to find consultations:
   ```json
   {status: "pending"}
   ```
5. Select documents and click "Delete Document(s)"

## Method 6: Cleanup Scripts for Development

### Create a development cleanup script
```bash
# cleanup-dev-data.sh

echo "🧹 Cleaning up development data..."

# Connect to MongoDB and clean up
mongosh mongodb://localhost:27017/tenderly --eval '
// Delete test consultations
var testResult = db.consultations.deleteMany({
  $or: [
    {"paymentInfo.paymentId": {$regex: /^mock_pay_/}},
    {"sessionId": {$regex: /^session_test_/}},
    {status: "pending"},
    {createdAt: {$gte: ISODate("2025-01-26T00:00:00Z")}}
  ]
});

print("Deleted " + testResult.deletedCount + " test consultations");

// Show remaining count
var remaining = db.consultations.countDocuments();
print("Remaining consultations: " + remaining);
'

echo "✅ Cleanup completed!"
```

Run the cleanup:
```bash
chmod +x cleanup-dev-data.sh
./cleanup-dev-data.sh
```

## Method 7: Find and Delete Specific Consultations

### Find consultations by various criteria
```bash
# Find consultations created today
mongosh mongodb://localhost:27017/tenderly --eval '
db.consultations.find({
  createdAt: {
    $gte: new Date(new Date().setHours(0,0,0,0)),
    $lt: new Date(new Date().setHours(23,59,59,999))
  }
}).forEach(doc => {
  print("ID: " + doc._id + ", Patient: " + doc.patientId + ", Status: " + doc.status);
});
'

# Delete those consultations
mongosh mongodb://localhost:27017/tenderly --eval '
var result = db.consultations.deleteMany({
  createdAt: {
    $gte: new Date(new Date().setHours(0,0,0,0)),
    $lt: new Date(new Date().setHours(23,59,59,999))
  }
});
print("Deleted " + result.deletedCount + " consultations from today");
'
```

## Safety Tips

1. **Always backup before bulk operations:**
   ```bash
   mongodump --db tenderly --collection consultations --out backup/
   ```

2. **Test with count first:**
   ```javascript
   // Count before deleting
   db.consultations.countDocuments({status: "pending"})
   
   // Then delete
   db.consultations.deleteMany({status: "pending"})
   ```

3. **Use soft delete for production:**
   ```javascript
   // Preferred for production
   db.consultations.updateMany(
     {status: "pending"},
     {$set: {isDeleted: true, deletedAt: new Date()}}
   )
   ```

4. **Restore from backup if needed:**
   ```bash
   mongorestore --db tenderly --collection consultations backup/tenderly/consultations.bson
   ```

## Quick Commands Summary

```bash
# View all consultations
mongosh mongodb://localhost:27017/tenderly --eval 'db.consultations.find().count()'

# Delete all test consultations  
mongosh mongodb://localhost:27017/tenderly --eval 'db.consultations.deleteMany({"paymentInfo.paymentId": {$regex: /^mock_pay_/}})'

# Delete consultations from today
mongosh mongodb://localhost:27017/tenderly --eval 'db.consultations.deleteMany({createdAt: {$gte: new Date(new Date().setHours(0,0,0,0))}})'

# Nuclear option - delete all consultations
mongosh mongodb://localhost:27017/tenderly --eval 'db.consultations.deleteMany({})'
```

Choose the method that best fits your needs and safety requirements!
