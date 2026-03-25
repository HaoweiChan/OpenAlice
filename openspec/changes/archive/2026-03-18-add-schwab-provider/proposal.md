## Why

OpenAlice supports crypto (via CCXT) and US equities (via Alpaca), but has no integration with Charles Schwab — one of the largest US retail brokerages. Adding Schwab as a native provider enables users to trade equities and options through their existing Schwab accounts, using the same unified `ITradingAccount` interface. A mature TypeScript client (`@sudowealth/schwab-api`) now exists, making this feasible without cross-language bridges.

## What Changes

- New `SchwabPlatform` and `SchwabAccount` classes implementing `IPlatform` / `ITradingAccount`
- Platform factory extended with `type: 'schwab'` case
- Config schema extended with `schwabPlatformSchema` in Zod
- OAuth 2.0 token lifecycle management (persist, refresh, re-auth flow)
- Schwab-specific contract resolution helpers (`schwab-contracts.ts`)
- Schwab-specific type definitions for API response shapes (`schwab-types.ts`)
- New npm dependency: `@sudowealth/schwab-api`
- UI `SDKSelector` updated to show Schwab as available (currently shows IBKR as "coming soon")

## Capabilities

### New Capabilities
- `schwab-provider`: Schwab trading provider — OAuth lifecycle, account management, order placement, market data, and position tracking through the Schwab Trader API

### Modified Capabilities

## Impact

- **Code**: `src/extension/trading/providers/schwab/` (new directory), `platform-factory.ts`, `src/core/config.ts`
- **Config**: `platforms.json` gains `type: 'schwab'` option; new `schwab-tokens-{id}.json` files for OAuth state
- **Dependencies**: `@sudowealth/schwab-api` added to `package.json`
- **UI**: `SDKSelector.tsx` updated to list Schwab as a broker option
- **Auth**: Unlike API-key brokers, Schwab requires browser-based OAuth consent — `init()` must handle the token-not-found case gracefully with setup instructions
