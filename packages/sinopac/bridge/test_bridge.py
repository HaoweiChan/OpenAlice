"""
Integration test script for the Sinopac bridge.
Run with: pytest test_bridge.py -v (requires a running bridge on localhost:8890)
Or run manually: python test_bridge.py
"""

import sys
import requests

BASE = "http://localhost:8890"


def test_health():
    r = requests.get(f"{BASE}/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    print(f"  Health: {data}")


def test_login_required():
    """Endpoints should return 401 when not logged in."""
    r = requests.get(f"{BASE}/accounts")
    assert r.status_code == 401
    print(f"  Accounts (no auth): {r.status_code}")


def test_contract_not_found():
    """Contract lookup for nonexistent should 401 (not logged in) or 404."""
    r = requests.get(f"{BASE}/contracts/stocks/XYZNONEXISTENT")
    assert r.status_code in (401, 404)
    print(f"  Contract not found: {r.status_code}")


def test_login_invalid():
    """Login with bad credentials should fail."""
    r = requests.post(f"{BASE}/login", json={"api_key": "bad", "secret_key": "bad"})
    assert r.status_code == 401
    print(f"  Login invalid: {r.status_code}")


if __name__ == "__main__":
    tests = [test_health, test_login_required, test_contract_not_found, test_login_invalid]
    failed = 0
    for t in tests:
        name = t.__name__
        try:
            t()
            print(f"PASS: {name}")
        except AssertionError as e:
            print(f"FAIL: {name} — {e}")
            failed += 1
        except requests.ConnectionError:
            print(f"SKIP: {name} — bridge not running at {BASE}")
            failed += 1
    sys.exit(1 if failed else 0)
