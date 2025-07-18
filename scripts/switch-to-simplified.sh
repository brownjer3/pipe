#!/bin/bash

# Switch to simplified database architecture (PostgreSQL + Redis only)

echo "Switching to simplified database architecture..."

# Stop all running containers
echo "Stopping existing containers..."
docker-compose down

# Backup existing docker-compose files
echo "Backing up existing configuration..."
cp docker-compose.yml docker-compose.yml.bak
cp docker-compose.override.yml docker-compose.override.yml.bak

# Switch to simplified configuration
echo "Applying simplified configuration..."
cp docker-compose.simplified.yml docker-compose.yml
cp docker-compose.override.simplified.yml docker-compose.override.yml

# Start new containers
echo "Starting simplified stack..."
docker-compose up -d

# Wait for services to be ready
echo "Waiting for services to be ready..."
sleep 5

# Run migrations
echo "Running database migrations..."
npm run db:migrate:deploy

echo "✅ Successfully switched to simplified architecture!"
echo "   - PostgreSQL: localhost:5432"
echo "   - Redis: localhost:6379"
echo ""
echo "To revert to the full stack, run: ./scripts/switch-to-full.sh"