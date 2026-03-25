## Context

OpenAlice is a file-driven AI trading agent. Alice uses LLM reasoning plus MCP tools to analyze markets and execute trades. The analysis-kit extension already provides technical indicators (RSI, EMA, SMA, BBANDS, MACD, ATR) operating on `number[]` arrays. Historical OHLCV data is available via OpenBB SDK clients for equity, crypto, and currency. Trade execution uses a git-like stage/commit/push flow.

Alice identified backtesting as the critical missing piece — she can propose strategies but cannot validate them. She defined an interface contract specifying: strategy definition format, indicator-enriched candle data, backtest execution with metrics output, and file-based I/O.

## Goals / Non-Goals

**Goals:**
- Core backtesting engine that replays a strategy over historical candles with realistic execution simulation
- Simple expression DSL for entry/exit logic (e.g., `RSI_14 < 30 && close > EMA_20`)
- Reuse existing analysis-kit indicators to compute full indicator series
- Fetch OHLCV data via existing OpenBB SDK clients (equity + crypto + currency)
- Expose 3 MCP tools: `runBacktest`, `fetchHistoricalOhlcv`, `listBacktests`
- Persist results to `data/backtests/` as JSONL trade logs + JSON summary
- Standard performance metrics: total return, Sharpe ratio, max drawdown, win rate, profit factor, equity curve

**Non-Goals:**
- Parameter sweep / grid search (Phase 2)
- Walk-forward validation (Phase 2)
- Volume-based fill realism checks (Phase 2)
- Live signal generation from backtested strategies
- Multi-asset portfolio backtesting (single symbol per run)
- Sub-second tick data backtesting
- Custom indicator definitions (use existing analysis-kit set)

## Decisions

### D1: Extension structure — `src/extension/backtester/`

Follow existing extension pattern. Files: `types.ts`, `engine.ts`, `indicators.ts`, `data.ts`, `dsl.ts`, `io.ts`, `adapter.ts`, `index.ts`.

**Why**: Consistent with analysis-kit, equity, trading extensions. Tools registered via `createBacktestTools()` in `main.ts`.

### D2: Use `number` throughout, not `Decimal.js`

The existing indicator library operates on `number[]`. Converting to Decimal.js would require rewriting all indicators and be 10-100x slower with no meaningful accuracy benefit for backtesting.

**Why over Decimal.js**: Backtesting is compute-intensive (thousands of candles × many indicators). IEEE 754 doubles have 15-16 significant digits — more than sufficient for price data and PnL calculations. Real backtesting frameworks (Backtrader, Zipline, vectorbt) all use float64.

### D3: Simple expression DSL with safe evaluation

Entry/exit logic uses string expressions like `RSI_14 < 30 && close > EMA_20`. The DSL supports:
- Variables: `open`, `high`, `low`, `close`, `volume`, plus computed indicators (`RSI_14`, `EMA_20`, `SMA_50`, `BBANDS_upper`, `MACD_histogram`, etc.)
- Operators: `<`, `>`, `<=`, `>=`, `==`, `!=`, `&&`, `||`, `!`
- Literals: numbers
- Parentheses for grouping
- Special variables: `position_open` (boolean), `stop_loss_hit`, `take_profit_hit`

Implemented as a recursive-descent parser — no `eval()`, no sandboxed JS.

**Why over JS sandbox**: Security (no arbitrary code execution), simplicity, covers 90%+ of strategy conditions. Complex strategies can use multiple conditions combined with `&&`/`||`.

### D4: Indicator series computation

Wrap existing analysis-kit single-value functions to produce full series arrays. For each candle index `i`, call `RSI(closes.slice(0, i+1), 14)` etc. Cache results per backtest run.

**Why**: Reuses battle-tested indicator code. The series wrapper is thin — just windowed calls.

### D5: OHLCV fetching via OpenBB SDK clients

Use existing `EquitySDKClient.getHistorical()`, `CryptoSDKClient.getHistorical()`, and `CurrencySDKClient.getHistorical()` to fetch candle data. Asset class is determined by symbol format or explicit parameter.

**Why not CCXT**: CCXT's `fetchOHLCV` isn't currently exposed. OpenBB SDK already works and supports equity + crypto + currency via yfinance. Adding CCXT OHLCV is Phase 2.

### D6: File I/O paths

```
data/backtests/
  {strategy_name}_{timestamp}_results.jsonl   # one JSON line per trade
  {strategy_name}_{timestamp}_summary.json    # metrics + equity curve
```

**Why JSONL for trades**: Append-friendly, streamable, consistent with event-log pattern. **Why JSON for summary**: Single object, easy for Alice to read and reason about.

## Risks / Trade-offs

- **[Indicator accuracy at series boundaries]** → Early candles have insufficient lookback for indicators (e.g., RSI needs 14+ candles). Mitigation: skip candles where indicators return NaN; document minimum warm-up period per indicator.
- **[OHLCV data gaps]** → yfinance may have missing candles or adjusted prices. Mitigation: forward-fill missing candles; document data quality limitations.
- **[DSL expressiveness]** → Simple DSL cannot express complex multi-timeframe or stateful strategies. Mitigation: This is Phase 1; Phase 2 can add a richer DSL or JS sandbox if needed.
- **[Performance on large datasets]** → Computing indicator series by repeated slicing is O(n²) for n candles. Mitigation: acceptable for typical backtest sizes (2000-5000 candles); optimize with incremental calculation in Phase 2 if needed.
- **[Single-symbol limitation]** → No cross-asset correlation strategies. Mitigation: out of scope for Phase 1; document as known limitation.
