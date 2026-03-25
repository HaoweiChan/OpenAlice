## Purpose

Sinopac-specific data source integration for the backtester. Fetches historical OHLCV data from the Sinopac Python bridge for Taiwan futures and stocks, enabling backtesting on Shioaji market data.

## Requirements

### Requirement: Sinopac data source for backtester
The backtester SHALL support `dataSource: "sinopac"` as a data source option. When selected, it SHALL fetch historical OHLCV data from the Sinopac bridge `/kbars` endpoint, convert the array-format response to `Candle[]`, and cache results identically to other data sources.

#### Scenario: Backtest Taiwan futures with Sinopac data
- **WHEN** the AI calls `runBacktest` with symbol "MXF", timeframe "5m", and dataSource "sinopac"
- **THEN** the backtester SHALL fetch kbars from the Sinopac bridge and run the backtest on that data

#### Scenario: Sinopac bridge unavailable
- **WHEN** the Sinopac bridge is not running and dataSource "sinopac" is requested
- **THEN** the backtester SHALL return an error: "Sinopac bridge unavailable"

### Requirement: Taiwan futures asset class detection
The `detectAssetClass` function SHALL recognize Taiwan futures symbols (TXF, MXF, EXF, FXF, and variants with month codes) and route them to the Sinopac data source when no explicit data source is specified.

#### Scenario: Auto-detect MXF as Taiwan futures
- **WHEN** the AI calls `runBacktest` with symbol "MXF" and no explicit dataSource
- **THEN** the backtester SHALL auto-detect it as a Taiwan futures symbol and use the Sinopac data source

### Requirement: Sinopac kbars response normalization
The data layer SHALL convert Sinopac kbars response format `{ ts: [], open: [], high: [], low: [], close: [], volume: [] }` (parallel arrays) into an array of `Candle` objects sorted by timestamp in ascending order.

#### Scenario: kbars with nanosecond timestamps
- **WHEN** the bridge returns timestamps in nanoseconds
- **THEN** the normalizer SHALL convert them to Unix seconds (matching the backtester's Candle format)
