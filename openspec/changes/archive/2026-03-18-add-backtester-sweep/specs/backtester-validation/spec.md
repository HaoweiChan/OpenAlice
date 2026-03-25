## ADDED Requirements

### Requirement: Walk-forward window splitting
The system SHALL split historical data into N rolling windows. Each window has a training portion and a test portion based on `train_pct` (default 0.7).

#### Scenario: 5 windows with 70/30 split
- **WHEN** walk-forward is run with `windows = 5` and `train_pct = 0.7` on 1000 candles
- **THEN** the system SHALL create 5 overlapping windows, each using 70% for training and 30% for testing

### Requirement: Per-window optimization
For each window, the system SHALL:
1. Run parameter sweep on the training portion
2. Select the best parameters by Sharpe ratio
3. Run a single backtest on the test portion using those parameters
4. Record both in-sample and out-of-sample metrics

#### Scenario: Overfitting detected
- **WHEN** in-sample Sharpe averages 2.5 but out-of-sample averages 0.3
- **THEN** the summary SHALL flag potential overfitting (out-of-sample Sharpe < 50% of in-sample)

### Requirement: Walk-forward summary
The system SHALL produce a summary containing:
- Per-window: best params, in-sample metrics, out-of-sample metrics
- Aggregate: average out-of-sample Sharpe, return, drawdown
- Overfitting score: ratio of out-of-sample to in-sample Sharpe

#### Scenario: Summary produced
- **WHEN** walk-forward completes
- **THEN** the summary SHALL contain per-window and aggregate metrics

### Requirement: MCP tool exposure
The `runWalkForward` function SHALL be exposed as an MCP tool.

#### Scenario: Tool callable by Alice
- **WHEN** Alice calls `runWalkForward` with strategy, parameter_ranges, and validation options
- **THEN** the tool SHALL execute walk-forward and return the summary
