## ADDED Requirements

### Requirement: Fetch historical OHLCV candles
The system SHALL fetch historical OHLCV (open, high, low, close, volume) candle data for a given symbol, date range, and interval using existing OpenBB SDK clients.

#### Scenario: Fetch equity candles
- **WHEN** `fetchHistoricalOhlcv` is called with `symbol = "AAPL"`, `assetClass = "equity"`, `interval = "1d"`, `startDate`, `endDate`
- **THEN** the system SHALL return an array of candle objects with `timestamp`, `open`, `high`, `low`, `close`, `volume` fields

#### Scenario: Fetch crypto candles
- **WHEN** `fetchHistoricalOhlcv` is called with `symbol = "BTC/USD"`, `assetClass = "crypto"`, `interval = "1h"`
- **THEN** the system SHALL return crypto candle data from the OpenBB crypto client

#### Scenario: Fetch currency candles
- **WHEN** `fetchHistoricalOhlcv` is called with `symbol = "EUR/USD"`, `assetClass = "currency"`, `interval = "1d"`
- **THEN** the system SHALL return currency candle data from the OpenBB currency client

### Requirement: Auto-detect asset class from symbol
The system SHALL auto-detect asset class when `assetClass` is not provided:
- Symbols containing `/` with known crypto bases (BTC, ETH, SOL, etc.) → `crypto`
- Symbols containing `/` with known fiat codes (EUR, GBP, JPY, etc.) → `currency`
- All other symbols → `equity`

#### Scenario: BTC/USD detected as crypto
- **WHEN** `symbol = "BTC/USD"` and `assetClass` is omitted
- **THEN** the system SHALL use the crypto client

#### Scenario: AAPL detected as equity
- **WHEN** `symbol = "AAPL"` and `assetClass` is omitted
- **THEN** the system SHALL use the equity client

### Requirement: Candle data format
Each candle object SHALL contain:
- `timestamp` (number): Unix epoch seconds
- `open` (number): opening price
- `high` (number): highest price
- `low` (number): lowest price
- `close` (number): closing price
- `volume` (number): trading volume

#### Scenario: Timestamps are Unix seconds
- **WHEN** candle data is returned
- **THEN** all timestamps SHALL be Unix epoch seconds (not milliseconds, not ISO strings)

### Requirement: Data validation
The system SHALL validate returned data and handle edge cases:
- Empty results → return error with message
- Missing volume → default to 0
- Candles not sorted → sort by timestamp ascending

#### Scenario: Empty data returns error
- **WHEN** the data provider returns no candles for the given parameters
- **THEN** the system SHALL return an error object with `{ success: false, error: "..." }`

### Requirement: MCP tool exposure
The `fetchHistoricalOhlcv` function SHALL be exposed as an MCP tool named `fetchHistoricalOhlcv` with parameters: `symbol`, `interval`, `startDate`, `endDate`, `assetClass` (optional).

#### Scenario: Tool callable by Alice
- **WHEN** Alice calls `fetchHistoricalOhlcv` via MCP
- **THEN** the tool SHALL return candle data or an error object
