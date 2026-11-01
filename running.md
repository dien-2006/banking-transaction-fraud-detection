docker compose --profile realtime --profile ml down
npm run dev

docker compose up -d postgres-bank redis
docker compose up -d --no-deps banking-api

docker compose up -d notification-sender
docker compose up -d minio hive-metastore trino