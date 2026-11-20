"""Read-only checks for the Docker web deployment; never initializes the database."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


def configuration_errors(config: dict) -> list[str]:
    services = config.get("services", {})
    errors = []
    required = {
        "postgres-bank": ("POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD"),
        "banking-api": ("POSTGRES_PASSWORD", "JWT_SECRET", "OTP_HASH_SECRET"),
        "notification-sender": ("POSTGRES_PASSWORD",),
    }
    for name, keys in required.items():
        env = services.get(name, {}).get("environment", {})
        for key in keys:
            if not str(env.get(key) or "").strip():
                errors.append(f"{name}: missing {key}")
        for key in ("JWT_SECRET", "OTP_HASH_SECRET"):
            if env.get(key) and len(str(env[key])) < 32:
                errors.append(f"{name}: {key} must have at least 32 characters")
    for name in ("web", "gateway"):
        service = services.get(name)
        if not service:
            errors.append(f"Missing service: {name}")
            continue
        if any(key.endswith("PASSWORD") or key in ("JWT_SECRET", "OTP_HASH_SECRET", "BREVO_API_KEY")
               for key in service.get("environment", {})):
            errors.append(f"{name}: backend secrets must not be passed to this service")
    for name in ("postgres-bank", "banking-api"):
        for port in services.get(name, {}).get("ports", []):
            if port.get("host_ip") not in ("127.0.0.1", "::1"):
                errors.append(f"{name}: bind host port to loopback for EC2 web deployment")
    if services.get("web", {}).get("ports"):
        errors.append("web: access through gateway instead of exposing the internal server")
    return errors


def check_url(base_url: str) -> list[str]:
    errors = []
    for path in ("/login", "/api/v1/health", "/customer-welcome-banner.png"):
        try:
            with urlopen(base_url.rstrip("/") + path, timeout=20) as response:
                if response.status != 200:
                    errors.append(f"{path}: HTTP {response.status}")
                if path.endswith("/health"):
                    body = json.load(response)
                    if body.get("status") != "ok" or body.get("riskModel", {}).get("engine") != "joblib":
                        errors.append("API/model readiness check failed")
        except (URLError, TimeoutError, ValueError):
            errors.append(f"{path}: request failed; check gateway, API and database setup")
    return errors


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", default=".env")
    parser.add_argument("--url", help="Optional public web URL for GET-only smoke checks")
    args = parser.parse_args()
    env_file = Path(args.env_file).resolve()
    if not env_file.is_file():
        raise SystemExit("Missing environment file; copy .env.example and configure credentials first")
    try:
        result = subprocess.run(
            ["docker", "compose", "--env-file", str(env_file), "--profile", "web", "config", "--format", "json"],
            cwd=ROOT, capture_output=True, text=True, timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise SystemExit("Cannot run Docker Compose configuration check")
    if result.returncode:
        # Compose output may contain secrets: never echo the resolved configuration.
        raise SystemExit("Docker Compose configuration is invalid; check variable names and compose version")
    errors = configuration_errors(json.loads(result.stdout))
    for relative in ("models/fraud_detection_model.joblib", "models/model_metadata.json",
                     "web/public/customer-welcome-banner.png", "docker/Caddyfile"):
        if not (ROOT / relative).is_file():
            errors.append(f"Missing deployment file: {relative}")
    if args.url:
        errors.extend(check_url(args.url))
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        raise SystemExit(1)
    print("PASS: deployment configuration" + (" and public GET checks" if args.url else ""))
    print("No database changes were made. Without --url, live database/model readiness is not verified.")


if __name__ == "__main__":
    main()
