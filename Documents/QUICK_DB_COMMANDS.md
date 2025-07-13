# Quick Database Commands - Tenderly Backend

## 🎯 **Based on Your Current Data**

**Your Current Database Status:**
- **19 users** (5 active, 9 pending verification, 5 healthcare providers)
- **61 audit logs** (all from last 24 hours)
- **29 Redis keys** (16 sessions, 13 email verifications)

## 🚀 **Most Common Commands You'll Use**

### 1. **View Database Overview**
```bash
node scripts/db-admin.js stats
```

### 2. **See All Users**
```bash
node scripts/db-admin.js list-users
```

### 3. **See Only Active Users**
```bash
node scripts/db-admin.js list-users active
```

### 4. **See Only Healthcare Providers**
```bash
node scripts/db-admin.js list-users healthcare
```

### 5. **Clean Up Test Data**
```bash
node scripts/db-admin.js cleanup-test
```

### 6. **Delete Specific User**
```bash
node scripts/db-admin.js delete-user john.doe.test@example.com
```

### 7. **View Recent Login Activity**
```bash
node scripts/db-admin.js audit-logs 20
```

### 8. **Check Redis Sessions**
```bash
node scripts/db-admin.js redis-keys "tenderly:session:*"
```

### 9. **Clean Expired Sessions**
```bash
node scripts/db-admin.js cleanup-redis "tenderly:session:*"
```

### 10. **Clean Email Verification Tokens**
```bash
node scripts/db-admin.js cleanup-redis "tenderly:email_verification:*"
```

## 📊 **Direct MongoDB Commands**

### Connect and Basic Operations
```bash
# Connect to your database
mongosh mongodb://localhost:27017/tenderly

# Once connected, run these:
```

```javascript
// Show all users with key info
db.users.find({}, {firstName: 1, lastName: 1, email: 1, roles: 1, accountStatus: 1})

// Count users by status
db.users.countDocuments({accountStatus: "active"})           // Should show 5
db.users.countDocuments({accountStatus: "pending_verification"}) // Should show 9

// Find healthcare providers
db.users.find({roles: "healthcare_provider"})

// Show recent audit logs
db.auditlogs.find({}).sort({timestamp: -1}).limit(10)
```

### Delete Operations
```javascript
// Delete specific user
db.users.deleteOne({email: "john.doe.test@example.com"})

// Delete all test users (with .test in email)
db.users.deleteMany({email: /\.test@/})

// Delete all pending verification users
db.users.deleteMany({accountStatus: "pending_verification"})

// Delete all example.com users
db.users.deleteMany({email: /example\.com$/})
```

## 🔑 **Direct Redis Commands**

### Connect and View Data
```bash
# Connect to Redis
redis-cli

# Show your app's keys
KEYS tenderly:*

# Show only sessions (you have 16)
KEYS tenderly:session:*

# Show email verification tokens (you have 13)
KEYS tenderly:email_verification:*

# Get session details
GET tenderly:session:YOUR_SESSION_ID

# Check TTL
TTL tenderly:session:YOUR_SESSION_ID
```

### Clean Up Redis
```bash
# Delete all sessions
redis-cli DEL $(redis-cli --raw KEYS "tenderly:session:*")

# Delete all email verification tokens
redis-cli DEL $(redis-cli --raw KEYS "tenderly:email_verification:*")

# Delete all your app's keys
redis-cli DEL $(redis-cli --raw KEYS "tenderly:*")
```

## 🧹 **Clean Up Your Test Data**

### Remove All Test Users
```bash
# Using the admin script (RECOMMENDED)
node scripts/db-admin.js cleanup-test

# Or manually in MongoDB
mongosh mongodb://localhost:27017/tenderly
```

```javascript
// Remove test users
db.users.deleteMany({
  $or: [
    {email: /\.test@/},
    {email: /example\.com$/},
    {accountStatus: "pending_verification"}
  ]
})

// Clean up related audit logs
db.auditlogs.deleteMany({
  timestamp: {$lt: new Date(Date.now() - 24*60*60*1000)}
})
```

### Clean Redis Cache
```bash
# Clear all email verification tokens
redis-cli DEL $(redis-cli --raw KEYS "tenderly:email_verification:*")

# Clear all sessions
redis-cli DEL $(redis-cli --raw KEYS "tenderly:session:*")
```

## 📋 **Production-Ready Commands**

### Health Check
```bash
# Quick health check
node scripts/db-admin.js stats

# Check for failed logins
node scripts/db-admin.js audit-logs 50 | grep "❌"
```

### User Management
```bash
# List healthcare providers
node scripts/db-admin.js list-users healthcare

# Check users needing MFA setup
mongosh --eval "db.users.find({accountStatus: 'pending_mfa_setup'}, {email: 1, roles: 1})"

# Find locked accounts
mongosh --eval "db.users.find({accountLockedUntil: {\$exists: true}}, {email: 1, accountLockedUntil: 1})"
```

### Maintenance
```bash
# Weekly cleanup
node scripts/db-admin.js cleanup-test
node scripts/db-admin.js cleanup-redis "tenderly:email_verification:*"

# Database stats
mongosh --eval "db.stats(); db.users.stats(); db.auditlogs.stats();"
```

## 🚨 **Emergency Commands**

### Database Issues
```javascript
// Check database size
db.stats()

// Find large collections
db.users.stats()
db.auditlogs.stats()

// Remove old audit logs if space is needed
db.auditlogs.deleteMany({
  timestamp: {$lt: new Date(Date.now() - 30*24*60*60*1000)}
})
```

### Redis Issues
```bash
# Check memory usage
redis-cli INFO memory

# Clear cache if needed
redis-cli FLUSHDB

# Reset stats
redis-cli CONFIG RESETSTAT
```

## 📊 **Monitoring Commands**

### Daily Monitoring
```bash
# Check overall health
node scripts/db-admin.js stats

# Check authentication issues
node scripts/db-admin.js audit-logs 100 | grep "authentication"

# Check Redis memory
redis-cli INFO memory | grep used_memory_human
```

### Weekly Reports
```bash
# User growth
mongosh --eval "
db.users.aggregate([
  {\$group: {_id: {\$dateToString: {format: '%Y-%m-%d', date: '\$createdAt'}}, count: {\$sum: 1}}},
  {\$sort: {_id: 1}}
])
"

# Authentication stats
mongosh --eval "
db.auditlogs.aggregate([
  {\$match: {category: 'authentication'}},
  {\$group: {_id: '\$success', count: {\$sum: 1}}}
])
"
```

---

**💡 Pro Tips:**
1. Always use `node scripts/db-admin.js` for safer operations
2. Test delete operations with `find()` before using `deleteMany()`
3. Keep regular backups before major cleanup operations
4. Monitor Redis memory usage regularly
