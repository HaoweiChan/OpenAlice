import { computeIndicatorSeries } from '../../../extension/backtester/indicators.js'
import { evaluateExpression, extractIndicatorNames } from '../../../extension/backtester/dsl.js'
import type { Candle } from '../../../extension/backtester/types.js'
import type { LiveStrategyDef } from './strategy-store.js'

export interface Signal {
  strategyId: string
  symbol: string
  direction: 'long' | 'short'
  action: 'entry' | 'exit'
  price: number
  timestamp: number
  indicators: Record<string, number>
}

interface RollingWindow {
  candles: Candle[]
  maxSize: number
}


export class SignalEvaluator {
  private windows = new Map<string, RollingWindow>()

  /**
   * Seed historical bars into the rolling window for a symbol+timeframe.
   * Call before live evaluation to warm up indicators.
   */
  seed(symbol: string, timeframe: string, candles: Candle[]): void {
    const key = `${symbol}:${timeframe}`
    const maxSize = this._requiredWindowSize([])
    const window: RollingWindow = { candles: candles.slice(-maxSize), maxSize }
    this.windows.set(key, window)
  }

  /**
   * Feed a new bar and evaluate all strategies for this symbol+timeframe.
   * Returns any signals produced.
   */
  evaluate(bar: Candle, strategies: LiveStrategyDef[], positionState: Map<string, 'long' | 'short' | 'flat'>): Signal[] {
    if (strategies.length === 0) return []

    const firstStrat = strategies[0]
    const key = `${firstStrat.symbol}:${firstStrat.timeframe}`

    // Collect all expressions to determine window size
    const allExprs = strategies.flatMap((s) => [s.entryLong, s.exitLong, s.entryShort, s.exitShort].filter(Boolean) as string[])
    const maxSize = this._requiredWindowSize(allExprs)

    let window = this.windows.get(key)
    if (!window) {
      window = { candles: [], maxSize }
      this.windows.set(key, window)
    }
    window.maxSize = maxSize

    // Append bar, trim to max size
    window.candles.push(bar)
    if (window.candles.length > maxSize) {
      window.candles = window.candles.slice(-maxSize)
    }

    // Check warmup
    const minRequired = this._minWarmupBars(allExprs)
    if (window.candles.length < minRequired) return []

    // Compute indicators once for all strategies sharing this symbol+timeframe
    const indicatorSeries = computeIndicatorSeries(window.candles, allExprs)
    const lastIdx = window.candles.length - 1
    const indicatorSnapshot: Record<string, number> = {}
    for (const [name, series] of Object.entries(indicatorSeries)) {
      indicatorSnapshot[name] = series[lastIdx] ?? NaN
    }

    const signals: Signal[] = []

    for (const strategy of strategies) {
      if (!strategy.enabled) continue
      const position = positionState.get(strategy.id) ?? 'flat'
      const ctx = this._buildContext(bar, indicatorSnapshot, position, strategy)

      if (strategy.direction === 'long' || strategy.direction === 'both') {
        if (position !== 'long' && strategy.entryLong && evaluateExpression(strategy.entryLong, ctx)) {
          signals.push({ strategyId: strategy.id, symbol: strategy.symbol, direction: 'long', action: 'entry', price: bar.close, timestamp: bar.timestamp, indicators: { ...indicatorSnapshot } })
        } else if (position === 'long' && strategy.exitLong && evaluateExpression(strategy.exitLong, ctx)) {
          signals.push({ strategyId: strategy.id, symbol: strategy.symbol, direction: 'long', action: 'exit', price: bar.close, timestamp: bar.timestamp, indicators: { ...indicatorSnapshot } })
        }
      }

      if (strategy.direction === 'short' || strategy.direction === 'both') {
        if (position !== 'short' && strategy.entryShort && evaluateExpression(strategy.entryShort, ctx)) {
          signals.push({ strategyId: strategy.id, symbol: strategy.symbol, direction: 'short', action: 'entry', price: bar.close, timestamp: bar.timestamp, indicators: { ...indicatorSnapshot } })
        } else if (position === 'short' && strategy.exitShort && evaluateExpression(strategy.exitShort, ctx)) {
          signals.push({ strategyId: strategy.id, symbol: strategy.symbol, direction: 'short', action: 'exit', price: bar.close, timestamp: bar.timestamp, indicators: { ...indicatorSnapshot } })
        }
      }
    }

    return signals
  }

  getWindowSize(symbol: string, timeframe: string): number {
    return this.windows.get(`${symbol}:${timeframe}`)?.candles.length ?? 0
  }

  getLatestIndicators(symbol: string, timeframe: string, expressions: string[]): Record<string, number> {
    const window = this.windows.get(`${symbol}:${timeframe}`)
    if (!window || window.candles.length === 0) return {}
    const series = computeIndicatorSeries(window.candles, expressions)
    const lastIdx = window.candles.length - 1
    const snap: Record<string, number> = {}
    for (const [name, vals] of Object.entries(series)) {
      snap[name] = vals[lastIdx] ?? NaN
    }
    return snap
  }

  removeWindow(symbol: string, timeframe: string): void {
    this.windows.delete(`${symbol}:${timeframe}`)
  }

  private _buildContext(bar: Candle, indicators: Record<string, number>, position: string, strategy: LiveStrategyDef): Record<string, number | boolean> {
    const ctx: Record<string, number | boolean> = {
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      position_open: position !== 'flat',
      stop_loss_hit: false,
      take_profit_hit: false,
      ...indicators,
    }
    // Inject strategy parameters
    for (const [k, v] of Object.entries(strategy.parameters)) {
      if (!(k in ctx)) ctx[k] = v
    }
    return ctx
  }

  private _requiredWindowSize(expressions: string[]): number {
    const names = extractIndicatorNames(expressions)
    let maxPeriod = 0
    for (const name of names) {
      const m = name.match(/_(\d+)/)
      if (m) maxPeriod = Math.max(maxPeriod, parseInt(m[1], 10))
    }
    // MACD needs 26+9=35 minimum
    if (names.some((n) => n.startsWith('MACD'))) maxPeriod = Math.max(maxPeriod, 35)
    return maxPeriod + 50
  }

  private _minWarmupBars(expressions: string[]): number {
    const names = extractIndicatorNames(expressions)
    let minRequired = 2
    for (const name of names) {
      const m = name.match(/_(\d+)/)
      if (m) minRequired = Math.max(minRequired, parseInt(m[1], 10) + 1)
    }
    if (names.some((n) => n.startsWith('MACD'))) minRequired = Math.max(minRequired, 35)
    return minRequired
  }
}
