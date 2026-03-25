## Why

OpenAlice supports crypto (CCXT) and US equities (Alpaca, Schwab) but has no integration with Taiwan's financial markets. Sinopac Securities via Shioaji is the most widely-used programmatic trading API in Taiwan, supporting stocks (TSE/OTC), futures, and options. Adding Sinopac enables OpenAlice users to trade Taiwan markets through the unified `IBroker`/`IPlatform` interface.

Shioaji is Python-only (C++ core + Solace event broker). A Python sidecar bridge (FastAPI) will wrap Shioaji and expose a REST+WebSocket API that the TypeScript `SinopacBroker` calls.

## What Changes

- New `packages/sinopac/` package containing:
  - Python bridge (`bridge/`) — FastAPI server wrapping Shioaji for auth, orders, positions, quotes, historical data
  - TypeScript provider (`src/`) — `SinopacPlatform` and `SinopacBroker` implementing `IPlatform`/`IBroker`
- Platform factory extended with `type: 'sinopac'` case
- Config schema extended with `sinopacPlatformSchema` in Zod
- Sidecar lifecycle management (spawn/health-check/shutdown) in `SinopacPlatform`
- UI `SDKSelector` updated to show Sinopac as available broker

## Capabilities

### New Capabilities
- `sinopac-bridge`: Python FastAPI sidecar wrapping Shioaji — auth, contract registry, order execution, market data, streaming quotes
- `sinopac-provider`: TypeScript trading provider — `SinopacPlatform`/`SinopacBroker` implementing `IPlatform`/`IBroker`, calling the bridge via HTTP/WS

### Modified Capabilities

## Impact

- **Code**: `packages/sinopac/` (new package), `src/domain/trading/brokers/factory.ts`, `src/core/config.ts`
- **Config**: `platforms.json` gains `type: 'sinopac'` option with `bridgeUrl` and optional `bridgeAutoStart`
- **Dependencies**: Python `shioaji`, `fastapi`, `uvicorn` (bridge side); no new npm deps (uses native `fetch`)
- **UI**: `SDKSelector.tsx` updated to list Sinopac as a broker option
- **Infra**: Python sidecar process must be running for Sinopac trading (auto-spawned or externally managed)
