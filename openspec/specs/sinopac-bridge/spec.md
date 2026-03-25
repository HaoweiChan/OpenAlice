## Purpose

Python FastAPI sidecar wrapping Shioaji for Taiwan market access. Exposes REST endpoints for authentication, contract lookup, order management, snapshot/historical market data, and a WebSocket for streaming quotes. Acts as the language bridge between OpenAlice (TypeScript) and Shioaji (Python-only).

## Requirements

### Requirement: Bridge server startup and authentication
The bridge SHALL be a FastAPI application that starts on a configurable port (default 8890) and exposes a `POST /login` endpoint. On login, the bridge SHALL call `shioaji.Shioaji().login(api_key, secret_key)` with optional `contracts_timeout=10000` and cache the authenticated `api` instance for the session.

#### Scenario: Successful login
- **WHEN** `POST /login` is called with `{ "api_key": "KEY", "secret_key": "SECRET" }`
- **THEN** the bridge SHALL return `{ "ok": true, "accounts": [...] }` with stock and futures/options accounts listed

#### Scenario: Invalid credentials
- **WHEN** `POST /login` is called with invalid credentials
- **THEN** the bridge SHALL return `{ "ok": false, "error": "<shioaji error message>" }` with HTTP 401

#### Scenario: Health check
- **WHEN** `GET /health` is called
- **THEN** the bridge SHALL return `{ "status": "ok", "logged_in": true/false }` with HTTP 200

### Requirement: Contract lookup
The bridge SHALL expose `GET /contracts/{security_type}/{code}` to look up a single contract, and `GET /contracts/search?q={pattern}` to search across all security types. Security types are `stocks`, `futures`, `options`.

#### Scenario: Stock contract lookup
- **WHEN** `GET /contracts/stocks/2330` is called
- **THEN** the bridge SHALL return the Shioaji Stock contract for TSMC with fields `code`, `symbol`, `name`, `exchange`, `limit_up`, `limit_down`, `reference`, `unit`, `day_trade`

#### Scenario: Futures contract lookup
- **WHEN** `GET /contracts/futures/TXFR1` is called
- **THEN** the bridge SHALL return the continuous near-month TAIEX futures contract

#### Scenario: Options contract lookup
- **WHEN** `GET /contracts/options/TXO18000R3` is called
- **THEN** the bridge SHALL return the option contract with `strike_price`, `option_right`, `delivery_month`

#### Scenario: Contract search
- **WHEN** `GET /contracts/search?q=2330` is called
- **THEN** the bridge SHALL return an array of matching contracts across stocks, futures, and options

### Requirement: Order placement
The bridge SHALL expose `POST /orders` accepting `{ "contract_code": str, "security_type": str, "action": "Buy"|"Sell", "price": float, "quantity": int, "price_type": str, "order_type": str }` plus optional Taiwan-specific fields (`order_cond`, `order_lot`, `octype`, `daytrade_short`).

#### Scenario: Stock limit order
- **WHEN** `POST /orders` is called with `{ "contract_code": "2890", "security_type": "stocks", "action": "Buy", "price": 17.0, "quantity": 1, "price_type": "LMT", "order_type": "ROD" }`
- **THEN** the bridge SHALL call `api.place_order()` and return the Trade object with `order.id`, `status.status`

#### Scenario: Futures market order
- **WHEN** `POST /orders` is called with `{ "contract_code": "TXFR1", "security_type": "futures", "action": "Sell", "price": 0, "quantity": 2, "price_type": "MKT", "order_type": "IOC", "octype": "Auto" }`
- **THEN** the bridge SHALL place the futures order with the correct `FuturesPriceType` and `FuturesOCType`

#### Scenario: Options order
- **WHEN** `POST /orders` is called with a contract_code matching an option symbol
- **THEN** the bridge SHALL place the order using the futures/options account (`api.futopt_account`)

### Requirement: Order modification and cancellation
The bridge SHALL expose `PUT /orders/{order_id}` for price/quantity updates and `DELETE /orders/{order_id}` for cancellation.

#### Scenario: Update order price
- **WHEN** `PUT /orders/{id}` is called with `{ "price": 17.5 }`
- **THEN** the bridge SHALL call `api.update_order(trade, price=17.5)` and return the updated Trade

#### Scenario: Reduce order quantity
- **WHEN** `PUT /orders/{id}` is called with `{ "quantity": 1 }`
- **THEN** the bridge SHALL call `api.update_order(trade, qty=1)`

#### Scenario: Cancel order
- **WHEN** `DELETE /orders/{id}` is called
- **THEN** the bridge SHALL call `api.cancel_order(trade)` and return the cancelled Trade status

### Requirement: Order and trade status
The bridge SHALL expose `GET /orders?account_type=stock|futures` to list all trades with current status. The bridge SHALL call `api.update_status(account)` before returning to ensure fresh data.

