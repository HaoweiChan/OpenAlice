/**
 * Strategy Lifecycle — divergence listener and auto-pause.
 *
 * Subscribes to `strategy.divergence` events from the performance tracker.
 * Optionally auto-pauses divergent strategies (configurable).
 * Notifies the user via connector center.
 */

import type { EventLog, EventLogEntry } from '../../../core/event-log.js'
import type { ConnectorCenter } from '../../../core/connector-center.js'
import type { StrategyStore } from './strategy-store.js'
import type { PerformanceTracker, DivergenceResult } from './performance-tracker.js'

export interface StrategyLifecycleOpts {
  eventLog: EventLog
  connectorCenter: ConnectorCenter
  strategyStore: StrategyStore
  performanceTracker: PerformanceTracker
  autoPauseOnDivergence: boolean
}

export class StrategyLifecycle {
  private unsub: (() => void) | null = null
  private opts: StrategyLifecycleOpts

  constructor(opts: StrategyLifecycleOpts) {
    this.opts = opts
  }

  start(): void {
    this.unsub = this.opts.eventLog.subscribeType('strategy.divergence', (entry) => {
      this._handleDivergence(entry as EventLogEntry<DivergenceResult>).catch((e) =>
        console.warn('strategy-lifecycle: divergence handler error:', e),
      )
    })
    console.log(`strategy-lifecycle: started (auto-pause: ${this.opts.autoPauseOnDivergence})`)
  }

  stop(): void {
    this.unsub?.()
    this.unsub = null
  }

  /** Run a full re-evaluation of all enabled strategies. Returns divergent ones. */
  async reEvaluateAll(): Promise<DivergenceResult[]> {
    return this.opts.performanceTracker.checkAllDivergence()
  }

  private async _handleDivergence(entry: EventLogEntry<DivergenceResult>): Promise<void> {
    const d = entry.payload
    const strategy = this.opts.strategyStore.get(d.strategyId)
    if (!strategy) return

    const ratio = (d.ratio * 100).toFixed(0)
    let msg = `Strategy "${d.strategyId}" divergence detected: live Sharpe ${d.liveSharpe.toFixed(2)} vs deployment ${d.deploymentSharpe.toFixed(2)} (${ratio}% ratio)`

    if (this.opts.autoPauseOnDivergence && strategy.enabled) {
      await this.opts.strategyStore.disable(d.strategyId)
      msg += '\nAuto-paused. Use strategyEnable to reactivate after review.'
      console.log(`strategy-lifecycle: auto-paused "${d.strategyId}" due to divergence`)
    } else {
      msg += '\nReview recommended: use strategyReEvaluate or strategyImprove.'
    }

    await this.opts.connectorCenter.notify(msg, { kind: 'notification' })
    console.log(`strategy-lifecycle: divergence notification sent for "${d.strategyId}"`)
  }
}
