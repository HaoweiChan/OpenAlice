## 1. Python Bridge — Core

- [x] 1.1 Create `packages/sinopac/bridge/` directory with `requirements.txt` (`shioaji`, `fastapi`, `uvicorn`, `websockets`)
- [x] 1.2 Implement `server.py` — FastAPI app with `POST /login`, `GET /health`, and CORS middleware
- [x] 1.3 Implement `GET /contracts/{security_type}/{code}` and `GET /contracts/search?q={pattern}` — lookup across stocks, futures, options
- [x] 1.4 Implement `POST /orders` — place stock/futures/options orders with full Shioaji field mapping
- [x] 1.5 Implement `PUT /orders/{id}` (price/qty update) and `DELETE /orders/{id}` (cancel)
- [x] 1.6 Implement `GET /orders?account_type=stock|futures` — list trades with `api.update_status()` before returning
- [x] 1.7 Implement `GET /snapshots?codes=...&security_type=...` — batch snapshot quotes (up to 500)
- [x] 1.8 Implement `GET /kbars?code=...&security_type=...&start=...&end=...` — historical OHLCV bars
- [x] 1.9 Implement `GET /ticks?code=...&security_type=...&date=...` — historical tick data
- [x] 1.10 Implement `GET /accounts` — list stock and futures accounts
- [x] 1.11 Add SIGTERM/SIGINT handler calling `api.logout()` before exit

## 2. Python Bridge — Streaming

- [x] 2.1 Implement `WS /stream` endpoint — WebSocket handler with subscribe/unsubscribe messages
- [x] 2.2 Wire Shioaji `@api.quote.on_quote` callback to forward tick/bidask events to connected WebSocket clients
- [x] 2.3 Handle client disconnect — unsubscribe from Shioaji quotes for that client's subscriptions

## 3. Python Bridge — Packaging

- [x] 3.1 Create `Dockerfile` for the bridge (Python 3.10+, shioaji, uvicorn)
- [x] 3.2 Add `README.md` with setup instructions (pip install, docker run, environment variables)

## 4. TypeScript Provider — Config

- [x] 4.1 Add `sinopacPlatformSchema` to `src/core/config.ts` with `type: 'sinopac'`, `bridgeUrl`, `bridgeAutoStart`, `accountType`
- [x] 4.2 Add `sinopacPlatformSchema` to the `platformConfigSchema` discriminated union

## 5. TypeScript Provider — Platform and Factory

- [x] 5.1 Create `src/domain/trading/brokers/sinopac/SinopacPlatform.ts` implementing `IPlatform` with bridge health check and optional auto-start
- [x] 5.2 Add `case 'sinopac'` to `createPlatformFromConfig` in `factory.ts`
- [x] 5.3 Create `src/domain/trading/brokers/sinopac/index.ts` re-exporting platform and broker

## 6. TypeScript Provider — Broker

- [x] 6.1 Create `src/domain/trading/brokers/sinopac/SinopacBroker.ts` implementing `IBroker` — constructor, `init()`, `close()`
- [x] 6.2 Implement `searchContracts()` and `getContractDetails()` — call bridge, map to `ContractDescription[]` and `ContractDetails`
- [x] 6.3 Create `sinopac-contracts.ts` — helper functions for mapping Shioaji contracts to OpenAlice `Contract` format (stock, futures, options)
- [x] 6.4 Implement `placeOrder()` — map OpenAlice `Order` to Shioaji format, call `POST /orders`
- [x] 6.5 Implement `modifyOrder()` — call `PUT /orders/{id}`
- [x] 6.6 Implement `cancelOrder()` — call `DELETE /orders/{id}`
- [x] 6.7 Implement `closePosition()` — fetch current position, place counter-order
- [x] 6.8 Implement `getAccount()` — call bridge, map to `AccountInfo`
- [x] 6.9 Implement `getPositions()` — call bridge, map to `Position[]`
- [x] 6.10 Implement `getOrders()` and `getOrder()` — call bridge, map Shioaji statuses to `OpenOrder[]`
- [x] 6.11 Implement `getQuote()` — call snapshots endpoint, map to `Quote`
- [x] 6.12 Implement `getMarketClock()` — Taiwan market hours logic (stocks 09:00–13:30, futures day+night sessions)
- [x] 6.13 Implement `getCapabilities()` — return STK/FUT/OPT and LMT/MKT/MKP
- [x] 6.14 Create `sinopac-types.ts` — TypeScript types for bridge API request/response shapes

## 7. TypeScript Provider — Bridge Client

- [x] 7.1 Create `sinopac-bridge-client.ts` — HTTP client class wrapping `fetch` calls to bridge endpoints with error handling, retry, timeout
- [x] 7.2 Add health check polling logic used by `SinopacPlatform.init()`
- [x] 7.3 Add WebSocket client for `/stream` endpoint (subscribe/unsubscribe/event handling)

## 8. UI

- [x] 8.1 Update `ui/src/components/SDKSelector.tsx` to include Sinopac as an available broker option

## 9. Tests

- [x] 9.1 Unit tests for `sinopac-contracts.ts` — contract mapping (stock, futures, options)
- [x] 9.2 Unit tests for `SinopacBroker` — mock bridge responses, verify IBroker method mapping
- [x] 9.3 Unit tests for `SinopacPlatform` — config parsing, health check logic
- [x] 9.4 Integration test script for the Python bridge (can be a pytest or manual test script)
