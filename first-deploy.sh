#!/bin/bash

echo "=========================================="
echo "FIRST TIME DEPLOYMENT SCRIPT"
echo "=========================================="
echo ""

echo "1. Pulling latest changes from git..."
git pull

echo ""
echo "2. Stopping any existing containers..."
docker-compose down

echo ""
echo "3. Rebuilding and starting containers..."
docker-compose up -d --build

echo ""
echo "4. Waiting for database to be ready..."
sleep 10

echo ""
echo "5. Running database migrations..."
echo "   - Running main migration (tables creation)..."
docker exec -it convention-backend node src/migrations/run.js

echo "   - Creating settings table..."
docker exec -it convention-backend node src/migrations/create-settings-table.js

echo "   - Creating ticket scans table..."
docker exec -it convention-backend node src/migrations/create-ticket-scans-table.js

echo "   - Updating settings for dates..."
docker exec -it convention-backend node src/migrations/update-settings-for-dates.js

echo "   - Updating settings for email toggle..."
docker exec -it convention-backend node src/migrations/update-settings-for-email-toggle.js

echo "   - Updating tickets for attendee types..."
docker exec -it convention-backend node src/migrations/update-tickets-for-attendee-types.js

echo "   - Updating tickets for email tracking..."
docker exec -it convention-backend node src/migrations/update-tickets-for-email-tracking.js

echo "   - Updating settings table structure..."
docker exec -it convention-backend node src/migrations/update-settings-table.js

echo "   - Adding SuperAdmin role..."
docker exec -it convention-backend node src/migrations/add-superadmin-role.js

echo "   - Adding receive mode fields..."
docker exec -it convention-backend node src/migrations/add-receive-mode-fields.js

echo "   - Adding Shopify order ID..."
docker exec -it convention-backend node src/migrations/add-shopify-order-id.js

echo "   - Adding ticket status..."
docker exec -it convention-backend node src/migrations/add-ticket-status.js

echo ""
echo "6. Seeding initial data..."
echo "   - Creating default admin user..."
docker exec -it convention-backend node src/migrations/seed.js

echo "   - Creating default verifier user..."
docker exec -it convention-backend node src/migrations/seed-verifier.js

echo "   - Creating default superadmin user..."
docker exec -it convention-backend node src/migrations/seed-superadmin.js

echo ""
echo "=========================================="
echo "FIRST TIME DEPLOYMENT COMPLETE!"
echo "=========================================="
echo ""
echo "Default user accounts created:"
echo "  Admin:      username: admin,      password: admin123"
echo "  Verifier:   username: verifier,   password: verifier123"
echo "  SuperAdmin: username: superadmin, password: superadmin123"
echo ""
echo "⚠️  IMPORTANT: Change these default passwords immediately!"
echo ""
echo "View logs with: docker-compose logs -f"
echo "=========================================="
