## MODIFIED Requirements

### Requirement: Bridge client WebSocket support
The `SinopacBridgeClient` SHALL support WebSocket connections to the bridge `/stream` endpoint. It SHALL expose methods to subscribe to bar streams, receive bar events via an async iterable or callback, and automatically reconnect on disconnection.

#### Scenario: Subscribe to bar stream
- **WHEN** the client calls `subscribeBars("MXF", "futures", "5m", callback)`
- **THEN** it SHALL open a WebSocket connection (if not already open), send a subscribe message, and invoke the callback on each received bar

#### Scenario: WebSocket disconnects
- **WHEN** the WebSocket connection drops unexpectedly
- **THEN** the client SHALL attempt to reconnect with exponential backoff (1s, 2s, 4s, max 30s) and resubscribe to all active subscriptions

#### Scenario: Unsubscribe from bar stream
- **WHEN** the client calls `unsubscribeBars("MXF", "futures", "5m")`
- **THEN** it SHALL send an unsubscribe message and remove the callback
