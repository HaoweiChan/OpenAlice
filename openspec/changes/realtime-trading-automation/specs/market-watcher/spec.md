## ADDED Requirements

### Requirement: Continuous market monitoring service
The market watcher SHALL be a long-running service started in `main.ts`. It SHALL load all enabled strategies from the strategy store, group them by broker + symbol + timeframe, connect to each broker's bar stream, and dispatch bar events to the signal evaluator.

#### Scenario: Service starts with enabled strategies
- **WHEN** OpenAlice starts with 2 enabled strategies (MXF 5m and TXF 1m)
- **THEN** the market watcher SHALL connect to the Sinopac bridge WebSocket and subscribe to MXF 5m bars and TXF 1m bars

#### Scenario: No enabled strategies
- **WHEN** all strategies are disabled
- **THEN** the market watcher SHALL remain idle with no active WebSocket connections

### Requirement: Market hours awareness
The market watcher SHALL respect market trading hours. For TAIFEX futures: day session 08:45–13:45 TWD, night session 15:00–05:00 TWD. Outside trading hours, the watcher SHALL pause monitoring and disconnect bar streams. It SHALL automatically resume before the next session opens.

#### Scenario: Day session ends
- **WHEN** the clock reaches 13:45 TWD and only day-session strategies are active
- **THEN** the market watcher SHALL unsubscribe from bar streams and disconnect until the next session

### Requirement: Graceful reconnection
The market watcher SHALL automatically reconnect to the bridge WebSocket if the connection drops. On reconnect, it SHALL re-seed the rolling window from historical data and resubscribe to all active bar streams.

#### Scenario: Bridge restarts
- **WHEN** the Sinopac bridge process restarts
- **THEN** the market watcher SHALL detect the disconnection, wait for the bridge to become healthy, reconnect, seed historical bars, and resume monitoring

### Requirement: Strategy lifecycle events
The market watcher SHALL react to strategy store changes. When a strategy is enabled, it SHALL start monitoring. When disabled or deleted, it SHALL stop. When updated, it SHALL apply new parameters on the next bar.

#### Scenario: Strategy enabled at runtime
- **WHEN** strategy "mxf-rsi" is enabled while the market watcher is running
- **THEN** the watcher SHALL subscribe to the required bar stream (if not already), seed the rolling window, and begin evaluating on the next bar close
