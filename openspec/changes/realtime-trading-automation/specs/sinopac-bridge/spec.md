## MODIFIED Requirements

### Requirement: WebSocket streaming endpoint
The bridge `/stream` WebSocket endpoint SHALL support `quote_type` values of `"tick"`, `"bidask"`, and `"bar"`. When `quote_type` is `"bar"`, the client MUST also provide a `"timeframe"` field (e.g. "1m", "5m"). The bridge SHALL aggregate ticks into bars for subscribed symbols and push completed bars on the WebSocket.

#### Scenario: Subscribe to bar stream
- **WHEN** a client sends `{ "action": "subscribe", "code": "MXF", "security_type": "futures", "quote_type": "bar", "timeframe": "5m" }`
- **THEN** the bridge SHALL start a bar aggregator for MXF at 5m intervals and push completed bars to the client

#### Scenario: Subscribe to tick stream (unchanged)
- **WHEN** a client sends `{ "action": "subscribe", "code": "MXF", "security_type": "futures", "quote_type": "tick" }`
- **THEN** the bridge SHALL push raw tick data as before

#### Scenario: Invalid bar subscription (missing timeframe)
- **WHEN** a client sends `{ "action": "subscribe", "quote_type": "bar" }` without a `"timeframe"` field
- **THEN** the bridge SHALL respond with `{ "action": "error", "detail": "timeframe required for bar subscriptions" }`
