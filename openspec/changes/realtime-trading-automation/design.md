## Context

OpenAlice has a complete backtester (DSL expression parser, indicator engine, parameter sweep, walk-forward validation, volume realism checks) and fully-implemented Sinopac broker (place/cancel/modify orders, positions, quotes). The Sinopac bridge streams tick/bidask data over WebSocket and serves historical kbars via REST. The backtester currently supports OpenBB and CCXT data sources but not Sinopac.

The gap is threefold: (1) a live trading loop that connects market data → signals → orders, (2) Sinopac data integration so the backtester works with Taiwan futures, and (3) an autonomous strategy lifecycle where OpenAlice designs, tests, validates, deploys, monitors, and iteratively improves strategies.

## Goals / Non-Goals

**Goals:**
- Autonomous futures trading on Sinopac/TAIFEX (extensible to other brokers later)
- Reuse backtester DSL, indicators, sweep, and walk-forward for both backtesting and live evaluation
- Sinopac kbars as a first-class backtester data source for Taiwan futures
- Full strategy lifecycle: design → backtest → sweep → walk-forward → deploy → monitor → review → improve
- AI-driven strategy design using backtester tools and market intelligence
- File-driven strategy definitions matching OpenAlice's architecture
- Real-time bar streaming (1m, 5m) from tick data
- Performance tracking: live vs backtest divergence detection
- Trade notifications and performance reports via existing connectors

**Non-Goals:**
- Sub-second HFT latency (bar-close evaluation is fast enough)
- Multi-broker arbitrage
- Custom indicator code (only built-in set: RSI, EMA, SMA, BBANDS, MACD, ATR)
- Options strategies (futures only for v1)
- External quant skill dependencies for v1 (banana-farmer, arxiv-watcher are optional enhancements)

## Decisions

### 1. Bar aggregation: bridge-side (Python) vs client-side (TypeScript)

**Decision: Bridge-side.** The bridge already receives Shioaji tick callbacks. Aggregating in Python avoids streaming every tick over WebSocket (high bandwidth for TAIFEX mini futures at ~1000 ticks/min). The bridge emits completed bars.

**Alternative — Client-side TS aggregation:** Would require streaming all ticks to TS. More flexible but wasteful. Rejected for bandwidth and simplicity.

### 2. Streaming transport: WebSocket bar events on existing `/stream`

**Decision: Extend the existing `/stream` WebSocket endpoint** with a new subscription type `quote_type: "bar"` and a `timeframe` parameter. When a bar closes, the bridge pushes `{ "topic": "bar", "timeframe": "1m", "data": { "timestamp", "open", "high", "low", "close", "volume" } }`. Multiple timeframes can be subscribed simultaneously.

### 3. Signal evaluation: direct rule engine (no AI in the loop)

**Decision: Direct evaluation.** On each bar close, the signal evaluator computes indicators on a rolling window and evaluates the strategy DSL. If the expression is true, it emits a `market.signal` event. No AI inference step — the DSL is deterministic.

**Alternative — AI-in-the-loop:** Route signals through `agentCenter.ask()` for LLM judgment. Adds 1-5s latency per signal, costs tokens, and undermines deterministic strategies. Reserved for a future "AI advisor" mode.

### 4. Strategy store: file-based JSON in `data/strategies/`

**Decision: One JSON file per strategy** at `data/strategies/{id}.json`. Contains: symbol, securityType, timeframe, broker, direction, entry/exit DSL expressions, parameters, maxPosition, risk limits, enabled flag, and deployment metadata (source backtest, validation score).

**Format:**
```json
{
  "id": "mxf-rsi-mean-revert",
  "symbol": "MXF",
  "securityType": "futures",
  "timeframe": "5m",
  "broker": "sinopac-main",
  "direction": "both",
  "entryLong": "RSI_14 < 30 && close > EMA_20",
  "exitLong": "RSI_14 > 70 || stop_loss_hit",
  "entryShort": "RSI_14 > 70 && close < EMA_20",
  "exitShort": "RSI_14 < 30 || stop_loss_hit",
  "parameters": {
    "position_size": 1,
    "stop_loss_pct": 0.02,
    "take_profit_pct": 0.04
  },
  "maxPosition": 5,
  "enabled": true,
  "deployment": {
    "backtestId": "mxf-rsi_20260318_1234",
    "walkForwardScore": 0.72,
    "deployedAt": "2026-03-18T10:00:00Z"
  }
}
```

