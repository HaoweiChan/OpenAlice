## ADDED Requirements

### Requirement: Trade execution logging
The performance tracker SHALL log every signal, order placement, fill, and rejection to a per-strategy file at `data/strategies/{id}.performance.json`. Each entry SHALL include timestamp, signal type, order details, fill price, and slippage.

#### Scenario: Order fills logged
- **WHEN** a market buy order for MXF fills at 20150 with expected price 20148
- **THEN** the tracker SHALL append an entry: `{ type: "fill", timestamp, symbol: "MXF", direction: "long", quantity: 1, fillPrice: 20150, expectedPrice: 20148, slippage: 2 }`

### Requirement: Rolling performance metrics
The performance tracker SHALL maintain rolling performance metrics per strategy: win rate, total PnL, Sharpe ratio (rolling 30-day), max drawdown, and trade count. These SHALL be queryable via the `strategyStatus` tool.

#### Scenario: Query strategy performance
- **WHEN** the AI calls `strategyStatus` for strategy "mxf-rsi"
- **THEN** it SHALL return: enabled status, current position, rolling win rate, rolling Sharpe, total PnL, max drawdown, total trades, and last signal time

### Requirement: Live vs backtest divergence detection
The performance tracker SHALL compare live rolling metrics against the strategy's deployment backtest metrics. If the live Sharpe ratio falls below 50% of the deployment Sharpe for more than 7 consecutive days, it SHALL emit a `strategy.divergence` event.

#### Scenario: Performance diverges from backtest
- **WHEN** strategy "mxf-rsi" had deployment Sharpe 1.2 but live rolling Sharpe is 0.4 for 8 consecutive days
- **THEN** the tracker SHALL emit a `strategy.divergence` event and notify the user: "Strategy mxf-rsi underperforming: live Sharpe 0.4 vs expected 1.2"

### Requirement: Performance reports
The performance tracker SHALL support generating a summary report for a strategy covering a specified date range. The report SHALL include: total return, win/loss count, average win/loss size, max drawdown, Sharpe ratio, and comparison to deployment expectations.

#### Scenario: Weekly performance report
- **WHEN** the user asks "how did my MXF strategy perform this week?"
- **THEN** the AI SHALL use the performance tracker to generate and present a report with all metrics for the past 7 days
