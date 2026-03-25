## Tasks

### Phase 1: Data Foundation

#### 1. Sinopac data source for backtester
- [x] 1.1 Add `DataSource = 'sinopac'` to `src/extension/backtester/data.ts`
- [x] 1.2 Implement `fetchViaSinopac()` — call bridge `/kbars`, convert parallel arrays to `Candle[]`, normalize timestamps
- [x] 1.3 Add Taiwan futures symbol detection in `detectAssetClass()` (MXF, TXF, EXF, FXF + month code variants)
- [x] 1.4 Add `getSinopacClient` parameter to `createBacktestTools()` in `adapter.ts`
- [x] 1.5 Wire Sinopac bridge client into backtester tools in `main.ts`
- [x] 1.6 Test: `runBacktest` with MXF on Sinopac data

#### 2. Bridge bar aggregation (Python)
- [x] 2.1 Create `packages/sinopac/bridge/bar_aggregator.py` — `BarAggregator` class: accumulate ticks into OHLCV bars, emit on timeframe boundary
- [x] 2.2 Extend `/stream` WebSocket handler to accept `quote_type: "bar"` with `timeframe` parameter
- [x] 2.3 Wire Shioaji tick callbacks to `BarAggregator` — on each tick, update active bar; on bar close, push to subscribed clients
- [x] 2.4 Manage aggregator lifecycle — create on first subscribe, destroy on last unsubscribe per symbol+timeframe

#### 3. Bridge client WebSocket (TypeScript)
- [x] 3.1 Add `ws` dependency to the project
- [x] 3.2 Add WebSocket methods to `SinopacBridgeClient`: `connectStream()`, `subscribeBars(code, secType, timeframe, callback)`, `unsubscribeBars()`, `disconnectStream()`
- [x] 3.3 Implement auto-reconnect with exponential backoff and subscription replay
- [x] 3.4 Add `subscribeTicks()` and `subscribeBidask()` for completeness

### Phase 2: Strategy Engine

#### 4. Strategy store
- [x] 4.1 Create `src/domain/trading/automation/strategy-store.ts` — `StrategyStore` class with CRUD, Zod schema validation, file I/O at `data/strategies/`
- [x] 4.2 Define `LiveStrategyDef` type (extends backtester's StrategyDef with broker, maxPosition, enabled, deployment metadata)
- [x] 4.3 Add `fs.watch` hot reload and change event emitter
- [x] 4.4 Create `data/strategies/` directory on startup if not exists

#### 5. Signal evaluator
- [x] 5.1 Create `src/domain/trading/automation/signal-evaluator.ts` — `SignalEvaluator` class with rolling window per symbol+timeframe
- [x] 5.2 Reuse backtester's `computeIndicatorSeries()` for indicator calculation on the rolling window
- [x] 5.3 Reuse backtester's `evaluateExpression()` for entry/exit condition evaluation
- [x] 5.4 Warmup logic: fetch historical bars from bridge REST `/kbars` to seed the rolling window on startup/reconnect
- [x] 5.5 Position-aware context: set `position_open`, `stop_loss_hit`, `take_profit_hit` based on current account state

#### 6. Market watcher
- [x] 6.1 Create `src/domain/trading/automation/market-watcher.ts` — `MarketWatcher` class orchestrating strategy loading, WebSocket subscriptions, signal evaluation
- [x] 6.2 Group strategies by broker + symbol + timeframe to share subscriptions
- [x] 6.3 On bar close: feed bar to signal evaluator, collect signals, emit `market.signal` events via EventLog
- [x] 6.4 Market hours awareness — pause/resume based on `getMarketClock()` (TAIFEX day 08:45–13:45, night 15:00–05:00)
- [x] 6.5 React to strategy store change events (enable/disable/update)
- [x] 6.6 WebSocket reconnection with rolling window re-seed from historical data

#### 7. Signal executor
- [x] 7.1 Create `src/domain/trading/automation/signal-executor.ts` — subscribe to `market.signal` events on EventLog
- [x] 7.2 Resolve target account, validate maxPosition, place order through UnifiedTradingAccount
- [x] 7.3 Log executions to event log and notify via connector center
- [x] 7.4 Handle order rejections (guard pipeline, broker errors) — log and notify

### Phase 3: Strategy Lifecycle

#### 8. Performance tracker
- [x] 8.1 Create `src/domain/trading/automation/performance-tracker.ts` — per-strategy performance log at `data/strategies/{id}.performance.json`
- [x] 8.2 Record every signal, order, fill, rejection with timestamps and slippage
- [x] 8.3 Compute rolling metrics: win rate, PnL, Sharpe (30-day rolling), max drawdown
- [x] 8.4 Live vs backtest divergence detection: emit `strategy.divergence` event when live Sharpe < 50% of deployment Sharpe for 7+ days
- [x] 8.5 Performance report generation for date ranges

#### 9. Strategy lifecycle tools
- [x] 9.1 Create `src/tool/strategy.ts` — register CRUD tools: `strategyCreate`, `strategyList`, `strategyEnable`, `strategyDisable`, `strategyDelete`, `strategyUpdate`
- [x] 9.2 Add `strategyStatus` — current position, rolling window state, indicator values, performance metrics
- [x] 9.3 Add `strategyDesign` — orchestrate: propose DSL → backtest on Sinopac data → parameter sweep → walk-forward validation → present results
- [x] 9.4 Add `strategyDeploy` — validated strategy → live strategy file with deployment metadata (reject if walk-forward score < threshold)
- [x] 9.5 Add `strategyReEvaluate` — re-test strategy on recent data, compare metrics against deployment baseline
- [x] 9.6 Add `strategyImprove` — sweep parameters on recent data, present top alternatives
- [x] 9.7 Add `strategyPerformance` — generate performance report for date range
- [x] 9.8 Register all tools in `main.ts` via ToolCenter

### Phase 4: Integration

#### 10. Wiring and startup
- [x] 10.1 Wire `StrategyStore`, `MarketWatcher`, `SignalExecutor`, `PerformanceTracker` in `main.ts`
- [x] 10.2 Start market watcher after all brokers are initialized
- [x] 10.3 Add `automation` section to config schema for global settings (default timeframe, max concurrent strategies, walk-forward threshold)
- [x] 10.4 Graceful shutdown: disconnect WebSockets, stop watcher on SIGTERM

#### 11. Periodic improvement cycle
- [x] 11.1 Add cron job template for daily strategy re-evaluation (configurable schedule)
- [x] 11.2 Divergence listener: on `strategy.divergence` event, trigger re-evaluation and notify user with report
- [x] 11.3 Optional: auto-pause strategies that fail re-evaluation (user must re-enable)
