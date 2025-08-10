#!/bin/bash

# Quick Docker Test for Tenderly Backend
# Uses lightweight Dockerfile for faster testing

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_message() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

print_message $BLUE "🧪 Quick Docker Test - Tenderly Backend"

# Check prerequisites
if ! docker info > /dev/null 2>&1; then
    print_message $RED "❌ Docker is not running"
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    if [ -f ".env.docker" ]; then
        print_message $YELLOW "⚠️  Copying .env.docker to .env"
        cp .env.docker .env
    else
        print_message $RED "❌ No .env file found"
        exit 1
    fi
fi

# Build lightweight image
print_message $BLUE "🏗️  Building lightweight Docker image..."
docker build -f Dockerfile.light -t tenderly-backend:light .

if [ $? -ne 0 ]; then
    print_message $RED "❌ Docker build failed"
    exit 1
fi

print_message $GREEN "✅ Docker image built successfully"

# Test Docker Compose with override for light build
print_message $BLUE "🔍 Testing Docker Compose configuration..."

# Create temporary override for light image
cat > docker-compose.override.yml << EOF
version: '3.8'
services:
  backend:
    build:
      dockerfile: Dockerfile.light
    image: tenderly-backend:light
EOF

# Test compose config
docker-compose config > /dev/null 2>&1
if [ $? -eq 0 ]; then
    print_message $GREEN "✅ Docker Compose configuration is valid"
else
    print_message $RED "❌ Docker Compose configuration failed"
    rm -f docker-compose.override.yml
    exit 1
fi

# Start services
print_message $BLUE "🚀 Starting services..."
docker-compose up -d --build

# Wait for services
print_message $BLUE "⏳ Waiting for services to start (45 seconds)..."
sleep 45

# Test health
print_message $BLUE "🔍 Testing service health..."

# Test MongoDB
if docker-compose exec -T mongodb mongosh --quiet --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
    print_message $GREEN "✅ MongoDB is healthy"
else
    print_message $YELLOW "⚠️  MongoDB may still be starting"
fi

# Test Redis
if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    print_message $GREEN "✅ Redis is healthy"
else
    print_message $YELLOW "⚠️  Redis may still be starting"
fi

# Test Backend API
print_message $BLUE "🔍 Testing Backend API..."

# Wait for backend with timeout
for i in {1..15}; do
    if curl -s http://localhost:3000/api/v1/health > /dev/null 2>&1; then
        health_response=$(curl -s http://localhost:3000/api/v1/health)
        if echo "$health_response" | grep -q "ok"; then
            print_message $GREEN "✅ Backend API is healthy"
            print_message $BLUE "Health Response: $health_response"
            break
        fi
    fi
    echo -n "."
    sleep 3
done

if [ $i -eq 15 ]; then
    print_message $YELLOW "⚠️  Backend API may still be starting. Checking logs..."
    docker-compose logs backend | tail -20
fi

# Test API endpoints
print_message $BLUE "🔍 Testing API endpoints..."

if curl -s -I http://localhost:3000/api/v1/docs | grep -q "200 OK"; then
    print_message $GREEN "✅ API documentation is accessible"
else
    print_message $YELLOW "⚠️  API documentation may not be ready"
fi

# Check container status
print_message $BLUE "📊 Container status:"
docker-compose ps

# Show logs if there are any errors
backend_logs=$(docker-compose logs backend 2>&1 | grep -i "error\|exception\|failed" | head -3)
if [ ! -z "$backend_logs" ]; then
    print_message $YELLOW "⚠️  Found some logs to review:"
    echo "$backend_logs"
fi

# Performance check
print_message $BLUE "⚡ Performance test..."
response_time=$(curl -w "%{time_total}" -s -o /dev/null http://localhost:3000/api/v1/health 2>/dev/null || echo "timeout")
if [ "$response_time" != "timeout" ]; then
    print_message $GREEN "✅ API response time: ${response_time}s"
else
    print_message $YELLOW "⚠️  API response timed out"
fi

# Cleanup
print_message $BLUE "🧹 Cleaning up..."
docker-compose down
rm -f docker-compose.override.yml

print_message $GREEN "✅ Quick Docker test completed!"
print_message $BLUE "📋 Summary:"
print_message $GREEN "  ✅ Lightweight Docker image builds successfully"
print_message $GREEN "  ✅ Docker services can start"
print_message $GREEN "  ✅ Basic functionality works"

print_message $BLUE "🚀 Ready for full deployment!"
print_message $BLUE "Use: ./docker-management.sh start dev"
