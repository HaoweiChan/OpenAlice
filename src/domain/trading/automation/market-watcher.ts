import type { EventLog } from '../../../core/event-log.js'
import type { AccountManager } from '../account-manager.js'
import type { SinopacBridgeClient, BarEvent } from '../brokers/sinopac/sinopac-bridge-client.js'
import type { Candle } from '../../../extension/backtester/types.js'
import { SignalEvaluator, type Signal } from './signal-evaluator.js'
import { StrategyStore, type LiveStrategyDef } from './strategy-store.js'

export interface MarketWatcherDeps {
  strategyStore: StrategyStore
  eventLog: EventLog
  accountManager: AccountManager
  getBridgeClient: (brokerId: string) => SinopacBridgeClient | undefined
}

interface StrategyGroup {
  symbol: string
  securityType: string
  timeframe: string
  broker: string
  strategies: LiveStrategyDef[]
}

// TAIFEX day session: 08:45–13:45, night session: 15:00–05:00 (UTC+8)
const TAIFEX_DAY_START = 8 * 60 + 45
const TAIFEX_DAY_END = 13 * 60 + 45
const TAIFEX_NIGHT_START = 15 * 60
const TAIFEX_NIGHT_END = 5 * 60

function isTaifexOpen(now?: Date): boolean {
  const d = now ?? new Date()
  const utc8 = new Date(d.getTime() + 8 * 3600_000)
  const mins = utc8.getUTCHours() * 60 + utc8.getUTCMinutes()
  const day = utc8.getUTCDay()
  if (day === 0 || day === 6) return false
  if (mins >= TAIFEX_DAY_START && mins < TAIFEX_DAY_END) return true
  if (mins >= TAIFEX_NIGHT_START || mins < TAIFEX_NIGHT_END) return true
  return false
}


export class MarketWatcher {
  private evaluator = new SignalEvaluator()
  private activeGroups = new Map<string, StrategyGroup>()
  private positionState = new Map<string, 'long' | 'short' | 'flat'>()
  private running = false
  private paused = false
  private marketCheckTimer: ReturnType<typeof setInterval> | null = null
  private deps: MarketWatcherDeps

  constructor(deps: MarketWatcherDeps) {
    this.deps = deps
    deps.strategyStore.on('change', () => this._onStrategyChange())
  }

  async start(): Promise<void> {
    this.running = true
    this.paused = !isTaifexOpen()
    await this._rebuildSubscriptions()
    this._startMarketHoursCheck()
    console.log(`market-watcher: started (${this.activeGroups.size} groups${this.paused ? ', market closed — paused' : ''})`)
  }

  stop(): void {
    this.running = false
    if (this.marketCheckTimer) {
      clearInterval(this.marketCheckTimer)
      this.marketCheckTimer = null
    }
    for (const [key, group] of this.activeGroups) {
      const client = this.deps.getBridgeClient(group.broker)
      if (client) {
        client.unsubscribeBars(group.symbol, group.securityType, group.timeframe)
      }
    }
    this.activeGroups.clear()
    console.log('market-watcher: stopped')
  }

  private _startMarketHoursCheck(): void {
    this.marketCheckTimer = setInterval(() => {
      const open = isTaifexOpen()
      if (this.paused && open) {
        this.paused = false
        console.log('market-watcher: market open — resuming signal evaluation')
        this._rebuildSubscriptions().catch((e) =>
          console.warn('market-watcher: resume rebuild failed:', e),
        )
      } else if (!this.paused && !open) {
        this.paused = true
        console.log('market-watcher: market closed — pausing signal evaluation')
      }
    }, 60_000)
  }

  getStatus(): { groups: number; strategies: number; evaluatorWindows: Map<string, number> } {
    let stratCount = 0
    const windows = new Map<string, number>()
    for (const g of this.activeGroups.values()) {
      stratCount += g.strategies.length
      windows.set(`${g.symbol}:${g.timeframe}`, this.evaluator.getWindowSize(g.symbol, g.timeframe))
    }
    return { groups: this.activeGroups.size, strategies: stratCount, evaluatorWindows: windows }
  }