#### Scenario: List stock orders
- **WHEN** `GET /orders?account_type=stock` is called
- **THEN** the bridge SHALL return all stock trades with updated statuses (PendingSubmit, Submitted, PartFilled, Filled, Cancelled, Failed)

#### Scenario: List futures orders
- **WHEN** `GET /orders?account_type=futures` is called
- **THEN** the bridge SHALL return all futures/options trades with updated statuses

### Requirement: Snapshot quotes
The bridge SHALL expose `GET /snapshots?codes=2330,2317` to retrieve real-time snapshots for up to 500 contracts.

#### Scenario: Multiple stock snapshots
- **WHEN** `GET /snapshots?codes=2330,2317&security_type=stocks` is called
- **THEN** the bridge SHALL return an array of Snapshot objects with `open`, `high`, `low`, `close`, `volume`, `total_volume`, `buy_price`, `buy_volume`, `sell_price`, `sell_volume`

### Requirement: Historical kbars
The bridge SHALL expose `GET /kbars?code={code}&security_type={type}&start={date}&end={date}` returning 1-minute OHLCV bars.

#### Scenario: Stock kbars
- **WHEN** `GET /kbars?code=2330&security_type=stocks&start=2026-03-10&end=2026-03-15` is called
- **THEN** the bridge SHALL return `{ "ts": [...], "open": [...], "high": [...], "low": [...], "close": [...], "volume": [...] }`

#### Scenario: Futures kbars with continuous contract
- **WHEN** `GET /kbars?code=TXFR1&security_type=futures&start=2026-03-10&end=2026-03-15` is called
- **THEN** the bridge SHALL return kbar data for the continuous near-month futures contract

### Requirement: Historical ticks
The bridge SHALL expose `GET /ticks?code={code}&security_type={type}&date={date}` returning tick-level data.

#### Scenario: Stock ticks for a day
- **WHEN** `GET /ticks?code=2330&security_type=stocks&date=2026-03-15` is called
- **THEN** the bridge SHALL return `{ "ts": [...], "close": [...], "volume": [...], "bid_price": [...], "ask_price": [...], "tick_type": [...] }`

### Requirement: Streaming quotes via WebSocket
The bridge SHALL expose `WS /stream` for real-time tick, bidask, and bar subscriptions. Clients send subscribe/unsubscribe messages; the bridge forwards Shioaji quote callbacks as JSON frames. Supported `quote_type` values: `"tick"`, `"bidask"`, `"bar"`. Bar subscriptions require an additional `"timeframe"` field (e.g. "1m", "5m").

#### Scenario: Subscribe to stock ticks
- **WHEN** the client sends `{ "action": "subscribe", "code": "2330", "security_type": "stocks", "quote_type": "tick" }`
- **THEN** the bridge SHALL call `api.quote.subscribe()` and forward tick events as `{ "topic": "tick", "code": "2330", "data": {...} }`

#### Scenario: Subscribe to bidask
- **WHEN** the client sends `{ "action": "subscribe", "code": "2330", "security_type": "stocks", "quote_type": "bidask" }`
- **THEN** the bridge SHALL forward bidask updates with 5-level order book data

#### Scenario: Subscribe to bar stream
- **WHEN** a client sends `{ "action": "subscribe", "code": "MXF", "security_type": "futures", "quote_type": "bar", "timeframe": "5m" }`
- **THEN** the bridge SHALL start a bar aggregator for MXF at 5m intervals and push completed bars to the client as `{ "topic": "bar", "timeframe": "5m", "code": "MXF", "data": { "timestamp", "open", "high", "low", "close", "volume" } }`

#### Scenario: Invalid bar subscription (missing timeframe)
- **WHEN** a client sends `{ "action": "subscribe", "quote_type": "bar" }` without a `"timeframe"` field
- **THEN** the bridge SHALL respond with `{ "action": "error", "detail": "timeframe required for bar subscriptions" }`

#### Scenario: Unsubscribe
- **WHEN** the client sends `{ "action": "unsubscribe", "code": "2330", "quote_type": "tick" }`
- **THEN** the bridge SHALL stop forwarding tick events for that contract

### Requirement: Account information
The bridge SHALL expose `GET /accounts` listing all available accounts, and `GET /accounts/{account_type}/positions` for position data (once Shioaji exposes it via `api.list_positions()` or equivalent).

#### Scenario: List accounts
- **WHEN** `GET /accounts` is called
- **THEN** the bridge SHALL return stock and futures accounts with `person_id`, `broker_id`, `account_id`, `signed` status

### Requirement: Graceful shutdown
The bridge SHALL handle `SIGTERM` and `SIGINT` by calling `api.logout()` before exiting.

#### Scenario: Shutdown signal
- **WHEN** the bridge receives SIGTERM
- **THEN** the bridge SHALL call `api.logout()`, close all WebSocket connections, and exit cleanly
