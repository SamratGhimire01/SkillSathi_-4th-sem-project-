# database/init_db.sh

#!/bin/bash

# Wait for MySQL to start
echo "Waiting for MySQL to start..."
sleep 15 

# Run the schema creation script using the pre-configured environment variables
echo "Creating SkillSathi tables..."
mysql -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" < /app/database/schema.sql

echo "Database initialization complete."