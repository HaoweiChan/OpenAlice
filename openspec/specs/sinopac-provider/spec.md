## Purpose

TypeScript trading provider for Sinopac/Shioaji. Implements `IPlatform` and `IBroker` interfaces, communicating with the Python bridge sidecar via HTTP/WebSocket. Supports Taiwan stocks (TSE/OTC), futures (TAIFEX), and options with proper contract mapping and order type translation.

## Requirements

### Requirement: Sinopac platform configuration
The system SHALL accept a platform configuration with `type: 'sinopac'` in `platforms.json` containing:
- `id` (string, required): unique platform identifier
- `label` (string, optional): display name, defaults to `'Sinopac'`
- `type` (literal `'sinopac'`, required): platform type discriminator
- `bridgeUrl` (string, optional): URL of the Python bridge, defaults to `'http://localhost:8890'`
- `bridgeAutoStart` (boolean, optional): whether to auto-spawn the bridge process, defaults to `false`
- `accountType` (enum, optional): `'stock'`, `'futures'`, or `'both'`, defaults to `'both'`

The Zod schema `sinopacPlatformSchema` SHALL be added to the `platformConfigSchema` discriminated union.

#### Scenario: Sinopac platform created from config
- **WHEN** `platforms.json` contains `{ "id": "sinopac-main", "type": "sinopac" }`
- **THEN** `createPlatformFromConfig` SHALL return a `SinopacPlatform` instance with `providerType` equal to `'sinopac'`

#### Scenario: Platform factory handles all types
- **WHEN** `platforms.json` contains entries with `type: 'ccxt'`, `type: 'alpaca'`, and `type: 'sinopac'`
- **THEN** each SHALL create the correct platform class without errors

#### Scenario: Custom bridge URL
- **WHEN** `platforms.json` contains `{ "id": "sinopac-main", "type": "sinopac", "bridgeUrl": "http://192.168.1.10:8890" }`
- **THEN** `SinopacPlatform` SHALL connect to the specified bridge URL

### Requirement: Account credentials mapping
The system SHALL map `accounts.json` credentials to Shioaji authentication:
- `apiKey` → Shioaji API Key
- `apiSecret` → Shioaji Secret Key

#### Scenario: Credentials passed to bridge login
- **WHEN** `SinopacBroker.init()` is called with credentials `{ apiKey: 'KEY', apiSecret: 'SECRET' }`
- **THEN** the broker SHALL call `POST {bridgeUrl}/login` with `{ "api_key": "KEY", "secret_key": "SECRET" }`

### Requirement: Bridge lifecycle management
`SinopacPlatform` SHALL manage the bridge sidecar lifecycle:
- On `init()`, check bridge health via `GET /health`
- If `bridgeAutoStart: true` and bridge is not running, spawn `uvicorn` as a child process and poll `/health` until ready (timeout: 30s)
- On `close()`, if the bridge was auto-started, send SIGTERM to the child process

#### Scenario: Bridge already running
- **WHEN** `init()` is called and `GET /health` returns `{ "status": "ok" }`
- **THEN** the platform SHALL proceed without spawning a new process

#### Scenario: Auto-start bridge
- **WHEN** `init()` is called with `bridgeAutoStart: true` and the bridge is not running
- **THEN** the platform SHALL spawn `uvicorn packages/sinopac/bridge/server:app --port 8890` and wait for health check

#### Scenario: Bridge not running, auto-start disabled
- **WHEN** `init()` is called with `bridgeAutoStart: false` and the bridge is not running
- **THEN** the platform SHALL throw an error with message containing `'Bridge not available'` and instructions to start it manually

### Requirement: Contract mapping
The system SHALL map Shioaji contracts to OpenAlice `Contract` and `ContractDescription` types:
- `aliceId`: `'sinopac-{code}'`
- `symbol`: Shioaji `code` field (e.g., `'2890'`, `'TXFA3'`, `'TXO18000R3'`)
- `secType`: `'STK'` for stocks, `'FUT'` for futures, `'OPT'` for options
- `exchange`: `'TSE'` / `'OTC'` for stocks, `'TAIFEX'` for futures/options
- `currency`: `'TWD'`
- For options: `strike`, `right` mapped from Shioaji's `strike_price`, `option_right`

#### Scenario: Stock contract mapped
- **WHEN** the bridge returns a stock contract with `code: '2890', exchange: 'TSE', name: '永豐金'`
- **THEN** `searchContracts` SHALL return a `ContractDescription` with `contract.symbol: '2890'`, `contract.secType: 'STK'`, `contract.exchange: 'TSE'`, `contract.currency: 'TWD'`

