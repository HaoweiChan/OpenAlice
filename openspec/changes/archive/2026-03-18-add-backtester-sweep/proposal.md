## Why

Phase 1 (`add-backtester-core`) delivers a single-run backtester. But a single backtest is only useful if you already know the right parameters. In practice, strategy development requires testing hundreds of parameter combinations to find which settings have real edge vs. curve-fitting noise. Alice needs parameter sweep, walk-forward validation, and volume-based fill checks to produce actionable, trustworthy results.

## What Changes

- Add parameter grid search: define ranges for each parameter, run cartesian product of all combinations, rank results by Sharpe ratio
- Add walk-forward validation: split data into train/test windows, optimize on train, validate on test, report out-of-sample performance
- Add volume-based fill realism: flag trades where position size exceeds a configurable fraction of candle volume
- Add CCXT `fetchOHLCV` as an alternative data source for crypto backtesting
- Expose new MCP tools: `runParameterSweep`, `runWalkForward`

## Capabilities

### New Capabilities
- `backtester-sweep`: Parameter grid search over strategy parameter ranges with result ranking and comparison
- `backtester-validation`: Walk-forward validation to detect overfitting — train/test splits with out-of-sample metrics
- `backtester-realism`: Volume-based fill checks and enhanced execution realism

### Modified Capabilities

(none)

## Impact

- **New files**: `src/extension/backtester/sweep.ts`, `src/extension/backtester/validation.ts`, `src/extension/backtester/realism.ts`
- **Modified files**: `src/extension/backtester/adapter.ts` (add new tools), `src/extension/backtester/data.ts` (add CCXT fetchOHLCV)
- **Dependencies**: No new npm packages (CCXT already installed)
- **APIs**: 2 new MCP tools (`runParameterSweep`, `runWalkForward`)
- **Prerequisite**: `add-backtester-core` must be implemented first
