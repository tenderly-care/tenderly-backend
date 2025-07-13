# Database Commands Quick Reference

## 🚀 **Easy-to-Use Database Admin Script**

I've created a comprehensive database admin script for you. Use it like this:

```bash
# Make the script executable
chmod +x scripts/db-admin.js

# Show database statistics
node scripts/db-admin.js stats

# List all users
node scripts/db-admin.js list-users

# List only active users
node scripts/db-admin.js list-users active

# Delete a specific user
node scripts/db-admin.js delete-user john.doe@example.com

# Clean up test data
node scripts/db-admin.js cleanup-test

# Show recent audit logs
node scripts/db-admin.js audit-logs 20

# Show Redis keys
node scripts/db-admin.js redis-keys

# Clean up Redis sessions
node scripts/db-admin.js cleanup-redis "tenderly:session:*"
```

## 📊 **Direct MongoDB Commands**

### Connect to MongoDB
```bash
mongosh mongodb://localhost:27017/tenderly
```

### View Your Current Data
```javascript
// Show all users (basic info)
db.users.find({}, {firstName: 1, lastName: 1, email: 1, roles: 1, accountStatus: 1})

// Count users by status
db.users.countDocuments({accountStatus: "active"})
db.users.countDocuments({accountStatus: "pending_verification"})

// Find users by role
db.users.find({roles: "healthcare_provider"})
db.users.find({roles: "patient"})

// Show recent audit logs
db.auditlogs.find({}).sort({timestamp: -1}).limit(10)
```

### Delete Users
```javascript
// Delete specific user
db.users.deleteOne({email: "john.doe.test@example.com"})

// Delete all test users
db.users.deleteMany({email: /\.test@/})

// Delete all users with example.com
db.users.deleteMany({email: /example\.com$/})

// Delete pending verification users
db.users.deleteMany({accountStatus: "pending_verification"})
```

### Database Maintenance
```javascript
// Show database stats
db.stats()

// Show collection stats
db.users.stats()
db.auditlogs.stats()

// Clean up old audit logs (older than 30 days)
db.auditlogs.deleteMany({
  timestamp: {$lt: new Date(Date.now() - 30*24*60*60*1000)}
})
```

## 🔑 **Direct Redis Commands**

### Connect to Redis
```bash
redis-cli
```

### View Your Current Data
```bash
# Show all tenderly keys
KEYS tenderly:*

# Show session keys
KEYS tenderly:session:*

# Show email verification keys
KEYS tenderly:email_verification:*

# Get key details
TYPE tenderly:session:abc123
TTL tenderly:session:abc123
GET tenderly:session:abc123
```

### Clean Up Redis Data
```bash
# Delete all sessions
redis-cli DEL $(redis-cli --raw KEYS "tenderly:session:*")

# Delete all email verification tokens
redis-cli DEL $(redis-cli --raw KEYS "tenderly:email_verification:*")

# Delete all tenderly keys
redis-cli DEL $(redis-cli --raw KEYS "tenderly:*")
```

### Redis Statistics
```bash
# Show Redis info
redis-cli INFO

# Show memory usage
redis-cli INFO memory

# Show connected clients
redis-cli INFO clients
```

## 🎯 **Common Tasks Based on Your Current Data**

### 1. **View Current Users (You have 19 users)**
```bash
node scripts/db-admin.js list-users
```

### 2. **Clean Up Test Data**
```bash
node scripts/db-admin.js cleanup-test
```

### 3. **Check Recent Activity**
```bash
node scripts/db-admin.js audit-logs 20
```

### 4. **View Redis Sessions (You have 17 sessions)**
```bash
node scripts/db-admin.js redis-keys "tenderly:session:*"
```

### 5. **Complete Database Overview**
```bash
node scripts/db-admin.js stats
```

## 🔧 **Advanced MongoDB Queries**

### User Analysis
```javascript
// Count users by role
db.users.aggregate([
  {$unwind: "$roles"},
  {$group: {_id: "$roles", count: {$sum: 1}}}
])

// Find users with failed login attempts
db.users.find({failedLoginAttempts: {$gt: 0}})

// Find users with multiple sessions
db.users.find({"activeSessions.1": {$exists: true}})

// Check MFA status
db.users.find({}, {email: 1, isMFAEnabled: 1, accountStatus: 1})
```

### Audit Log Analysis
```javascript
// Authentication failures in last 24 hours
db.auditlogs.find({
  category: "authentication",
  success: false,
  timestamp: {$gte: new Date(Date.now() - 24*60*60*1000)}
})

// Most active users
db.auditlogs.aggregate([
  {$group: {_id: "$userId", count: {$sum: 1}}},
  {$sort: {count: -1}},
  {$limit: 10}
])
```

## 🧹 **Database Cleanup Scripts**

### 1. **Remove All Test Data**
```javascript
// In MongoDB shell
db.users.deleteMany({
  $or: [
    {email: /\.test@/},
    {email: /example\.com$/},
    {accountStatus: "pending_verification"}
  ]
})
```

### 2. **Clean Old Audit Logs**
```javascript
// Keep only last 90 days
db.auditlogs.deleteMany({
  timestamp: {$lt: new Date(Date.now() - 90*24*60*60*1000)}
})
```

### 3. **Reset Redis Cache**
```bash
redis-cli FLUSHDB
```

## 📋 **Daily Maintenance Commands**

### Morning Check
```bash
# Check database health
node scripts/db-admin.js stats

# Check for failed logins
node scripts/db-admin.js audit-logs 50
```

### Weekly Cleanup
```bash
# Clean up test data
node scripts/db-admin.js cleanup-test

# Clean up expired sessions
node scripts/db-admin.js cleanup-redis "tenderly:session:*"
```

## 🚨 **Emergency Commands**

### If Database is Full
```javascript
// Check largest collections
db.stats()
db.users.stats()
db.auditlogs.stats()

// Remove old audit logs
db.auditlogs.deleteMany({
  timestamp: {$lt: new Date(Date.now() - 30*24*60*60*1000)}
})
```

### If Redis is Full
```bash
# Check memory usage
redis-cli INFO memory

# Clear expired keys
redis-cli DEL $(redis-cli --raw KEYS "tenderly:email_verification:*")
redis-cli DEL $(redis-cli --raw KEYS "tenderly:session:*")
```

## 📊 **Monitoring Commands**

### Database Performance
```javascript
// Check slow operations
db.currentOp()

// Check index usage
db.users.getIndexes()
db.users.aggregate([{$indexStats: {}}])
```

### Redis Performance
```bash
# Monitor commands
redis-cli MONITOR

# Check slow queries
redis-cli SLOWLOG GET 10
```

---

**💡 Tip**: Use the `scripts/db-admin.js` script for most tasks - it's safer and provides better output formatting than raw database commands.

**⚠️ Warning**: Always backup your database before running delete operations in production!
