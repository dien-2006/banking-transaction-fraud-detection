from copy import deepcopy

from scripts.check_web_deployment import configuration_errors


def valid_config():
    return {"services": {
        "postgres-bank": {"environment": {"POSTGRES_DB": "test", "POSTGRES_USER": "admin", "POSTGRES_PASSWORD": "test"},
                          "ports": [{"host_ip": "127.0.0.1"}]},
        "banking-api": {"environment": {"POSTGRES_PASSWORD": "test-runtime", "JWT_SECRET": "j" * 32, "OTP_HASH_SECRET": "o" * 32},
                        "ports": [{"host_ip": "127.0.0.1"}]},
        "notification-sender": {"environment": {"POSTGRES_PASSWORD": "test-notification"}},
        "web": {"environment": {"PORT": "3000"}},
        "gateway": {"environment": {"PUBLIC_HOST": ":80"}},
    }}


def test_valid_deployment_configuration():
    assert configuration_errors(valid_config()) == []


def test_missing_credentials_and_public_database_are_rejected_without_printing_values():
    config = valid_config()
    config["services"]["banking-api"]["environment"]["POSTGRES_PASSWORD"] = ""
    config["services"]["banking-api"]["environment"]["JWT_SECRET"] = "short-private-value"
    config["services"]["postgres-bank"]["ports"][0]["host_ip"] = "0.0.0.0"
    errors = configuration_errors(config)
    assert len(errors) == 3
    assert "short-private-value" not in str(errors)


def test_frontend_secret_leaks_and_direct_web_ports_are_rejected():
    config = deepcopy(valid_config())
    config["services"]["web"]["environment"]["JWT_SECRET"] = "do-not-print"
    config["services"]["web"]["ports"] = [{"published": "3000"}]
    errors = configuration_errors(config)
    assert len(errors) == 2
    assert "do-not-print" not in str(errors)
