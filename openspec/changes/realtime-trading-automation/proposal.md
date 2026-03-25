## Why

OpenAlice can execute trades on command and backtest strategies offline, but cannot autonomously monitor live markets and act on signals. For futures trading (starting with Taiwan TAIFEX via Sinopac), the user needs a complete autonomous trading pipeline: research → strategy design → backtesting → optimization → validation → live deployment → continuous monitoring → performance review → strategy improvement. The backtester DSL, indicator engine, parameter sweep, walk-forward validation, and Sinopac broker are already implemented — the gaps are the live execution loop, Sinopac data integration for backtesting, and the autonomous strategy lifecycle that connects all these pieces.

## What Changes

**Live Trading Infrastructure:**
- Add **bar aggregation** in the Sinopac bridge: aggregate tick data into 1m/5m OHLCV bars and stream them over WebSocket
- Add **WebSocket client** in `SinopacBridgeClient` to consume real-time ticks and bars from the bridge
- Add **strategy store**: file-based CRUD for live trading strategies (symbol, timeframe, entry/exit DSL, parameters, position sizing, risk limits)
- Add **signal evaluator**: rolling-window indicator computation + DSL evaluation on each new bar close, reusing the backtester's `indicators.ts` and `dsl.ts`
- Add **market watcher**: subscribes to bar streams, runs signal evaluator per strategy, emits `market.signal` events via EventLog
- Add **signal executor**: listens for `market.signal` events, places/cancels orders through the existing `UnifiedTradingAccount` guard pipeline

**Backtester → Live Pipeline:**
- Add **Sinopac data source** to the backtester: fetch historical OHLCV from the bridge `/kbars` endpoint for Taiwan futures (MXF, TXF, etc.)
- Add **strategy lifecycle tools**: AI tools that chain backtest → parameter sweep → walk-forward validation → deployment as a single workflow
- Add **deploy-to-live** capability: validated backtest strategy auto-generates a live strategy file with optimal parameters
- Add **performance tracker**: compare live execution against backtest expectations, flag divergence

**Autonomous Strategy Intelligence:**
- Add **strategy improvement loop**: periodic review of live strategy performance, auto-run backtests on recent data, suggest parameter adjustments
- Add **strategy management tools**: AI tools for creating, enabling/disabling, inspecting, backtesting, and improving live strategies via chat
- Add **notification delivery**: push trade signals, execution confirmations, performance reports to connectors (Telegram, Web)

## Capabilities

### New Capabilities
- `live-bar-streaming`: Real-time OHLCV bar construction from tick data and delivery via WebSocket
- `strategy-store`: File-based persistence and lifecycle management for live trading strategies
- `signal-evaluator`: Rolling-window indicator computation and DSL-based signal generation on bar close
- `market-watcher`: Continuous market monitoring service that subscribes to bar streams and orchestrates signal evaluation
- `signal-executor`: Automated order execution from market signals through the existing guard pipeline
- `strategy-tools`: AI-callable tools for strategy CRUD, monitoring, and lifecycle management
- `sinopac-backtester-data`: Sinopac/Shioaji historical OHLCV data source for backtesting Taiwan futures
- `strategy-lifecycle`: Automated pipeline from backtest → optimize → validate → deploy → monitor → improve
- `performance-tracker`: Live vs backtest performance comparison and divergence detection

### Modified Capabilities
- `sinopac-bridge`: Add bar aggregation endpoint and enhanced WebSocket streaming (bars in addition to ticks)
- `sinopac-provider`: Add WebSocket client for consuming bridge streams
- `backtester-data`: Add Sinopac as a data source alongside OpenBB and CCXT

## Impact

- **New domain**: `src/domain/trading/automation/` — strategy store, signal evaluator, market watcher, signal executor, performance tracker, strategy lifecycle
- **Bridge extension**: `packages/sinopac/bridge/server.py` — bar aggregation from Shioaji tick callbacks
- **Client extension**: `src/domain/trading/brokers/sinopac/sinopac-bridge-client.ts` — WebSocket support
- **Backtester extension**: `src/extension/backtester/data.ts` — Sinopac data source
- **Tools**: `src/tool/strategy.ts` — new tool group for strategy management and lifecycle
- **Main**: `src/main.ts` — wire up market watcher, signal executor, and strategy lifecycle on startup
- **Dependencies**: `ws` package for TypeScript WebSocket client
- **Risk**: Live automated trading carries financial risk; the guard pipeline, position limits, walk-forward validation before deployment, and performance tracking mitigate this
