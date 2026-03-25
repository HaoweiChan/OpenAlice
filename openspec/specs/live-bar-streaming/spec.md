## Purpose

Bar aggregation and streaming from the Sinopac Python bridge. The bridge aggregates raw Shioaji tick events into OHLCV bars at configurable timeframes (1m, 5m) and delivers completed bars to TypeScript clients via the `/stream` WebSocket. Enables the realtime trading automation engine to receive market data without polling.

## Requirements

### Requirement: Bar aggregation from tick data
The bridge SHALL aggregate incoming Shioaji tick events into OHLCV bars at configurable timeframes (1m, 5m). A bar SHALL close when the timeframe boundary is reached. The completed bar MUST contain timestamp (bar open time), open, high, low, close, and volume fields.

#### Scenario: 1-minute bar completes
- **WHEN** the bridge has received ticks for symbol MXF between 09:00:00 and 09:00:59
- **THEN** at 09:01:00 it SHALL emit a completed 1m bar with the OHLCV values from those ticks

#### Scenario: No ticks in bar period
- **WHEN** no ticks arrive during a bar period
- **THEN** the bridge SHALL NOT emit a bar for that period

### Requirement: Bar streaming via WebSocket
The bridge SHALL support a `quote_type: "bar"` subscription on the existing `/stream` WebSocket endpoint. Clients MUST provide a `timeframe` parameter (e.g. "1m", "5m"). On bar close, the bridge SHALL push a message: `{ "topic": "bar", "timeframe": "<tf>", "code": "<symbol>", "data": { "timestamp", "open", "high", "low", "close", "volume" } }`.

#### Scenario: Client subscribes to 5m bars
- **WHEN** a WebSocket client sends `{ "action": "subscribe", "code": "MXF", "security_type": "futures", "quote_type": "bar", "timeframe": "5m" }`
- **THEN** the bridge SHALL begin aggregating ticks for MXF into 5m bars and push completed bars to that client

#### Scenario: Multiple timeframe subscriptions
- **WHEN** client A subscribes to 1m bars and client B subscribes to 5m bars for the same symbol
- **THEN** the bridge SHALL maintain separate aggregators and push bars at both intervals

### Requirement: Bar aggregation lifecycle
The bridge SHALL only aggregate bars for symbols that have at least one active subscription. When the last subscriber for a symbol+timeframe disconnects, the aggregator for that combination SHALL be stopped.

#### Scenario: Last subscriber disconnects
- **WHEN** the only client subscribed to MXF 1m bars disconnects
- **THEN** the bridge SHALL stop the MXF 1m bar aggregator and free resources