#### Scenario: Futures contract mapped
- **WHEN** the bridge returns a futures contract with `code: 'TXFA3', category: 'TXF'`
- **THEN** the mapped contract SHALL have `secType: 'FUT'`, `exchange: 'TAIFEX'`

#### Scenario: Options contract mapped
- **WHEN** the bridge returns an options contract with `strike_price: 18000, option_right: 'P'`
- **THEN** the mapped contract SHALL have `secType: 'OPT'`, `strike: 18000`, `right: 'P'`

### Requirement: Search contracts
`SinopacBroker.searchContracts(pattern)` SHALL call `GET {bridgeUrl}/contracts/search?q={pattern}` and map results to `ContractDescription[]`.

#### Scenario: Search by ticker
- **WHEN** `searchContracts('2330')` is called
- **THEN** the broker SHALL return at least one `ContractDescription` with `contract.symbol` equal to `'2330'`

#### Scenario: Search returns futures
- **WHEN** `searchContracts('TXF')` is called
- **THEN** the broker SHALL return futures contracts with `secType: 'FUT'`

#### Scenario: Empty search result
- **WHEN** `searchContracts('XYZNONEXISTENT')` is called
- **THEN** the broker SHALL return an empty array

### Requirement: Contract details
`SinopacBroker.getContractDetails(contract)` SHALL call `GET {bridgeUrl}/contracts/{securityType}/{code}` and map to `ContractDetails`.

#### Scenario: Stock details returned
- **WHEN** `getContractDetails({ symbol: '2330', secType: 'STK' })` is called
- **THEN** the broker SHALL return `ContractDetails` with `longName` containing `'台積電'` or `'TSMC'`

#### Scenario: Unknown symbol
- **WHEN** `getContractDetails({ symbol: 'XYZNONEXISTENT' })` is called
- **THEN** the broker SHALL return `null`

### Requirement: Place order
`SinopacBroker.placeOrder(contract, order)` SHALL map the OpenAlice `Order` to Shioaji format and call `POST {bridgeUrl}/orders`.

Order mapping:
- `order.action 'BUY'` → `action: 'Buy'`; `'SELL'` → `action: 'Sell'`
- `order.orderType 'LMT'` → `price_type: 'LMT'`; `'MKT'` → `price_type: 'MKT'`
- `order.tif 'DAY'` → `order_type: 'ROD'`; if not specified, default `'ROD'`
- `order.totalQuantity` → `quantity`
- `order.lmtPrice` → `price`
- `contract.secType 'STK'` → `security_type: 'stocks'`; `'FUT'` → `'futures'`; `'OPT'` → `'options'`

#### Scenario: Stock limit buy
- **WHEN** `placeOrder({ symbol: '2890', secType: 'STK' }, { action: 'BUY', orderType: 'LMT', lmtPrice: 17, totalQuantity: 1 })` is called
- **THEN** the broker SHALL return `{ success: true, orderId: '<trade_id>' }`

#### Scenario: Futures market sell
- **WHEN** `placeOrder({ symbol: 'TXFR1', secType: 'FUT' }, { action: 'SELL', orderType: 'MKT', totalQuantity: 2 })` is called
- **THEN** the broker SHALL call the bridge with `price_type: 'MKT'` and `octype: 'Auto'`

#### Scenario: Order rejected
- **WHEN** the bridge returns an error (market closed, insufficient funds)
- **THEN** the broker SHALL return `{ success: false, error: '<error message>' }`

### Requirement: Modify order
`SinopacBroker.modifyOrder(orderId, changes)` SHALL call `PUT {bridgeUrl}/orders/{orderId}`.

#### Scenario: Modify price
- **WHEN** `modifyOrder(orderId, { lmtPrice: 17.5 })` is called
- **THEN** the broker SHALL call `PUT /orders/{id}` with `{ "price": 17.5 }`

### Requirement: Cancel order
`SinopacBroker.cancelOrder(orderId)` SHALL call `DELETE {bridgeUrl}/orders/{orderId}`.

#### Scenario: Cancel pending order
- **WHEN** `cancelOrder(orderId)` is called for a cancellable order
- **THEN** the broker SHALL return `true`

#### Scenario: Cancel already-filled order
- **WHEN** `cancelOrder(orderId)` is called for a filled order
- **THEN** the broker SHALL return `false`

### Requirement: Close position
`SinopacBroker.closePosition(contract, quantity?)` SHALL place a counter-order to close the position.