  getIndicators(symbol: string, timeframe: string, expressions: string[]): Record<string, number> {
    return this.evaluator.getLatestIndicators(symbol, timeframe, expressions)
  }

  private async _rebuildSubscriptions(): Promise<void> {
    const enabled = this.deps.strategyStore.listEnabled()
    const groups = new Map<string, StrategyGroup>()

    for (const s of enabled) {
      const key = `${s.broker}:${s.symbol}:${s.timeframe}`
      let group = groups.get(key)
      if (!group) {
        group = { symbol: s.symbol, securityType: s.securityType, timeframe: s.timeframe, broker: s.broker, strategies: [] }
        groups.set(key, group)
      }
      group.strategies.push(s)
    }

    // Unsubscribe removed groups
    for (const [key, old] of this.activeGroups) {
      if (!groups.has(key)) {
        const client = this.deps.getBridgeClient(old.broker)
        if (client) client.unsubscribeBars(old.symbol, old.securityType, old.timeframe)
        this.evaluator.removeWindow(old.symbol, old.timeframe)
      }
    }

    // Subscribe new groups
    for (const [key, group] of groups) {
      if (!this.activeGroups.has(key)) {
        await this._subscribeGroup(group)
      }
    }

    this.activeGroups = groups
  }

  private async _seedGroup(group: StrategyGroup): Promise<void> {
    const client = this.deps.getBridgeClient(group.broker)
    if (!client) return
    try {
      const end = new Date().toISOString().slice(0, 10)
      const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
      const kbars = await client.kbars(group.symbol, group.securityType, start, end)
      if (kbars.ts?.length > 0) {
        const candles: Candle[] = kbars.ts.map((ts, i) => ({
          timestamp: ts > 1e15 ? Math.floor(ts / 1e9) : ts > 1e12 ? Math.floor(ts / 1000) : ts,
          open: kbars.open[i],
          high: kbars.high[i],
          low: kbars.low[i],
          close: kbars.close[i],
          volume: kbars.volume[i],
        }))
        this.evaluator.seed(group.symbol, group.timeframe, candles)
        console.log(`market-watcher: seeded ${candles.length} bars for ${group.symbol} ${group.timeframe}`)
      }
    } catch (e) {
      console.warn(`market-watcher: warmup failed for ${group.symbol}:`, e)
    }
  }

  private async _subscribeGroup(group: StrategyGroup): Promise<void> {
    const client = this.deps.getBridgeClient(group.broker)
    if (!client) {
      console.warn(`market-watcher: no bridge client for broker ${group.broker}`)
      return
    }
    await this._seedGroup(group)
    client.subscribeBars(group.symbol, group.securityType, group.timeframe, (code, tf, bar) => {
      this._onBar(code, tf, bar)
    })
  }

  private _onBar(code: string, timeframe: string, bar: BarEvent): void {
    if (!this.running || this.paused) return

    const candle: Candle = {
      timestamp: bar.timestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    }

    const matchingStrategies: LiveStrategyDef[] = []
    for (const group of this.activeGroups.values()) {
      if (group.symbol === code && group.timeframe === timeframe) {
        matchingStrategies.push(...group.strategies)
      }
    }

    if (matchingStrategies.length === 0) return

    const signals = this.evaluator.evaluate(candle, matchingStrategies, this.positionState)

    for (const signal of signals) {
      this.deps.eventLog.append('market.signal', signal).catch((e) =>
        console.warn('market-watcher: failed to emit signal:', e),
      )
    }
  }

  /** Re-seed rolling windows from historical data (called on reconnect or resume). */
  async reseed(): Promise<void> {
    for (const group of this.activeGroups.values()) {
      await this._seedGroup(group)
    }
  }

  private _onStrategyChange(): void {
    if (this.running) {
      this._rebuildSubscriptions().catch((e) =>
        console.warn('market-watcher: rebuild failed:', e),
      )
    }
  }

  /** Called by signal executor when position state changes */
  updatePositionState(strategyId: string, state: 'long' | 'short' | 'flat'): void {
    this.positionState.set(strategyId, state)
  }
}
