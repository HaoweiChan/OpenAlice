## Purpose

Parameter grid search for backtesting — run a strategy across all combinations of parameter ranges and rank results by performance metrics.

## Requirements

### Requirement: Parameter range definition
The system SHALL accept parameter ranges as a JSON object mapping parameter names to arrays of values:
```json
{ "parameter_ranges": { "rsi_oversold": [20, 25, 30, 35], "rsi_overbought": [65, 70, 75, 80] } }
```

#### Scenario: Valid ranges accepted
- **WHEN** parameter_ranges contains arrays of numbers for known strategy parameters
- **THEN** the system SHALL compute the cartesian product of all combinations

#### Scenario: Empty ranges rejected
- **WHEN** parameter_ranges is empty or contains an empty array
- **THEN** the system SHALL return an error

### Requirement: Cartesian product execution
The system SHALL generate all combinations from parameter ranges and run the core backtest engine for each combination using the same historical data and base strategy config.

#### Scenario: 2 parameters with 4 values each
- **WHEN** two parameters each have 4 possible values
- **THEN** the system SHALL run 16 backtests (4 x 4)

#### Scenario: Results include parameter values
- **WHEN** a sweep completes
- **THEN** each result entry SHALL include the parameter combination used alongside the metrics

### Requirement: Ranked results output
The system SHALL rank all parameter combinations by Sharpe ratio (descending) and return a summary containing:
- Ranked list of all combinations with key metrics (Sharpe, total_return, max_drawdown, win_rate, total_trades)
- Best combination highlighted
- Total combinations tested and total runtime

#### Scenario: Best parameters identified
- **WHEN** a sweep of 16 combinations completes
- **THEN** the result SHALL identify the combination with the highest Sharpe ratio as the best

### Requirement: Sweep results persistence
The system SHALL write sweep results to `data/backtests/{strategy_name}_sweep_{timestamp}.json` containing the ranked results and all individual summaries.

#### Scenario: Sweep file written
- **WHEN** a parameter sweep completes
- **THEN** a JSON file SHALL be written to `data/backtests/` with all results

### Requirement: MCP tool exposure
The `runParameterSweep` function SHALL be exposed as an MCP tool with parameters: strategy config (without fixed parameters), parameter_ranges, and backtest options.

#### Scenario: Tool callable by Alice
- **WHEN** Alice calls `runParameterSweep` with ranges and a base strategy
- **THEN** the tool SHALL run all combinations and return the ranked summary
