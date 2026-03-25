import type { EventLog, EventLogEntry } from '../../../core/event-log.js'
import type { ConnectorCenter } from '../../../core/connector-center.js'
import type { AccountManager } from '../account-manager.js'
import type { StrategyStore } from './strategy-store.js'
import type { MarketWatcher } from './market-watcher.js'
import type { Signal } from './signal-evaluator.js'

export interface SignalExecutorDeps {
  eventLog: EventLog
  connectorCenter: ConnectorCenter
  accountManager: AccountManager
  strategyStore: StrategyStore
  marketWatcher: MarketWatcher
}


export class SignalExecutor {
  private deps: SignalExecutorDeps
  private unsub: (() => void) | null = null

  constructor(deps: SignalExecutorDeps) {
    this.deps = deps
  }

  start(): void {
    this.unsub = this.deps.eventLog.subscribeType('market.signal', (entry) => {
      this._handleSignal(entry as EventLogEntry<Signal>).catch((e) =>
        console.error('signal-executor: error handling signal:', e),
      )
    })
    console.log('signal-executor: started')
  }

  stop(): void {
    this.unsub?.()
    this.unsub = null
  }

  private async _handleSignal(entry: EventLogEntry<Signal>): Promise<void> {
    const signal = entry.payload
    const strategy = this.deps.strategyStore.get(signal.strategyId)
    if (!strategy || !strategy.enabled) {
      console.log(`signal-executor: ignoring signal for disabled/missing strategy ${signal.strategyId}`)
      return
    }

    const accounts = this.deps.accountManager.resolve(strategy.broker)
    if (accounts.length === 0) {
      console.warn(`signal-executor: no account found for broker ${strategy.broker}`)
      return
    }
    const uta = accounts[0]

    try {
      // Check position limits for entries
      if (signal.action === 'entry') {
        const positions = await uta.broker.getPositions()
        const symbolPositions = positions.filter((p) => p.contract.symbol === signal.symbol)
        const totalQty = symbolPositions.reduce((sum, p) => sum + Math.abs(p.quantity.toNumber()), 0)
        if (totalQty >= strategy.maxPosition) {
          const msg = `Strategy ${strategy.id}: max position ${strategy.maxPosition} reached, skipping ${signal.direction} entry`
          console.log(`signal-executor: ${msg}`)
          await this.deps.connectorCenter.notify(msg, { kind: 'notification' })
          return
        }
      }

      const positionSize = strategy.parameters.position_size ?? 1

      if (signal.action === 'entry') {
        const action = signal.direction === 'long' ? 'BUY' : 'SELL'
        const result = await uta.broker.placeOrder(
          { aliceId: '', symbol: signal.symbol, secType: strategy.securityType === 'futures' ? 'FUT' : 'STK', exchange: '', currency: 'TWD' } as any,
          { action, orderType: 'MKT', totalQuantity: positionSize } as any,
        )
        this.deps.marketWatcher.updatePositionState(strategy.id, signal.direction)
        const msg = `Strategy ${strategy.id}: ${action} ${positionSize} ${signal.symbol} @ MKT (${signal.direction} entry)`
        console.log(`signal-executor: ${msg}`)
        await this.deps.connectorCenter.notify(msg, { kind: 'notification' })
        await this.deps.eventLog.append('signal.execution', { strategyId: strategy.id, signal, result, status: 'filled' })

      } else {
        // Exit — close position
        const contract = { aliceId: '', symbol: signal.symbol, secType: strategy.securityType === 'futures' ? 'FUT' : 'STK', exchange: '', currency: 'TWD' } as any
        const result = await uta.broker.closePosition(contract)
        this.deps.marketWatcher.updatePositionState(strategy.id, 'flat')
        const msg = `Strategy ${strategy.id}: closed ${signal.direction} ${signal.symbol} (exit signal)`
        console.log(`signal-executor: ${msg}`)
        await this.deps.connectorCenter.notify(msg, { kind: 'notification' })
        await this.deps.eventLog.append('signal.execution', { strategyId: strategy.id, signal, result, status: 'closed' })
      }

    } catch (e: any) {
      const msg = `Strategy ${strategy.id}: order failed — ${e.message}`
      console.error(`signal-executor: ${msg}`)
      await this.deps.connectorCenter.notify(msg, { kind: 'notification' })
      await this.deps.eventLog.append('signal.execution', { strategyId: strategy.id, signal, error: e.message, status: 'rejected' })
    }
  }
}
