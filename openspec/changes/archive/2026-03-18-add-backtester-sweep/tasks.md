## 1. Parameter Grid Search

- [x] 1.1 Create `src/extension/backtester/sweep.ts` with `runParameterSweep(baseStrategy, parameterRanges, options, candles)` function
- [x] 1.2 Implement cartesian product generator for parameter ranges
- [x] 1.3 Implement parallel backtest execution across combinations using Promise.all with concurrency limit
- [x] 1.4 Implement result ranking by Sharpe ratio with comparison summary table
- [x] 1.5 Write sweep results to `data/backtests/{name}_sweep_{timestamp}.json`

## 2. Walk-Forward Validation

- [x] 2.1 Create `src/extension/backtester/validation.ts` with `runWalkForward(strategy, parameterRanges, validationOptions, candles)` function
- [x] 2.2 Implement rolling window splitter (N windows, configurable train/test ratio)
- [x] 2.3 Implement per-window optimize-then-validate loop
- [x] 2.4 Implement aggregate summary with overfitting score (out-of-sample / in-sample Sharpe ratio)

## 3. Volume Realism

- [x] 3.1 Create `src/extension/backtester/realism.ts` with volume-based fill warning logic
- [x] 3.2 Integrate volume warnings into the core engine's trade recording
- [x] 3.3 Add `volume_warnings` and `volume_warning_pct` to backtest metrics summary

## 4. CCXT Data Source

- [x] 4.1 Add CCXT `fetchOHLCV` wrapper to `src/extension/backtester/data.ts`
- [x] 4.2 Implement `dataSource` parameter (`"openbb"` | `"ccxt"`) with fallback logic
- [x] 4.3 Add candle data caching to `data/backtests/cache/` to avoid redundant fetches

## 5. MCP Tool Integration

- [x] 5.1 Add `runParameterSweep` tool to `adapter.ts` with Zod schema validation
- [x] 5.2 Add `runWalkForward` tool to `adapter.ts` with Zod schema validation
- [x] 5.3 Update `fetchHistoricalOhlcv` tool to accept optional `dataSource` parameter
- [x] 5.4 Verify all new tools appear in tool inventory and are callable via MCP
