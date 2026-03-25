## MODIFIED Requirements

### Requirement: Data source selection
The backtester data layer SHALL support three data sources: `"openbb"` (default), `"ccxt"` (exchange-native crypto), and `"sinopac"` (Taiwan futures via Shioaji bridge). The `fetchOhlcv` function SHALL accept `dataSource` as a parameter and route to the appropriate fetcher.

#### Scenario: Fetch with Sinopac data source
- **WHEN** the AI calls `fetchHistoricalOhlcv` with dataSource "sinopac" and symbol "MXF"
- **THEN** the data layer SHALL call the Sinopac bridge `/kbars` endpoint and return normalized candles

#### Scenario: Auto-detect data source for Taiwan futures
- **WHEN** the AI calls `fetchHistoricalOhlcv` with symbol "TXF" and no explicit dataSource
- **THEN** the data layer SHALL detect it as a Taiwan futures symbol and use the Sinopac data source

#### Scenario: Sinopac bridge not available, fallback
- **WHEN** dataSource is "sinopac" but the bridge is not running
- **THEN** the data layer SHALL return `{ success: false, error: "Sinopac bridge unavailable at <bridgeUrl>" }`
