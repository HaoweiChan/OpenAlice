## 1. Types and Foundation

- [x] 1.1 Create `src/extension/backtester/types.ts` with StrategyDef, BacktestOptions, BacktestResult, TradeEntry, BacktestMetrics, EquityCurvePoint, CandleWithIndicators interfaces
- [x] 1.2 Create `src/extension/backtester/index.ts` exporting `createBacktestTools()`

## 2. Expression DSL

- [x] 2.1 Create `src/extension/backtester/dsl.ts` with tokenizer (identifiers, numbers, operators, parens)
- [x] 2.2 Implement recursive-descent parser producing AST nodes (BinaryOp, UnaryOp, Comparison, Literal, Identifier)
- [x] 2.3 Implement evaluator that takes AST + context object and returns boolean
- [x] 2.4 Implement indicator variable name parser (extract indicator type and period from names like `RSI_14`, `BBANDS_upper`)

## 3. Indicator Series

- [x] 3.1 Create `src/extension/backtester/indicators.ts` that wraps analysis-kit functions to compute full series
- [x] 3.2 Implement `computeIndicatorSeries(candles, requiredIndicators)` returning a map of indicator name → number[] arrays
- [x] 3.3 Extract required indicators from entry_logic and exit_logic expression strings

## 4. Data Fetching

- [x] 4.1 Create `src/extension/backtester/data.ts` with `fetchOhlcv(symbol, interval, startDate, endDate, assetClass, clients)` using OpenBB SDK clients
- [x] 4.2 Implement asset class auto-detection from symbol format
- [x] 4.3 Normalize returned data to `{ timestamp, open, high, low, close, volume }` format with Unix seconds timestamps

## 5. Core Backtest Engine

- [x] 5.1 Create `src/extension/backtester/engine.ts` with `runBacktest(strategy, options, candles)` function
- [x] 5.2 Implement candle iteration loop: compute indicators, check warm-up, evaluate entry/exit DSL
- [x] 5.3 Implement position tracking: open/close with slippage and commission
- [x] 5.4 Implement stop_loss_hit / take_profit_hit special variable computation
- [x] 5.5 Implement metrics calculation: total_return, sharpe_ratio, max_drawdown, win_rate, profit_factor
- [x] 5.6 Implement equity curve tracking (snapshot equity at each candle)

## 6. File I/O

- [x] 6.1 Create `src/extension/backtester/io.ts` with functions to write results JSONL and summary JSON to `data/backtests/`
- [x] 6.2 Implement `listBacktests()` to scan and return available backtest result files
- [x] 6.3 Implement `readBacktestSummary(filename)` to read a specific summary

## 7. MCP Tool Adapter

- [x] 7.1 Create `src/extension/backtester/adapter.ts` with `createBacktestTools(equityClient, cryptoClient, currencyClient)` returning tool definitions
- [x] 7.2 Implement `runBacktest` tool: accepts strategy JSON + options, fetches data, runs engine, writes results, returns summary
- [x] 7.3 Implement `fetchHistoricalOhlcv` tool: standalone OHLCV fetching exposed to Alice
- [x] 7.4 Implement `listBacktests` tool: list past backtest summaries

## 8. Integration

- [x] 8.1 Register backtester tools in `src/main.ts` via `toolCenter.register(createBacktestTools(...), 'backtester')`
- [x] 8.2 Verify tools appear in tool inventory and are callable via MCP
