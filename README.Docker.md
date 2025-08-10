# Tenderly Backend - Docker Deployment Guide

This guide provides comprehensive instructions for deploying the Tenderly Backend using Docker and Docker Compose.

## 🚀 Quick Start

### Prerequisites

- Docker 20.10+ and Docker Compose 2.0+
- At least 4GB RAM available for Docker
- 2GB free disk space

### 1. Clone and Setup

```bash
git clone <repository-url>
cd tenderly-backend

# Copy environment template
cp .env.docker .env

# Make management script executable
chmod +x docker-management.sh
```

### 2. Configure Environment

Edit the `.env` file and update the following critical values:

```bash
# Security - CHANGE THESE IN PRODUCTION
JWT_SECRET=your-super-secure-jwt-secret-key-min-256-bits-change-in-production
DATA_ENCRYPTION_KEY=your32characterencryptionkeyhere1

# Database passwords
MONGO_ROOT_PASSWORD=SecureMongoPassword123!
REDIS_PASSWORD=SecureRedisPassword123!

# Update CORS origins for your domain
CORS_ORIGINS=http://localhost:3000,http://localhost:3001,https://yourdomain.com
```

### 3. Start Services

```bash
# Development environment
./docker-management.sh start dev

# Production environment
./docker-management.sh start prod

# Or use Docker Compose directly
docker-compose up -d
```

## 📋 Available Services

| Service | Port | Description | Environment |
|---------|------|-------------|-------------|
| Backend API | 3000 | Main NestJS application | All |
| MongoDB | 27017 | Database (internal only in prod) | All |
| Redis | 6379 | Cache (internal only in prod) | All |
| Nginx | 80, 443 | Reverse proxy | Production |
| Mongo Express | 8081 | MongoDB admin interface | Development |
| Redis Commander | 8082 | Redis management | Development |
| Prometheus | 9090 | Metrics collection | Monitoring |
| Grafana | 3001 | Dashboard | Monitoring |

## 🔧 Management Commands

The `docker-management.sh` script provides easy management:

```bash
# Build the application
./docker-management.sh build

# Start services
./docker-management.sh start [dev|prod|monitoring]

# Stop services
./docker-management.sh stop

# Restart services
./docker-management.sh restart [env]

# View logs
./docker-management.sh logs [service]

# Check service status
./docker-management.sh status

# Clean up resources
./docker-management.sh clean

# Backup data
./docker-management.sh backup

# Show help
./docker-management.sh help
```

## 🏗️ Docker Architecture

### Multi-stage Dockerfile

The Dockerfile uses a multi-stage build for optimal production images:

1. **Builder Stage**: Installs dependencies and builds the application
2. **Runtime Stage**: Creates minimal production image with only runtime dependencies

### Security Features

- Non-root user execution
- Read-only filesystem
- Security options (no-new-privileges)
- Minimal Alpine Linux base
- Health checks
- Resource limits

## 🌍 Environment Configurations

### Development Environment

```bash
./docker-management.sh start dev
```

Features:
- Hot reloading (if configured)
- Debug port exposed (9229)
- Database admin interfaces
- Detailed logging
- No security restrictions

Access:
- API: http://localhost:3000/api/v1
- Docs: http://localhost:3000/api/v1/docs
- MongoDB Admin: http://localhost:8081 (admin/admin)
- Redis Commander: http://localhost:8082

### Production Environment

```bash
./docker-management.sh start prod
```

Features:
- Nginx reverse proxy
- SSL termination ready
- Resource limits
- Read-only containers
- Internal networking only
- Optimized logging

### Monitoring Stack

```bash
./docker-management.sh start monitoring
```

Additional services:
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (admin/grafanapassword)

## 🔐 Security Considerations

### Production Checklist

- [ ] Change all default passwords in `.env`
- [ ] Update JWT secret and encryption keys
- [ ] Configure SSL certificates
- [ ] Update CORS origins
- [ ] Enable proper firewall rules
- [ ] Set up log aggregation
- [ ] Configure monitoring alerts

### SSL Configuration

For production with SSL:

1. Place certificates in `docker/nginx/ssl/`
2. Update nginx configuration
3. Uncomment HTTPS server block in `nginx.conf`

## 📊 Monitoring and Logging

### Health Checks

All services include health checks:
- Backend: `/api/v1/health`
- MongoDB: `db.adminCommand('ping')`
- Redis: `PING` command

### Log Management

Logs are structured and can be aggregated:
- Application logs: JSON format
- Nginx access logs: Combined format
- Database logs: Standard format

### Metrics

When monitoring is enabled:
- Application metrics via Prometheus
- Infrastructure metrics
- Custom business metrics

## 💾 Data Persistence

### Volumes

Persistent data is stored in Docker volumes:
- `mongodb_data`: Database files
- `redis_data`: Cache persistence
- `nginx_logs`: Web server logs

### Backup Strategy

```bash
# Create backup
./docker-management.sh backup

# Restore from backup
# 1. Stop services
./docker-management.sh stop

# 2. Restore data manually from backup directory
# 3. Start services
./docker-management.sh start
```

## 🐛 Troubleshooting

### Common Issues

1. **Port conflicts**
   ```bash
   # Check what's using the port
   lsof -i :3000
   
   # Update port in docker-compose.yml if needed
   ```

2. **Memory issues**
   ```bash
   # Check Docker memory allocation
   docker system df
   
   # Clean up unused resources
   ./docker-management.sh clean
   ```

3. **Database connection issues**
   ```bash
   # Check MongoDB logs
   ./docker-management.sh logs mongodb
   
   # Verify environment variables
   docker-compose config
   ```

### Debug Commands

```bash
# Execute command in running container
docker-compose exec backend sh

# Check environment variables
docker-compose exec backend env

# View container resource usage
docker stats

# Check network connectivity
docker-compose exec backend ping mongodb
```

## 🚦 CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy Tenderly Backend

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build and deploy
        run: |
          ./docker-management.sh build
          ./docker-management.sh start prod
```

### Docker Hub Integration

```bash
# Tag and push image
docker tag tenderly-backend:latest your-registry/tenderly-backend:v1.0.0
docker push your-registry/tenderly-backend:v1.0.0
```

## 📚 Additional Resources

### Configuration Files

- `Dockerfile`: Multi-stage application build
- `docker-compose.yml`: Base service definitions
- `docker-compose.dev.yml`: Development overrides
- `docker-compose.prod.yml`: Production overrides
- `.env.docker`: Environment template

### External Dependencies

- MongoDB: Document database
- Redis: Caching and session storage
- Nginx: Reverse proxy and load balancer
- Node.js: Runtime environment

### API Documentation

Once running, visit:
- Swagger UI: http://localhost:3000/api/v1/docs
- Health endpoint: http://localhost:3000/api/v1/health

## 🆘 Support

For issues related to Docker deployment:

1. Check the troubleshooting section
2. View service logs: `./docker-management.sh logs`
3. Check service status: `./docker-management.sh status`
4. Review environment configuration
5. Consult the main project documentation

---

**Note**: This Docker setup is production-ready but requires proper security configuration for public deployment. Always review and update security settings before deploying to production.
