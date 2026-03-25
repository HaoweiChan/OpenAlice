## ADDED Requirements

### Requirement: Rolling window indicator computation
The signal evaluator SHALL maintain a rolling window of OHLCV bars per symbol+timeframe. On each new bar, it SHALL recompute indicators (RSI, SMA, EMA, BBANDS, MACD, ATR) using the backtester's indicator functions. The window size MUST be at least max(indicator periods) + 50 bars.

#### Scenario: New bar arrives and indicators update
- **WHEN** a new 5m bar for MXF is received and the rolling window has 200 bars
- **THEN** the evaluator SHALL append the bar, drop the oldest if over capacity, and recompute all referenced indicators

#### Scenario: Insufficient warmup bars
- **WHEN** a strategy references RSI_14 but only 10 bars are in the window
- **THEN** the evaluator SHALL skip signal evaluation and log a warmup status

### Requirement: DSL-based signal generation
The signal evaluator SHALL evaluate the strategy's entry/exit DSL expressions against the current bar's indicator context using the backtester's `evaluateExpression`. It SHALL produce a signal of type entry-long, entry-short, exit-long, or exit-short.

#### Scenario: Entry condition met
- **WHEN** the strategy's `entryLong` expression evaluates to true and no long position is open
- **THEN** the evaluator SHALL emit a `market.signal` event with direction "long" and action "entry"

#### Scenario: Exit condition met while position is open
- **WHEN** the strategy's `exitLong` expression evaluates to true and a long position is held
- **THEN** the evaluator SHALL emit a `market.signal` event with direction "long" and action "exit"

### Requirement: Warmup from historical data
On startup or WebSocket reconnect, the signal evaluator SHALL seed the rolling window by fetching historical bars from the bridge REST `/kbars` endpoint. This ensures indicators are ready before the first live bar arrives.

#### Scenario: Market watcher starts during trading hours
- **WHEN** the market watcher starts and MXF is in a 5m strategy
- **THEN** the evaluator SHALL fetch the last 250 bars of 5m data from `/kbars` and populate the rolling window before accepting live bars
