"""E2E must not bypass authentication or commit without explicit opt-in."""
import json
import pytest
from scripts import e2e_test


def test_e2e_checks_write_opt_in_and_token_before_bootstrap(monkeypatch):
    monkeypatch.setattr(e2e_test, "bootstrap_demo", lambda: pytest.fail("bootstrap before opt-in"))
    monkeypatch.setattr(e2e_test, "_assert_docker_compose", lambda: pytest.fail("stack before opt-in"))
    for allow, token in (("", ""), ("1", ""), ("", "test-token")):
        monkeypatch.setenv("E2E_ALLOW_DEMO_TRANSFER", allow)
        monkeypatch.setenv("E2E_ACCESS_TOKEN", token)
        with pytest.raises(RuntimeError, match="commits a demo transfer"):
            e2e_test.main()


def test_json_client_sends_bearer_auth_without_exposing_it(monkeypatch):
    class Response:
        def __enter__(self): return self
        def __exit__(self, *_): pass
        def read(self): return b'{"status":"Pending"}'
    def request(req, timeout):
        assert req.get_header("Authorization") == "Bearer test-only-token"
        assert json.loads(req.data) == {"customerVerified": True}
        return Response()
    monkeypatch.setattr(e2e_test.urllib.request, "urlopen", request)
    assert e2e_test._json_request("http://example.test/api/v1/transactions/counter-transfers", method="POST", bearer_token="test-only-token", payload={"customerVerified": True}) == {"status":"Pending"}
