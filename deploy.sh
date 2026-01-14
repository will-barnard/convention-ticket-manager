#!/bin/bash

echo "Pulling latest changes from git..."
git pull

echo "Stopping containers..."
docker-compose down

echo "Rebuilding and starting containers..."
docker-compose up -d --build

echo "Deployment complete!"
echo "View logs with: docker-compose logs -f"
