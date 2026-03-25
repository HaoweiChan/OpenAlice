## Why

OpenAlice can analyze markets and execute trades via LLM reasoning, but has no way to validate whether a trading strategy actually works on historical data. Without backtesting, any strategy Alice proposes is an untested theory. This is the single biggest gap between "research assistant" and "useful trading agent." Alice herself identified this need and defined the interface she wants.

## What Changes

- Add a new `backtester` extension (`src/extension/backtester/`) that provides backtesting capabilities to Alice via MCP tools
- Implement a core backtesting engine that iterates over historical OHLCV candles, evaluates entry/exit conditions via a simple DSL, and simulates trade execution with realistic slippage and fees
- Reuse existing analysis-kit indicators (RSI, EMA, SMA, BBANDS, MACD, ATR) to compute indicator series over historical data
- Expose OHLCV data fetching as a standalone tool (via existing OpenBB SDK clients)
- Persist backtest results as JSONL trade logs and JSON summary files under `data/backtests/`
- Register backtester tools in `src/main.ts` so Alice can call them from any connector (web, Telegram, MCP)

## Capabilities

### New Capabilities
- `backtester-engine`: Core backtest execution — run a strategy definition against historical candles, simulate fills with slippage/fees, produce trade log and performance metrics (Sharpe, drawdown, win rate, profit factor, equity curve)
- `backtester-data`: Historical OHLCV data fetching for backtesting — fetch candles via OpenBB SDK for equity, crypto, and currency, with interval and date range support
- `backtester-dsl`: Simple expression DSL for strategy entry/exit logic — evaluate conditions like `RSI_14 < 30 && close > EMA_20` against indicator-enriched candle data

### Modified Capabilities

(none — this is entirely new functionality)

## Impact

- **New files**: `src/extension/backtester/` (types, engine, indicators, data, dsl, io, adapter, index)
- **Modified files**: `src/main.ts` (register backtester tools)
- **New runtime directory**: `data/backtests/` (created on first use)
- **Dependencies**: No new npm packages — reuses existing `decimal.js`, analysis-kit indicators, and OpenBB SDK clients
- **APIs**: 3 new MCP tools (`runBacktest`, `fetchHistoricalOhlcv`, `listBacktests`)
