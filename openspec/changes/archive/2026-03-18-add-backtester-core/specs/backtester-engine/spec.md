## ADDED Requirements

### Requirement: Strategy definition format
The system SHALL accept a strategy definition as a JSON object with the following fields:
- `name` (string, required): strategy identifier
- `symbol` (string, required): trading pair or ticker (e.g., `BTC/USD`, `AAPL`)
- `timeframe` (string, required): candle interval (`1m`, `5m`, `15m`, `1h`, `1d`)
- `assetClass` (string, optional): `equity`, `crypto`, or `currency` (auto-detected from symbol if omitted)
- `parameters` (object, required): key-value pairs for indicator parameters and thresholds
- `entry_logic` (string, required): DSL expression evaluated per candle to determine entry
- `exit_logic` (string, required): DSL expression evaluated per candle to determine exit
- `direction` (string, optional): `long` (default), `short`, or `both`

#### Scenario: Valid strategy accepted
- **WHEN** a strategy definition with all required fields is provided
- **THEN** the engine SHALL parse it without error and proceed to execution

#### Scenario: Missing required field rejected
- **WHEN** a strategy definition is missing `name`, `symbol`, `timeframe`, `parameters`, `entry_logic`, or `exit_logic`
- **THEN** the engine SHALL return an error identifying the missing field

### Requirement: Backtest execution options
The system SHALL accept execution options:
- `capital` (number, required): starting capital
- `slippage_bps` (number, default 5): slippage in basis points applied to fill price
- `commission_pct` (number, default 0.001): commission as fraction of trade value
- `leverage` (number, default 1): position leverage multiplier
- `start_date` (string, optional): ISO date to start backtesting
- `end_date` (string, optional): ISO date to end backtesting

#### Scenario: Default options used when omitted
- **WHEN** execution options omit `slippage_bps`, `commission_pct`, or `leverage`
- **THEN** the engine SHALL use default values (5 bps, 0.1%, 1x)

### Requirement: Candle-by-candle execution loop
The engine SHALL iterate through historical candles chronologically. For each candle, the engine SHALL:
1. Compute all indicator values needed by entry/exit logic
2. Skip the candle if any required indicator has insufficient lookback data
3. If no position is open, evaluate `entry_logic`; if true, open a position
4. If a position is open, evaluate `exit_logic`; if true, close the position
5. Record trade entry/exit with prices, sizes, PnL

#### Scenario: Entry triggered
- **WHEN** no position is open and `entry_logic` evaluates to true
- **THEN** the engine SHALL open a position at the candle's close price adjusted by slippage, sized by `capital * parameters.position_size * leverage`

#### Scenario: Exit triggered
- **WHEN** a position is open and `exit_logic` evaluates to true
- **THEN** the engine SHALL close the position at the candle's close price adjusted by slippage, deduct commission, and record the trade

#### Scenario: Stop loss and take profit
- **WHEN** `parameters.stop_loss_pct` or `parameters.take_profit_pct` is defined
- **THEN** the engine SHALL set `stop_loss_hit` and `take_profit_hit` variables based on unrealized PnL relative to entry price, usable in `exit_logic`

### Requirement: Slippage simulation
The engine SHALL apply slippage to fill prices:
- For buy orders: `fill_price = close * (1 + slippage_bps / 10000)`
- For sell orders: `fill_price = close * (1 - slippage_bps / 10000)`

#### Scenario: Slippage applied to entry and exit
- **WHEN** a trade is executed with `slippage_bps = 10`
- **THEN** buy fills SHALL be 0.1% above close and sell fills SHALL be 0.1% below close

### Requirement: Commission deduction
The engine SHALL deduct commission from each trade:
- `commission = abs(trade_value) * commission_pct`
- Commission is deducted from realized PnL

#### Scenario: Commission reduces profit
- **WHEN** a round-trip trade has gross PnL of $100 and `commission_pct = 0.001`
- **THEN** net PnL SHALL be $100 minus commissions on both entry and exit

### Requirement: Performance metrics output
The engine SHALL compute and return:
- `total_return`: (final_equity - initial_capital) / initial_capital
- `sharpe_ratio`: annualized Sharpe (assuming 252 trading days for daily, 365*24 for hourly)
- `max_drawdown`: maximum peak-to-trough decline in equity curve
- `win_rate`: winning_trades / total_trades
- `profit_factor`: gross_profit / gross_loss
- `total_trades`: count of completed round-trip trades
- `equity_curve`: array of `{ timestamp, value }` snapshots at each candle

#### Scenario: Metrics computed for completed backtest
- **WHEN** a backtest completes with at least one trade
- **THEN** all metrics SHALL be computed and returned in the result object

#### Scenario: No trades generated
- **WHEN** entry_logic never triggers during the backtest period
- **THEN** the engine SHALL return zero trades, total_return of 0, and the equity curve flat at initial capital

### Requirement: Trade log output
Each completed trade SHALL be recorded with:
- `entry_time`, `exit_time` (Unix timestamps)
- `entry_price`, `exit_price` (fill prices after slippage)
- `size` (position size)
- `pnl` (net PnL after commission)
- `pnl_pct` (percentage return)
- `win` (boolean)
- `direction` (`long` or `short`)

#### Scenario: Trade log contains all fields
- **WHEN** a backtest completes with trades
- **THEN** each trade entry SHALL contain all specified fields with correct values
