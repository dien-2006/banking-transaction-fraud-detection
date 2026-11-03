"""Compatibility entry point: the sole publisher is backend/src/producer.ts.

Run docker compose --profile realtime up -d outbox-publisher.
"""
if __name__ == "__main__":
    raise SystemExit("Use the outbox-publisher Compose service (TypeScript); the duplicate Python publisher was retired.")
