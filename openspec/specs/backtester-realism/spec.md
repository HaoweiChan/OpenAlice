## Purpose

Volume-based fill realism checks and CCXT historical data source for more accurate backtesting results.

## Requirements

### Requirement: Volume-based fill warning
The system SHALL check each simulated trade against candle volume. If `position_size_value > candle_volume * max_volume_fraction`, the trade SHALL be annotated with a `volume_warning` flag.

#### Scenario: Large trade flagged
- **WHEN** a trade uses $100,000 notional on a candle with $50,000 volume and `max_volume_fraction = 0.1`
- **THEN** the trade SHALL have `volume_warning = true` and a message indicating the trade exceeds 10% of candle volume

#### Scenario: Normal trade not flagged
- **WHEN** a trade uses $1,000 notional on a candle with $1,000,000 volume
- **THEN** the trade SHALL have `volume_warning = false`

### Requirement: Volume warning summary
The backtest summary SHALL include a `volume_warnings` count and percentage of trades that triggered volume warnings.

#### Scenario: Warning percentage in summary
- **WHEN** a backtest produces 100 trades with 15 volume warnings
- **THEN** the summary SHALL report `volume_warnings: 15` and `volume_warning_pct: 0.15`

### Requirement: CCXT OHLCV data source
The data layer SHALL support fetching candles via CCXT `fetchOHLCV` as an alternative to OpenBB SDK, using the connected CcxtAccount's exchange instance.

#### Scenario: CCXT crypto candles fetched
- **WHEN** `fetchHistoricalOhlcv` is called with `dataSource = "ccxt"` and a connected exchange
- **THEN** the system SHALL use `exchange.fetchOHLCV()` to fetch candle data

#### Scenario: CCXT unavailable falls back to OpenBB
- **WHEN** `dataSource = "ccxt"` but no CcxtAccount is connected
- **THEN** the system SHALL fall back to OpenBB SDK and log a warning