### 5. Sinopac data source for backtester

**Decision: Add `DataSource = 'sinopac'` to `data.ts`.** Implement `fetchViaSinopac()` that calls the bridge `/kbars` endpoint, converts array-format response to `Candle[]`, and caches results. Pass a `getSinopacClient` factory into `createBacktestTools()` alongside the existing OpenBB and CCXT clients.

**Symbol detection:** Add `detectAssetClass` support for Taiwan futures codes (MXF, TXF, EXF, FXF, etc.) mapping to a new `'futures'` asset class that routes to the Sinopac data source.

### 6. Strategy lifecycle: backtest → optimize → validate → deploy

**Decision: `strategyDesign` tool orchestration.** The AI can chain existing backtester tools in sequence:

1. **Design**: AI proposes entry/exit DSL based on market analysis or user request
2. **Backtest**: `runBacktest` with proposed strategy on Sinopac historical data
3. **Optimize**: `runParameterSweep` over key parameters
4. **Validate**: `runWalkForward` to check for overfitting (reject if score < 0.5)
5. **Deploy**: `strategyDeploy` writes a live strategy file with optimal params + validation metadata
6. **Monitor**: Market watcher begins real-time evaluation

This uses existing backtester tools — no new engine needed. The `strategyDeploy` tool bridges backtester output to live strategy store.

### 7. Performance tracking and improvement

**Decision: File-based performance log at `data/strategies/{id}.performance.json`.** Records:
- Every signal and trade execution with timestamps
- Running PnL, win rate, Sharpe (rolling window)
- Comparison against backtest expectations

**Improvement cycle:** A periodic review (cron or heartbeat-triggered) where the AI:
1. Reads performance data for each enabled strategy
2. Identifies underperformance (live Sharpe << backtest Sharpe)
3. Re-runs backtest on recent data to check if market regime changed
4. Proposes parameter adjustments or strategy pause
5. Notifies the user with a report

This is AI-in-the-loop for improvement (not execution), which is appropriate for slow, deliberate decisions.

### 8. Execution pipeline: signal → guards → order

**Decision:** Signal executor receives `market.signal` events and:
1. Checks strategy is still enabled
2. Checks current position (avoid duplicate entries)
3. Passes through the existing `UnifiedTradingAccount` guard pipeline
4. Places order via broker
5. Logs execution to event log and performance tracker
6. Notifies via connector center

### 9. Market watcher lifecycle

**Decision:** The market watcher is a long-running service started in `main.ts`. It loads enabled strategies, connects to bridge WebSocket, subscribes to bar streams, and dispatches bars to the signal evaluator.

**Graceful degradation:** If WebSocket disconnects, falls back to REST polling via the signal evaluator's warmup mechanism. Reconnects automatically.

## Risks / Trade-offs

- **[Risk] Bridge restart loses bar state** → Seed rolling window from REST `/kbars` on WebSocket reconnect
- **[Risk] Signal fires during high volatility, bad fill** → LMT orders with slippage tolerance; `maxPosition` guard
- **[Risk] Overfitting in parameter sweep** → Walk-forward validation gate required before deployment (score >= 0.5)
- **[Risk] Market regime change degrades live strategy** → Performance tracker detects divergence; periodic re-evaluation via cron
- **[Risk] Backtester data quality for Taiwan futures** → Sinopac kbars may have gaps; volume realism checks apply
- **[Risk] Autonomous improvement changes strategy without user awareness** → All changes require user approval via notification; auto-pause only, no auto-modify

## Open Questions

1. Rolling window size: how many bars to keep? (Proposed: max indicator period + 50 buffer, e.g. 250 bars)
2. Should strategy hot-reload require a restart or use fs.watch? (Proposed: fs.watch)
3. Minimum walk-forward score threshold for auto-deploy? (Proposed: 0.5, configurable per strategy)
4. How often should the improvement cycle run? (Proposed: daily during off-market hours)
