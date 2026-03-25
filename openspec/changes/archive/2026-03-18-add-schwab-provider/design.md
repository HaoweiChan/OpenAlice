## Context

OpenAlice's trading layer uses a two-tier abstraction: `IPlatform` (broker configuration + account factory) and `ITradingAccount` (unified trading operations). Two providers are implemented — CCXT for crypto exchanges and Alpaca for US equities. Both use API key/secret authentication.

Schwab introduces a fundamentally different auth model (OAuth 2.0 Code Flow with browser consent) while otherwise fitting cleanly into the existing platform/account pattern. The `@sudowealth/schwab-api` npm package handles OAuth, provides typed API namespaces (`marketData.*`, `trader.*`), and includes Zod-validated responses.

## Goals / Non-Goals

**Goals:**
- Schwab as a first-class provider alongside CCXT and Alpaca
- Full `ITradingAccount` implementation for equities and options
- OAuth token lifecycle handled transparently (persist, refresh, re-auth)
- Follow existing patterns — a Schwab provider should look and feel like the Alpaca provider
- Config-driven setup via `platforms.json` + `accounts.json`

**Non-Goals:**
- Schwab streaming/WebSocket real-time data (future enhancement)
- Options chain exploration tools (beyond basic OPT support in contracts)
- Multi-leg / complex order strategies (single-leg orders only for now)
- Automated OAuth browser flow (user completes consent manually, pastes callback URL)
- Paper trading simulation layer on top of Schwab (Schwab has no sandbox)

## Decisions

### Decision 1: Use `@sudowealth/schwab-api` over Python bridge or raw HTTP

**Choice**: `@sudowealth/schwab-api` (TypeScript, MIT, Zod validation)

**Alternatives considered**:
- `schwab-py` via Python subprocess/HTTP bridge — rejected: adds Python runtime dependency, cross-language token sharing complexity, latency overhead, and maintenance burden for a TypeScript project
- `schwab-client-js` — viable but less typed, less actively maintained
- Direct HTTP against Schwab REST API — rejected: would require reimplementing OAuth flow, token management, and response parsing that the library already handles
- `@pyriter/schwab-client` — viable but less comprehensive than `@sudowealth`

**Rationale**: Same-language integration with strong types is the lowest-risk path. The Alpaca provider uses the same pattern (npm SDK wrapping REST API).

### Decision 2: OAuth token persistence in per-account JSON files

**Choice**: Store tokens at `data/config/schwab-tokens-{accountId}.json`

**Alternatives considered**:
- Store tokens in `accounts.json` alongside credentials — rejected: tokens are ephemeral, high-churn state mixed with stable config
- SQLite or database — over-engineered for per-account token pairs
- In-memory only — rejected: would require re-auth on every restart

**Rationale**: Follows the convention of `data/config/` for runtime state. Per-account files avoid cross-contamination and allow independent token refresh cycles.

### Decision 3: Manual initial OAuth consent flow

**Choice**: On first `init()` with no tokens, throw an error with the authorization URL. User visits URL, consents, copies the callback URL, and runs a one-time setup command.

**Alternatives considered**:
- Spawn a local HTTP server to catch the OAuth callback — complex, port conflicts, firewall issues
- Open browser automatically — not always possible (headless server, SSH)
- Embed a web UI OAuth flow — tied to web connector being active

**Rationale**: The simplest reliable approach. A CLI helper or web UI OAuth flow can be added later as a convenience layer without changing the core provider.

### Decision 4: Account hash resolution at init time

**Choice**: On `init()`, call `getAccounts()` to discover the encrypted account hash, cache it for the session lifetime.

**Rationale**: Schwab uses hashed account numbers for all API calls. The hash is stable per token lifetime but not predictable from the raw account number. Resolving at init avoids per-request lookups.

### Decision 5: Map Schwab order format in `SchwabAccount.placeOrder()`

**Choice**: Map the flat `OrderRequest` to Schwab's nested `orderLegCollection` structure inside `SchwabAccount`, keeping the translation in one place.

**Rationale**: Schwab orders use a multi-leg structure even for single-leg orders. This is a Schwab-specific concern that belongs in the provider, not in shared code.

### Decision 6: File structure mirrors Alpaca provider

```
src/extension/trading/providers/schwab/
├── SchwabPlatform.ts       # IPlatform implementation
├── SchwabAccount.ts        # ITradingAccount implementation
├── schwab-types.ts         # Schwab API response type aliases
├── schwab-contracts.ts     # Contract resolution helpers (makeContract, resolveSymbol)
├── schwab-auth.ts          # Token persistence and refresh helpers
├── index.ts                # Barrel export
```

**Rationale**: Consistent structure with `providers/alpaca/` makes the codebase predictable and reduces cognitive load.

## Risks / Trade-offs

**[7-day refresh token expiry]** → Schwab refresh tokens expire after 7 days with no workaround. Users must re-authenticate periodically. Mitigation: Clear error messaging with authorization URL when token expires. Future: scheduled token refresh to maximize lifetime.

**[No sandbox/paper mode]** → All Schwab API calls hit live accounts. Mitigation: Rely on OpenAlice's existing guard system (`max-position-size`, `symbol-whitelist`) to limit risk. Document this clearly in setup guides.

**[Low npm download count for @sudowealth/schwab-api]** → 43 weekly downloads suggests a small user base. Mitigation: The library is MIT-licensed with clean source — if abandoned, it can be forked or replaced with direct HTTP calls using the same patterns. Schwab's REST API is stable and well-documented.

**[Rate limiting at 120 req/min]** → Could be hit during rapid polling or bulk operations. Mitigation: The library's built-in middleware handles rate limiting and retries. Account-level caching (positions, balances) with TTL reduces API calls.

**[OAuth complexity vs API key simplicity]** → Schwab's OAuth adds setup friction compared to Alpaca's API key model. Mitigation: One-time setup cost, documented with step-by-step instructions. Token auto-refresh minimizes ongoing friction.
