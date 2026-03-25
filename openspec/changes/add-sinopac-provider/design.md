## Context

Shioaji is the primary programmatic trading API for Taiwan markets (Sinopac Securities). It supports stocks (TSE/OTC), futures (TAIFEX), and options, with both REST-style queries and streaming market data via Solace mesh broker.

The SDK is Python-only — no TypeScript client exists. The underlying protocol is proprietary (C++ core + FPGA event broker), so a direct port to TypeScript is impractical. A cross-language bridge is required.

## Goals / Non-Goals

**Goals:**
- Full `IBroker`/`IPlatform` implementation for Sinopac covering stocks, futures, and options
- Python sidecar (FastAPI) that wraps Shioaji and exposes REST + WebSocket endpoints
- Sidecar lifecycle management (auto-spawn, health check, graceful shutdown)
- Contract mapping between Shioaji's contract model (TSE/OTC codes, futures symbols, option chains) and OpenAlice's IBKR-aligned `Contract` type
- Order type support for Taiwan market specifics: LMT/MKT/MKP, ROD/IOC/FOK, Cash/MarginTrading/ShortSelling, odd lots
- Historical OHLCV (kbars) and tick data accessible for backtesting
- Streaming quotes forwarded via WebSocket

**Non-Goals:**
- Custom UI for Taiwan market features (use existing trading UI)
- Options chain visualization or strategy builder
- Sinopac bank account integration (only brokerage)
- Replacing Shioaji internals or reverse-engineering the Solace protocol

## Decisions

### Decision 1: Python sidecar over MCP or subprocess IPC

**Chosen:** FastAPI sidecar communicating via HTTP/WebSocket.

**Alternatives considered:**
- **MCP server**: OpenAlice has MCP infrastructure, but MCP's tool-oriented protocol is awkward for streaming quotes and stateful sessions. MCP tools are designed for request/response, not long-lived subscriptions.
- **Subprocess IPC (stdin/stdout JSON-RPC)**: Tightly coupled lifecycle, but fragile — Python buffering issues, hard to debug, can't run independently.
- **Direct REST if Sinopac has one**: No public REST API exists; Shioaji IS the API layer.

**Rationale:** FastAPI is the natural fit because:
1. Shioaji's streaming quotes (Solace callbacks) need a long-running process — a sidecar handles this naturally
2. REST endpoints map cleanly to `IBroker` methods (place_order → POST /orders, etc.)
3. WebSocket for streaming quotes is standard and well-supported in both Python and Node.js
4. The sidecar can run independently (docker, systemd) or be auto-spawned by OpenAlice
5. Health checks and graceful shutdown are trivial with FastAPI

### Decision 2: Contract ID scheme

Sinopac uses different ID formats per security type:
- Stocks: `TSE2890`, `OTC5871`
- Futures: `TXF202301`, `TXFR1` (continuous)
- Options: `TXO20230618000P`

OpenAlice's `Contract` type (from `@traderalice/ibkr`) uses `symbol`, `secType`, `exchange`, `currency`.

**Mapping:**
- `aliceId`: `sinopac-{code}` (e.g., `sinopac-2890`, `sinopac-TXFA3`, `sinopac-TXO18000R3`)
- `symbol`: The Shioaji `code` field (e.g., `2890`, `TXFA3`)
- `secType`: `STK` for stocks, `FUT` for futures, `OPT` for options
- `exchange`: `TSE`, `OTC`, or `TAIFEX`
- `currency`: `TWD`

### Decision 3: Account type separation

Shioaji returns separate `StockAccount` and `FutureAccount` objects. Each has its own `broker_id` and `account_id`.

**Approach:** A single `SinopacBroker` instance exposes both stock and futures/options accounts. The broker auto-selects the correct Shioaji account based on `secType` when placing orders. Config specifies `accountType: 'stock' | 'futures' | 'both'` (default: `'both'`).

### Decision 4: Order mapping

| OpenAlice `Order` field | Shioaji mapping |
|------------------------|-----------------|
| `orderType: 'LMT'` | `price_type: StockPriceType.LMT` / `FuturesPriceType.LMT` |
| `orderType: 'MKT'` | `price_type: StockPriceType.MKT` / `FuturesPriceType.MKT` |
| `action: 'BUY'` | `action: Action.Buy` |
| `action: 'SELL'` | `action: Action.Sell` |
| `tif: 'DAY'` | `order_type: OrderType.ROD` |
| `tif: 'IOC'` | `order_type: OrderType.IOC` |
| `tif: 'FOK'` | `order_type: OrderType.FOK` |
| `totalQuantity` | `quantity` (in lots for stocks, contracts for futures) |

Taiwan-specific fields (`order_cond`, `order_lot`, `octype`, `daytrade_short`) are passed via `Order.auxPrice` or a custom extension field, or default to sensible values (Cash, Common lot, Auto).

### Decision 5: Bridge auto-start

`SinopacPlatform.init()` behavior:
1. Try to connect to `bridgeUrl` (default: `http://localhost:8890`)
2. If bridge is running → use it
3. If bridge is not running and `bridgeAutoStart: true` → spawn `uvicorn` as child process, wait for health check
4. If bridge is not running and `bridgeAutoStart: false` → throw with instructions

This mirrors IBKR's TWS Gateway pattern.

## Risks / Trade-offs

- **Python dependency**: Users need Python 3.8+ with `shioaji` installed. Docker image mitigates this.
- **Sidecar latency**: HTTP round-trip adds ~1-5ms per call. Acceptable for order placement, not for HFT (but Shioaji isn't designed for HFT either).
- **Shioaji session limits**: Sinopac limits concurrent connections. The bridge must be singleton per account.
- **Token expiry**: Shioaji sessions can timeout. Bridge needs reconnection logic.
- **Market hours**: Taiwan stock market 09:00-13:30, futures night session until 05:00 next day. The bridge and MarketClock must handle both.