#### Scenario: Close stock position
- **WHEN** `closePosition({ symbol: '2890', secType: 'STK' })` is called and the user holds shares
- **THEN** the broker SHALL place a market sell order for the full position quantity

### Requirement: Get account info
`SinopacBroker.getAccount()` SHALL aggregate account information from the bridge.

#### Scenario: Account info retrieved
- **WHEN** `getAccount()` is called
- **THEN** the broker SHALL return `AccountInfo` with `netLiquidation`, `totalCashValue`, `unrealizedPnL`, `realizedPnL`

### Requirement: Get positions
`SinopacBroker.getPositions()` SHALL retrieve current holdings from the bridge.

#### Scenario: Positions returned
- **WHEN** `getPositions()` is called and the account holds TSMC shares
- **THEN** the broker SHALL return a `Position[]` including an entry with `contract.symbol: '2330'`

#### Scenario: No positions
- **WHEN** `getPositions()` is called and the account has no holdings
- **THEN** the broker SHALL return an empty array

### Requirement: Get orders
`SinopacBroker.getOrders(orderIds)` SHALL retrieve orders from the bridge and map Shioaji statuses:
- `PendingSubmit`, `PreSubmitted`, `Submitted` → OpenAlice pending
- `Filled` → filled
- `PartFilled` → partially filled
- `Cancelled` → cancelled
- `Failed` → rejected

#### Scenario: Orders with status mapping
- **WHEN** `getOrders([])` is called (all orders)
- **THEN** the broker SHALL return `OpenOrder[]` with Shioaji statuses correctly mapped

### Requirement: Get quote
`SinopacBroker.getQuote(contract)` SHALL call `GET {bridgeUrl}/snapshots?codes={code}&security_type={type}` and map to `Quote`.

#### Scenario: Stock quote
- **WHEN** `getQuote({ symbol: '2330', secType: 'STK' })` is called
- **THEN** the broker SHALL return `Quote` with `last`, `bid`, `ask`, `volume`, `high`, `low` populated from snapshot

### Requirement: Market clock
`SinopacBroker.getMarketClock()` SHALL return Taiwan market hours:
- Stocks: 09:00–13:30 (Asia/Taipei)
- Futures: 08:45–13:45 (day), 15:00–05:00+1 (night)

#### Scenario: Market open during stock hours
- **WHEN** `getMarketClock()` is called at 10:00 Asia/Taipei on a weekday
- **THEN** the broker SHALL return `{ isOpen: true, nextClose: <13:30 today> }`

#### Scenario: Market closed
- **WHEN** `getMarketClock()` is called at 14:00 Asia/Taipei on a weekday
- **THEN** the broker SHALL return `{ isOpen: false, nextOpen: <09:00 next trading day> }`

### Requirement: Capabilities
The broker SHALL report:
- `supportedSecTypes: ['STK', 'FUT', 'OPT']`
- `supportedOrderTypes: ['LMT', 'MKT', 'MKP']`

#### Scenario: Capabilities queried
- **WHEN** `getCapabilities()` is called
- **THEN** the broker SHALL return STK, FUT, and OPT as supported security types

### Requirement: Bridge client WebSocket support
The `SinopacBridgeClient` SHALL support WebSocket connections to the bridge `/stream` endpoint. It SHALL expose methods to subscribe to bar streams, receive bar events via callback, and automatically reconnect on disconnection.

#### Scenario: Subscribe to bar stream
- **WHEN** the client calls `subscribeBars("MXF", "futures", "5m", callback)`
- **THEN** it SHALL open a WebSocket connection (if not already open), send a subscribe message, and invoke the callback on each received bar

#### Scenario: WebSocket disconnects
- **WHEN** the WebSocket connection drops unexpectedly
- **THEN** the client SHALL attempt to reconnect with exponential backoff (1s, 2s, 4s, max 30s) and resubscribe to all active subscriptions

#### Scenario: Unsubscribe from bar stream
- **WHEN** the client calls `unsubscribeBars("MXF", "futures", "5m")`
- **THEN** it SHALL send an unsubscribe message and remove the callback

### Requirement: Error handling
The broker SHALL handle bridge communication errors:
- Bridge unreachable → throw with `'Bridge not available'` and reconnection instructions
- HTTP 401 → throw with `'Authentication failed'`
- HTTP 5xx → throw with bridge error message
- Network timeout → retry once, then throw

#### Scenario: Bridge down
- **WHEN** any broker method is called and the bridge is unreachable
- **THEN** the broker SHALL throw an error containing `'Bridge not available'`
