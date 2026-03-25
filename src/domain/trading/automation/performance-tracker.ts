import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { EventLog, EventLogEntry } from '../../../core/event-log.js'
import type { StrategyStore } from './strategy-store.js'

const STRATEGIES_DIR = resolve('data/strategies')
const DIVERGENCE_WINDOW_DAYS = 7
const DIVERGENCE_THRESHOLD = 0.5

export interface TradeRecord {
  timestamp: number
  strategyId: string
  symbol: string
  direction: 'long' | 'short'
  action: 'entry' | 'exit'
  price: number
  quantity: number
  slippage?: number
  status: 'filled' | 'closed' | 'rejected'
  error?: string
}

export interface PerformanceMetrics {
  totalTrades: number
  wins: number
  losses: number
  winRate: number
  totalPnL: number
  maxDrawdown: number
  sharpeRatio: number
  lastSignalTime: number | null
}

export interface DivergenceResult {
  strategyId: string
  liveSharpe: number
  deploymentSharpe: number
  ratio: number
  divergent: boolean
}


export class PerformanceTracker {
  private records = new Map<string, TradeRecord[]>()
  private unsub: (() => void) | null = null
  private strategyStore: StrategyStore | null = null

  constructor(private eventLog: EventLog) {}

  setStrategyStore(store: StrategyStore): void {
    this.strategyStore = store
  }

  start(): void {
    this.unsub = this.eventLog.subscribeType('signal.execution', (entry) => {
      this._recordExecution(entry).catch((e) =>
        console.warn('performance-tracker: error recording:', e),
      )
    })
    console.log('performance-tracker: started')
  }

  stop(): void {
    this.unsub?.()
    this.unsub = null
  }

  async checkDivergence(strategyId: string): Promise<DivergenceResult | null> {
    if (!this.strategyStore) return null
    const strategy = this.strategyStore.get(strategyId)
    if (!strategy?.deployment?.walkForwardScore) return null
    const deploymentSharpe = strategy.deployment.walkForwardScore
    const since = Date.now() - DIVERGENCE_WINDOW_DAYS * 86400_000
    const recent = await this.getRecords(strategyId, since)
    const metrics = this._computeMetrics(recent)
    const ratio = deploymentSharpe > 0 ? metrics.sharpeRatio / deploymentSharpe : 0
    const divergent = metrics.totalTrades >= 3 && ratio < DIVERGENCE_THRESHOLD
    return { strategyId, liveSharpe: metrics.sharpeRatio, deploymentSharpe, ratio, divergent }
  }

  async checkAllDivergence(): Promise<DivergenceResult[]> {
    if (!this.strategyStore) return []
    const results: DivergenceResult[] = []
    for (const s of this.strategyStore.listEnabled()) {
      const d = await this.checkDivergence(s.id)
      if (d?.divergent) {
        await this.eventLog.append('strategy.divergence', d)
        results.push(d)
      }
    }
    return results
  }

  async getMetrics(strategyId: string): Promise<PerformanceMetrics> {
    const records = await this._loadRecords(strategyId)
    return this._computeMetrics(records)
  }

  async getRecords(strategyId: string, since?: number): Promise<TradeRecord[]> {
    const records = await this._loadRecords(strategyId)
    if (since) return records.filter((r) => r.timestamp >= since)
    return records
  }

  private async _recordExecution(entry: EventLogEntry): Promise<void> {
    const payload = entry.payload as { strategyId: string; signal: any; status: string; error?: string }
    const record: TradeRecord = {
      timestamp: entry.ts,
      strategyId: payload.strategyId,
      symbol: payload.signal.symbol,
      direction: payload.signal.direction,
      action: payload.signal.action,
      price: payload.signal.price,
      quantity: payload.signal.quantity ?? 1,
      status: payload.status as TradeRecord['status'],
      error: payload.error,
    }

    if (!this.records.has(record.strategyId)) {
      this.records.set(record.strategyId, await this._loadRecords(record.strategyId))
    }
    this.records.get(record.strategyId)!.push(record)
    await this._saveRecords(record.strategyId)
  }

  private _computeMetrics(records: TradeRecord[]): PerformanceMetrics {
    const filled = records.filter((r) => r.status !== 'rejected')
    if (filled.length === 0) {
      return { totalTrades: 0, wins: 0, losses: 0, winRate: 0, totalPnL: 0, maxDrawdown: 0, sharpeRatio: 0, lastSignalTime: null }
    }

    // Pair entries and exits to compute PnL
    const pnlValues: number[] = []
    let pendingEntry: TradeRecord | null = null

    for (const r of filled) {
      if (r.action === 'entry') {
        pendingEntry = r
      } else if (r.action === 'exit' && pendingEntry) {
        const mul = pendingEntry.direction === 'long' ? 1 : -1
        const pnl = (r.price - pendingEntry.price) * mul * pendingEntry.quantity
        pnlValues.push(pnl)
        pendingEntry = null
      }
    }

    const wins = pnlValues.filter((p) => p > 0).length
    const losses = pnlValues.filter((p) => p <= 0).length
    const totalPnL = pnlValues.reduce((s, p) => s + p, 0)

    // Max drawdown from cumulative PnL
    let peak = 0
    let maxDD = 0
    let cum = 0
    for (const p of pnlValues) {
      cum += p
      if (cum > peak) peak = cum
      const dd = peak - cum
      if (dd > maxDD) maxDD = dd
    }

    // Sharpe ratio (simplified, annualized assuming daily trades)
    const mean = pnlValues.length > 0 ? totalPnL / pnlValues.length : 0
    const variance = pnlValues.reduce((s, p) => s + (p - mean) ** 2, 0) / Math.max(pnlValues.length - 1, 1)
    const std = Math.sqrt(variance)
    const sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0

    return {
      totalTrades: pnlValues.length,
      wins,
      losses,
      winRate: pnlValues.length > 0 ? wins / pnlValues.length : 0,
      totalPnL,
      maxDrawdown: maxDD,
      sharpeRatio: sharpe,
      lastSignalTime: filled.length > 0 ? filled[filled.length - 1].timestamp : null,
    }
  }

  private _perfPath(strategyId: string): string {
    return resolve(STRATEGIES_DIR, `${strategyId}.performance.json`)
  }

  private async _loadRecords(strategyId: string): Promise<TradeRecord[]> {
    try {
      const raw = await readFile(this._perfPath(strategyId), 'utf-8')
      return JSON.parse(raw) as TradeRecord[]
    } catch {
      return []
    }
  }

  private async _saveRecords(strategyId: string): Promise<void> {
    const records = this.records.get(strategyId) ?? []
    await mkdir(STRATEGIES_DIR, { recursive: true })
    await writeFile(this._perfPath(strategyId), JSON.stringify(records, null, 2))
  }
}
