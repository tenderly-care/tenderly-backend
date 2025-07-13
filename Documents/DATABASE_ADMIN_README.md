# Database Administration Guide - Tenderly Backend

## Overview

This guide provides comprehensive instructions for managing the MongoDB and Redis databases used by the Tenderly telemedicine platform backend. The system uses MongoDB for persistent data storage and Redis for caching and session management.

## Table of Contents

1. [Database Architecture](#database-architecture)
2. [Environment Setup](#environment-setup)
3. [MongoDB Administration](#mongodb-administration)
4. [Redis Administration](#redis-administration)
5. [Data Migration](#data-migration)
6. [Backup and Recovery](#backup-and-recovery)
7. [Performance Monitoring](#performance-monitoring)
8. [Security Management](#security-management)
9. [Troubleshooting](#troubleshooting)
10. [Production Considerations](#production-considerations)

## Database Architecture

### MongoDB
- **Primary Database**: User accounts, medical records, consultations, prescriptions
- **Collections**: Users, AuditLogs, Sessions, Consultations, Prescriptions, etc.
- **Indexes**: Optimized for authentication, user lookup, and audit queries
- **Security**: Field-level encryption for sensitive data (PII, medical records)

### Redis
- **Cache Layer**: Session storage, rate limiting, temporary data
- **Key Prefix**: `tenderly:` for namespace isolation
- **TTL**: Configured per data type (default 3600 seconds)
- **Use Cases**: JWT tokens, OTP storage, rate limiting counters

## Environment Setup

### Development Environment
```bash
# MongoDB (using Homebrew on macOS)
brew install mongodb-community@7.0
brew services start mongodb-community@7.0

# Redis
brew install redis
brew services start redis

# Verify installations
mongo --version
redis-cli ping
```

### Production Environment
```bash
# MongoDB with authentication
mongod --auth --dbpath /data/db --logpath /var/log/mongodb/mongod.log --fork

# Redis with authentication
redis-server --requirepass your-redis-password --save 900 1 --save 300 10
```

## MongoDB Administration

### Connection Management

#### Local Development
```bash
# Connect to MongoDB
mongosh mongodb://localhost:27017/tenderly

# Show databases
show dbs

# Use tenderly database
use tenderly

# Show collections
show collections
```

#### Production
```bash
# Connect with authentication
mongosh mongodb://username:password@host:port/tenderly?authSource=admin

# Connection with SSL
mongosh mongodb://username:password@host:port/tenderly?ssl=true&authSource=admin
```

### Database Operations

#### User Management
```javascript
// Create admin user
db.createUser({
  user: "admin",
  pwd: "secure-password",
  roles: [
    { role: "dbAdmin", db: "tenderly" },
    { role: "readWrite", db: "tenderly" }
  ]
});

// Create read-only user for monitoring
db.createUser({
  user: "monitor",
  pwd: "monitor-password",
  roles: [{ role: "read", db: "tenderly" }]
});

// List users
db.getUsers();

// Drop user
db.dropUser("username");
```

#### Index Management
```javascript
// List all indexes
db.users.getIndexes();

// Create custom index
db.users.createIndex({ "email": 1 }, { unique: true });

// Create compound index
db.users.createIndex({ "roles": 1, "accountStatus": 1 });

// Create TTL index for temporary data
db.sessions.createIndex({ "expiresAt": 1 }, { expireAfterSeconds: 0 });

// Drop index
db.users.dropIndex("email_1");

// Rebuild indexes
db.users.reIndex();
```

#### Data Queries and Analysis
```javascript
// Count users by role
db.users.aggregate([
  { $unwind: "$roles" },
  { $group: { _id: "$roles", count: { $sum: 1 } } }
]);

// Find users with failed login attempts
db.users.find({ "failedLoginAttempts": { $gt: 0 } });

// Find users requiring MFA setup
db.users.find({ "accountStatus": "pending_mfa_setup" });

// Audit log analysis
db.auditlogs.find({
  "category": "authentication",
  "success": false,
  "timestamp": { $gte: new Date(Date.now() - 24*60*60*1000) }
});

// Find users with multiple active sessions
db.users.find({ "activeSessions.1": { $exists: true } });
```

#### Data Maintenance
```javascript
// Clean up expired sessions
db.users.updateMany(
  {},
  { $pull: { "activeSessions": { "lastActivity": { $lt: new Date(Date.now() - 24*60*60*1000) } } } }
);

// Remove old login history (keep last 50)
db.users.updateMany(
  { "loginHistory.50": { $exists: true } },
  { $push: { "loginHistory": { $each: [], $slice: -50 } } }
);

// Archive old audit logs
db.auditlogs.updateMany(
  { "timestamp": { $lt: new Date(Date.now() - 365*24*60*60*1000) } },
  { $set: { "isArchived": true } }
);
```

### Database Statistics
```javascript
// Database stats
db.stats();

// Collection stats
db.users.stats();

// Index usage stats
db.users.aggregate([{ $indexStats: {} }]);

// Current operations
db.currentOp();

// Server status
db.serverStatus();
```

## Redis Administration

### Connection Management
```bash
# Connect to Redis
redis-cli

# Connect with password
redis-cli -a your-redis-password

# Connect to specific database
redis-cli -n 1

# Connect to remote Redis
redis-cli -h hostname -p port -a password
```

### Key Management
```bash
# List all keys (use with caution in production)
KEYS tenderly:*

# Find keys by pattern
KEYS tenderly:user:*
KEYS tenderly:session:*

# Get key information
TYPE tenderly:user:12345
TTL tenderly:user:12345
PTTL tenderly:user:12345

# Delete keys
DEL tenderly:user:12345
DEL tenderly:session:abc123

# Flush database (DANGEROUS!)
FLUSHDB

# Flush all databases (VERY DANGEROUS!)
FLUSHALL
```

### Cache Management
```bash
# Get cache statistics
INFO stats

# Monitor real-time commands
MONITOR

# Get memory usage
MEMORY USAGE tenderly:user:12345
INFO memory

# Get slow queries
SLOWLOG GET 10
```

### Session Management
```bash
# List active sessions
KEYS tenderly:session:*

# Check session data
GET tenderly:session:abc123

# Remove expired sessions
# (Redis handles this automatically with TTL)

# Check rate limiting
GET tenderly:ratelimit:192.168.1.100
```

## Data Migration

### MongoDB Migration Scripts
```javascript
// Migration script template
// File: migrations/001_add_new_field.js

const migration = {
  up: async (db) => {
    // Add new field to users
    await db.collection('users').updateMany(
      {},
      { $set: { "newField": "defaultValue" } }
    );
    
    // Create new index
    await db.collection('users').createIndex({ "newField": 1 });
  },
  
  down: async (db) => {
    // Remove field
    await db.collection('users').updateMany(
      {},
      { $unset: { "newField": "" } }
    );
    
    // Drop index
    await db.collection('users').dropIndex("newField_1");
  }
};
```

### Running Migrations
```bash
# Create migration runner script
# File: scripts/migrate.js

const { MongoClient } = require('mongodb');

async function runMigration(migrationFile) {
  const client = await MongoClient.connect(process.env.MONGODB_URI);
  const db = client.db();
  
  const migration = require(migrationFile);
  await migration.up(db);
  
  await client.close();
}

// Usage
node scripts/migrate.js migrations/001_add_new_field.js
```

## Backup and Recovery

### MongoDB Backup
```bash
# Full database backup
mongodump --uri="mongodb://localhost:27017/tenderly" --out=/backup/$(date +%Y%m%d_%H%M%S)

# Backup specific collection
mongodump --uri="mongodb://localhost:27017/tenderly" --collection=users --out=/backup/users_$(date +%Y%m%d_%H%M%S)

# Backup with compression
mongodump --uri="mongodb://localhost:27017/tenderly" --gzip --out=/backup/compressed_$(date +%Y%m%d_%H%M%S)

# Backup with query filter
mongodump --uri="mongodb://localhost:27017/tenderly" --collection=users --query='{"roles": "healthcare_provider"}' --out=/backup/healthcare_providers
```

### MongoDB Restore
```bash
# Restore full database
mongorestore --uri="mongodb://localhost:27017/tenderly" /backup/20240101_120000/tenderly

# Restore specific collection
mongorestore --uri="mongodb://localhost:27017/tenderly" --collection=users /backup/users_20240101_120000/tenderly/users.bson

# Restore with drop (replace existing data)
mongorestore --uri="mongodb://localhost:27017/tenderly" --drop /backup/20240101_120000/tenderly
```

### Redis Backup
```bash
# Save current state
redis-cli SAVE

# Background save
redis-cli BGSAVE

# Get last save time
redis-cli LASTSAVE

# Copy RDB file
cp /var/lib/redis/dump.rdb /backup/redis_$(date +%Y%m%d_%H%M%S).rdb
```

### Automated Backup Script
```bash
#!/bin/bash
# File: scripts/backup.sh

BACKUP_DIR="/backup/tenderly"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p "$BACKUP_DIR/$DATE"

# MongoDB backup
mongodump --uri="$MONGODB_URI" --out="$BACKUP_DIR/$DATE/mongodb"

# Redis backup
redis-cli BGSAVE
sleep 5
cp /var/lib/redis/dump.rdb "$BACKUP_DIR/$DATE/redis_dump.rdb"

# Compress backup
tar -czf "$BACKUP_DIR/backup_$DATE.tar.gz" -C "$BACKUP_DIR" "$DATE"

# Clean up old backups (keep last 30 days)
find "$BACKUP_DIR" -name "backup_*.tar.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_DIR/backup_$DATE.tar.gz"
```

## Performance Monitoring

### MongoDB Performance
```javascript
// Enable profiling
db.setProfilingLevel(2, { slowms: 100 });

// Check profile collection
db.system.profile.find().limit(5).sort({ ts: -1 }).pretty();

// Explain query execution
db.users.find({ email: "user@example.com" }).explain("executionStats");

// Index usage statistics
db.users.aggregate([{ $indexStats: {} }]);

// Connection statistics
db.serverStatus().connections;

// Operation statistics
db.serverStatus().opcounters;
```

### Redis Performance
```bash
# Get Redis info
redis-cli INFO

# Monitor commands in real-time
redis-cli MONITOR

# Get memory usage
redis-cli INFO memory

# Get slow queries
redis-cli SLOWLOG GET 10

# Reset slow log
redis-cli SLOWLOG RESET

# Get client list
redis-cli CLIENT LIST
```

### Performance Monitoring Script
```bash
#!/bin/bash
# File: scripts/monitor.sh

echo "=== MongoDB Statistics ==="
mongosh --quiet --eval "
  print('Database size:', db.stats().dataSize);
  print('Index size:', db.stats().indexSize);
  print('Collections:', db.stats().collections);
  print('Current connections:', db.serverStatus().connections.current);
"

echo "=== Redis Statistics ==="
redis-cli INFO | grep -E "(used_memory_human|connected_clients|total_commands_processed|keyspace_hits|keyspace_misses)"
```

## Security Management

### MongoDB Security
```javascript
// Create application user with minimal privileges
db.createUser({
  user: "tenderly_app",
  pwd: "secure-app-password",
  roles: [
    { role: "readWrite", db: "tenderly" }
  ]
});

// Create backup user
db.createUser({
  user: "backup_user",
  pwd: "backup-password",
  roles: [
    { role: "backup", db: "admin" }
  ]
});

// Enable authentication
// Edit /etc/mongod.conf:
// security:
//   authorization: enabled
```

### Redis Security
```bash
# Set password
redis-cli CONFIG SET requirepass "secure-redis-password"

# Rename dangerous commands
redis-cli CONFIG SET rename-command FLUSHDB ""
redis-cli CONFIG SET rename-command FLUSHALL ""
redis-cli CONFIG SET rename-command KEYS ""

# Enable SSL (in redis.conf)
# tls-port 6380
# tls-cert-file /path/to/redis.crt
# tls-key-file /path/to/redis.key
```

### Data Encryption
```javascript
// Verify encrypted fields
db.users.findOne({}, { firstName: 1, email: 1 });

// Check encryption status
db.users.find({ "firstName": /^[a-zA-Z]/ }).count(); // Should be 0 if encrypted

// Audit data access
db.auditlogs.find({
  "category": "data_access",
  "resourceType": "user",
  "action": "read"
}).sort({ timestamp: -1 });
```

## Troubleshooting

### Common MongoDB Issues

#### Connection Issues
```bash
# Check MongoDB status
brew services list | grep mongodb

# Check process
ps aux | grep mongod

# Check logs
tail -f /usr/local/var/log/mongodb/mongo.log

# Test connection
mongosh --eval "db.runCommand('ping')"
```

#### Performance Issues
```javascript
// Check slow operations
db.currentOp({"active": true, "secs_running": {"$gt": 1}});

// Kill slow operation
db.killOp(123456);

// Check index usage
db.users.find({ email: "test@example.com" }).explain("executionStats");
```

#### Disk Space Issues
```bash
# Check disk usage
df -h

# Check MongoDB data directory
du -sh /usr/local/var/mongodb/

# Compact database
mongosh --eval "db.runCommand({compact: 'users'})"
```

### Common Redis Issues

#### Memory Issues
```bash
# Check memory usage
redis-cli INFO memory

# Get memory usage by key pattern
redis-cli --bigkeys

# Set memory limit
redis-cli CONFIG SET maxmemory 1gb
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

#### Connection Issues
```bash
# Check Redis status
brew services list | grep redis

# Check process
ps aux | grep redis

# Test connection
redis-cli ping

# Check client connections
redis-cli CLIENT LIST
```

### Debugging Application Issues

#### Authentication Problems
```javascript
// Check user account status
db.users.findOne({ email: "user@example.com" }, { 
  accountStatus: 1, 
  failedLoginAttempts: 1, 
  accountLockedUntil: 1,
  isMFAEnabled: 1
});

// Check recent login attempts
db.auditlogs.find({
  "category": "authentication",
  "additionalData.email": "user@example.com"
}).sort({ timestamp: -1 }).limit(10);
```

#### Session Issues
```bash
# Check active sessions
redis-cli KEYS "tenderly:session:*"

# Check session data
redis-cli GET "tenderly:session:abc123"

# Check JWT tokens
redis-cli KEYS "tenderly:jwt:*"
```

## Production Considerations

### High Availability Setup

#### MongoDB Replica Set
```javascript
// Initialize replica set
rs.initiate({
  _id: "tenderly-rs",
  members: [
    { _id: 0, host: "mongo1.example.com:27017" },
    { _id: 1, host: "mongo2.example.com:27017" },
    { _id: 2, host: "mongo3.example.com:27017" }
  ]
});

// Check replica set status
rs.status();
```

#### Redis Cluster
```bash
# Start Redis cluster nodes
redis-server --port 7000 --cluster-enabled yes --cluster-config-file nodes.conf
redis-server --port 7001 --cluster-enabled yes --cluster-config-file nodes.conf
redis-server --port 7002 --cluster-enabled yes --cluster-config-file nodes.conf

# Create cluster
redis-cli --cluster create 127.0.0.1:7000 127.0.0.1:7001 127.0.0.1:7002 --cluster-replicas 1
```

### Monitoring and Alerting

#### MongoDB Monitoring
```javascript
// Create monitoring script
// File: scripts/mongodb-monitor.js

const { MongoClient } = require('mongodb');

async function checkHealth() {
  const client = await MongoClient.connect(process.env.MONGODB_URI);
  const db = client.db();
  
  // Check connection
  await db.admin().ping();
  
  // Check replication lag
  const status = await db.admin().command({ replSetGetStatus: 1 });
  
  // Check slow queries
  const slowQueries = await db.collection('system.profile')
    .find({ ts: { $gte: new Date(Date.now() - 60000) } })
    .count();
  
  console.log({
    connected: true,
    replicationLag: status.members[0].optimeDate - status.members[1].optimeDate,
    slowQueries: slowQueries
  });
  
  await client.close();
}

checkHealth().catch(console.error);
```

#### Redis Monitoring
```bash
# Create Redis monitoring script
# File: scripts/redis-monitor.sh

#!/bin/bash

REDIS_CLI="redis-cli -a $REDIS_PASSWORD"

echo "Redis Health Check:"
echo "Memory Used: $($REDIS_CLI INFO memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')"
echo "Connected Clients: $($REDIS_CLI INFO clients | grep connected_clients | cut -d: -f2 | tr -d '\r')"
echo "Ops per second: $($REDIS_CLI INFO stats | grep instantaneous_ops_per_sec | cut -d: -f2 | tr -d '\r')"
echo "Cache Hit Rate: $($REDIS_CLI INFO stats | grep keyspace_hits | cut -d: -f2 | tr -d '\r')"
```

### Maintenance Tasks

#### Daily Tasks
```bash
#!/bin/bash
# File: scripts/daily-maintenance.sh

# Backup databases
./scripts/backup.sh

# Clean up old audit logs
mongosh --eval "
  db.auditlogs.deleteMany({
    timestamp: { \$lt: new Date(Date.now() - 90*24*60*60*1000) },
    isArchived: true
  });
"

# Optimize Redis memory
redis-cli MEMORY PURGE

# Check disk space
df -h | grep -E '(80|90|100)%' && echo "WARNING: Disk space running low"
```

#### Weekly Tasks
```bash
#!/bin/bash
# File: scripts/weekly-maintenance.sh

# Rebuild indexes
mongosh --eval "db.users.reIndex(); db.auditlogs.reIndex();"

# Analyze slow queries
mongosh --eval "
  db.system.profile.find({
    ts: { \$gte: new Date(Date.now() - 7*24*60*60*1000) }
  }).sort({ ts: -1 }).limit(10).forEach(printjson);
"

# Redis key expiration analysis
redis-cli --bigkeys

# Update performance baselines
./scripts/performance-baseline.sh
```

## Configuration Files

### MongoDB Configuration (`/etc/mongod.conf`)
```yaml
# mongod.conf
storage:
  dbPath: /var/lib/mongodb
  journal:
    enabled: true
  wiredTiger:
    engineConfig:
      cacheSizeGB: 2

systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log

net:
  port: 27017
  bindIp: 127.0.0.1

security:
  authorization: enabled

operationProfiling:
  slowOpThresholdMs: 100

replication:
  replSetName: "tenderly-rs"
```

### Redis Configuration (`/etc/redis.conf`)
```conf
# redis.conf
bind 127.0.0.1
port 6379
protected-mode yes
requirepass your-secure-password

# Memory management
maxmemory 1gb
maxmemory-policy allkeys-lru

# Persistence
save 900 1
save 300 10
save 60 10000

# Logging
loglevel notice
logfile /var/log/redis/redis-server.log

# Security
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command KEYS ""
```

## Environment Variables

### Production Environment
```bash
# MongoDB
MONGODB_URI=mongodb://username:password@mongo1.example.com:27017,mongo2.example.com:27017,mongo3.example.com:27017/tenderly?replicaSet=tenderly-rs&authSource=admin

# Redis
REDIS_HOST=redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=secure-redis-password
REDIS_DB=0

# Monitoring
MONGODB_MONITORING_ENABLED=true
REDIS_MONITORING_ENABLED=true
```

## Support and Contacts

### Emergency Contacts
- **Database Administrator**: admin@tenderly.care
- **DevOps Team**: devops@tenderly.care
- **Security Team**: security@tenderly.care

### Resources
- [MongoDB Documentation](https://docs.mongodb.com/)
- [Redis Documentation](https://redis.io/documentation)
- [Mongoose Documentation](https://mongoosejs.com/docs/)
- [NestJS MongoDB Guide](https://docs.nestjs.com/techniques/mongodb)

### Monitoring Dashboards
- MongoDB Monitoring: `http://monitor.tenderly.care/mongodb`
- Redis Monitoring: `http://monitor.tenderly.care/redis`
- Application Metrics: `http://monitor.tenderly.care/app`

---

**Note**: This guide contains sensitive information. Ensure proper access controls and keep credentials secure. Regular updates to this documentation are recommended as the system evolves.

**Last Updated**: January 2025
**Version**: 1.0.0
