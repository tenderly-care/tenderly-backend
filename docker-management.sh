#!/bin/bash

# Tenderly Backend Docker Management Script
# This script provides easy commands to manage the Docker deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="tenderly-backend"
DEFAULT_ENV="development"

# Function to print colored output
print_message() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_message $RED "❌ Docker is not running. Please start Docker first."
        exit 1
    fi
}

# Function to check if .env file exists
check_env_file() {
    if [ ! -f ".env" ]; then
        if [ -f ".env.docker" ]; then
            print_message $YELLOW "⚠️  No .env file found. Copying from .env.docker..."
            cp .env.docker .env
        else
            print_message $RED "❌ No .env or .env.docker file found. Please create one."
            exit 1
        fi
    fi
}

# Function to build images
build() {
    local env=${1:-$DEFAULT_ENV}
    print_message $BLUE "🏗️  Building Tenderly Backend Docker image..."
    
    check_docker
    check_env_file
    
    docker build -t tenderly-backend:latest .
    
    print_message $GREEN "✅ Docker image built successfully!"
    print_message $BLUE "Using ultra-minimal build (Dockerfile.ultra) for reliability"
}

# Function to start services
start() {
    local env=${1:-$DEFAULT_ENV}
    print_message $BLUE "🚀 Starting Tenderly Backend ($env environment)..."
    
    check_docker
    check_env_file
    
    case $env in
        development|dev)
            docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
            ;;
        production|prod)
            docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
            ;;
        monitoring)
            docker-compose --profile monitoring up -d
            ;;
        *)
            docker-compose up -d
            ;;
    esac
    
    print_message $GREEN "✅ Services started successfully!"
    print_message $BLUE "📚 API Documentation: http://localhost:3000/api/v1/docs"
    print_message $BLUE "🔍 Health Check: http://localhost:3000/api/v1/health"
    
    if [ "$env" = "development" ] || [ "$env" = "dev" ]; then
        print_message $BLUE "🗄️  MongoDB Admin: http://localhost:8081 (admin/admin)"
        print_message $BLUE "🔴 Redis Commander: http://localhost:8082"
    fi
}

# Function to stop services
stop() {
    print_message $YELLOW "🛑 Stopping Tenderly Backend services..."
    
    check_docker
    
    docker-compose down
    
    print_message $GREEN "✅ Services stopped successfully!"
}

# Function to restart services
restart() {
    local env=${1:-$DEFAULT_ENV}
    print_message $BLUE "🔄 Restarting Tenderly Backend..."
    
    stop
    start $env
}

# Function to view logs
logs() {
    local service=${1:-""}
    
    check_docker
    
    if [ -z "$service" ]; then
        docker-compose logs -f
    else
        docker-compose logs -f $service
    fi
}

# Function to check status
status() {
    print_message $BLUE "📊 Checking service status..."
    
    check_docker
    
    docker-compose ps
    
    print_message $BLUE "\n🔍 Service health checks:"
    
    # Check backend health
    if curl -s http://localhost:3000/api/v1/health > /dev/null; then
        print_message $GREEN "✅ Backend API is healthy"
    else
        print_message $RED "❌ Backend API is not responding"
    fi
    
    # Check MongoDB
    if docker-compose exec -T mongodb mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
        print_message $GREEN "✅ MongoDB is healthy"
    else
        print_message $RED "❌ MongoDB is not responding"
    fi
    
    # Check Redis
    if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
        print_message $GREEN "✅ Redis is healthy"
    else
        print_message $RED "❌ Redis is not responding"
    fi
}

# Function to clean up
clean() {
    print_message $YELLOW "🧹 Cleaning up Docker resources..."
    
    check_docker
    
    # Stop and remove containers
    docker-compose down
    
    # Remove images
    docker image rm tenderly-backend:latest 2>/dev/null || true
    
    # Remove unused volumes (optional)
    read -p "Remove persistent data volumes? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker-compose down -v
        print_message $GREEN "✅ Volumes removed"
    fi
    
    # Clean up unused Docker resources
    docker system prune -f
    
    print_message $GREEN "✅ Cleanup completed!"
}

# Function to backup data
backup() {
    local backup_dir="backups/$(date +%Y%m%d_%H%M%S)"
    
    print_message $BLUE "💾 Creating backup..."
    
    check_docker
    
    mkdir -p $backup_dir
    
    # Backup MongoDB
    docker-compose exec -T mongodb mongodump --out /tmp/backup
    docker cp $(docker-compose ps -q mongodb):/tmp/backup $backup_dir/mongodb
    
    # Backup Redis (optional)
    docker-compose exec -T redis redis-cli --rdb /tmp/dump.rdb
    docker cp $(docker-compose ps -q redis):/tmp/dump.rdb $backup_dir/redis_dump.rdb
    
    print_message $GREEN "✅ Backup created in $backup_dir"
}

# Function to show help
help() {
    echo "Tenderly Backend Docker Management Script"
    echo ""
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  build [env]       Build Docker images"
    echo "  start [env]       Start services (env: dev, prod, monitoring)"
    echo "  stop              Stop all services"
    echo "  restart [env]     Restart services"
    echo "  logs [service]    View logs (optionally for specific service)"
    echo "  status            Check service status and health"
    echo "  clean             Clean up Docker resources"
    echo "  backup            Backup database data"
    echo "  help              Show this help message"
    echo ""
    echo "Environments:"
    echo "  development/dev   Development environment with debugging tools"
    echo "  production/prod   Production environment with optimizations"
    echo "  monitoring        Add monitoring stack (Prometheus, Grafana)"
    echo ""
    echo "Examples:"
    echo "  $0 build"
    echo "  $0 start dev"
    echo "  $0 logs backend"
    echo "  $0 status"
}

# Main script logic
case ${1} in
    build)
        build ${2}
        ;;
    start)
        start ${2}
        ;;
    stop)
        stop
        ;;
    restart)
        restart ${2}
        ;;
    logs)
        logs ${2}
        ;;
    status)
        status
        ;;
    clean)
        clean
        ;;
    backup)
        backup
        ;;
    help|--help|-h)
        help
        ;;
    *)
        print_message $RED "❌ Unknown command: ${1}"
        echo ""
        help
        exit 1
        ;;
esac
