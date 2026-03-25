## Context

This builds on Phase 1's core backtester (`add-backtester-core`). The core engine can run a single strategy against historical candles. Phase 2 adds the tools needed to systematically find good parameters and validate they aren't overfit.

## Goals / Non-Goals

**Goals:**
- Parameter grid search with cartesian product of user-defined ranges
- Walk-forward validation with configurable train/test window sizes
- Volume-based fill realism warnings
- CCXT fetchOHLCV as alternative crypto data source
- Results ranked by Sharpe ratio with summary comparison table

**Non-Goals:**
- Bayesian or genetic optimization (grid search only for now)
- Multi-symbol portfolio-level optimization
- Real-time paper trading from backtest signals
- Machine learning-based parameter tuning

## Decisions

### D1: Grid search via cartesian product

Given `{ "rsi_oversold": [20, 25, 30], "rsi_overbought": [65, 70, 75] }`, generate all 9 combinations and run the core engine for each. Store individual results and a ranked comparison summary.

**Why over smarter search**: Grid search is transparent, reproducible, and sufficient for typical 2-4 parameter strategies. Bayesian optimization adds complexity without clear benefit for small search spaces.

### D2: Walk-forward with rolling windows

Split the data into N windows. For each window, use the first `train_pct` as training data and the remainder as test. Run parameter sweep on train, pick best params by Sharpe, validate on test. Report both in-sample and out-of-sample metrics.

**Why**: The gold standard for detecting overfitting. If in-sample Sharpe is 3.0 but out-of-sample is 0.2, the strategy is overfit.

### D3: Volume-based fill check as warnings, not rejections

Flag trades where `position_size > candle_volume * max_volume_fraction` (default 10%). Don't reject the trade — just annotate it in results. Alice can decide whether to care.

**Why**: Hard rejections would change backtest results unpredictably. Warnings let Alice reason about fill realism.

### D4: CCXT fetchOHLCV added to data.ts

Add a `ccxt` data source option that calls `exchange.fetchOHLCV()`. Requires a connected CcxtAccount. Falls back to OpenBB if CCXT unavailable.

**Why**: CCXT provides more granular crypto candle data (down to 1m) with better exchange-specific coverage than yfinance.

## Risks / Trade-offs

- **[Sweep runtime]** → Grid search with many parameters can be slow (100+ combinations × 5000 candles). Mitigation: parallel execution with Promise.all, progress callbacks.
- **[Walk-forward complexity]** → Users may not understand train/test splitting. Mitigation: sensible defaults (70/30 split, 5 windows), clear summary output.
- **[CCXT rate limits]** → Fetching many candle ranges may hit exchange rate limits. Mitigation: cache fetched data in `data/backtests/cache/`.
