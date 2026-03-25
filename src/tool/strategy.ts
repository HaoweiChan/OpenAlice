import { tool } from 'ai'
import { z } from 'zod'
import type { StrategyStore, LiveStrategyDef } from '../domain/trading/automation/strategy-store.js'
import type { MarketWatcher } from '../domain/trading/automation/market-watcher.js'
import type { PerformanceTracker } from '../domain/trading/automation/performance-tracker.js'

const DEPLOY_MIN_WALK_FORWARD_SCORE = 0.5

const DSL_HELP = `DSL expressions: close, open, high, low, volume, RSI_14, EMA_20, SMA_50, BBANDS_upper/lower/middle, MACD_value/signal/histogram, ATR_14. Operators: <, >, <=, >=, ==, !=, &&, ||, !. Special: stop_loss_hit, take_profit_hit, position_open.`

const strategyInput = {
  symbol: z.string().describe('Contract code (e.g. MXF, TXF)'),
  securityType: z.enum(['futures', 'stocks', 'options']).describe('Security type'),
  timeframe: z.enum(['1m', '5m', '15m', '30m', '1h']).describe('Bar timeframe'),
  broker: z.string().describe('Account id (e.g. sinopac-main)'),
  direction: z.enum(['long', 'short', 'both']).default('both').describe('Trade direction'),
  entryLong: z.string().optional().describe('DSL expression for long entry'),
  exitLong: z.string().optional().describe('DSL expression for long exit'),
  entryShort: z.string().optional().describe('DSL expression for short entry'),
  exitShort: z.string().optional().describe('DSL expression for short exit'),
  parameters: z.record(z.string(), z.number()).default({}).describe('Strategy parameters (must include position_size)'),
  maxPosition: z.number().int().min(1).default(5).describe('Max simultaneous position size'),
}


export function createStrategyTools(
  store: StrategyStore,
  watcher: MarketWatcher,
  tracker: PerformanceTracker,
) {
  return {
    strategyCreate: tool({
      description: `Create a new live trading strategy.\n\n${DSL_HELP}\n\nCreates the strategy disabled by default. Use strategyEnable to activate.`,
      inputSchema: z.object({
        id: z.string().describe('Strategy id (kebab-case, e.g. mxf-rsi-mean-revert)'),
        ...strategyInput,
      }),
      execute: async (input) => {
        try {
          const def: LiveStrategyDef = { ...input, enabled: false }
          const result = await store.create(def)
          return { success: true, strategy: result }
        } catch (e: any) {
          return { success: false, error: e.message }
        }
      },
    }),

    strategyList: tool({
      description: 'List all live trading strategies with their status and key parameters.',
      inputSchema: z.object({}),
      execute: async () => {
        const strategies = store.list()
        if (strategies.length === 0) return { success: true, message: 'No strategies found.', strategies: [] }
        const summary = strategies.map((s) => ({
          id: s.id,
          symbol: s.symbol,
          timeframe: s.timeframe,
          broker: s.broker,
          direction: s.direction,
          enabled: s.enabled,
          maxPosition: s.maxPosition,
          entryLong: s.entryLong,
          exitLong: s.exitLong,
        }))
        return { success: true, count: strategies.length, strategies: summary }
      },
    }),

    strategyEnable: tool({
      description: 'Enable a strategy to start live monitoring and trading.',
      inputSchema: z.object({ id: z.string().describe('Strategy id') }),
      execute: async ({ id }) => {
        try {
          await store.enable(id)
          return { success: true, message: `Strategy "${id}" enabled. Market watcher will begin monitoring.` }
        } catch (e: any) {
          return { success: false, error: e.message }
        }
      },
    }),

    strategyDisable: tool({
      description: 'Disable a strategy. Stops monitoring but does NOT close open positions.',
      inputSchema: z.object({ id: z.string().describe('Strategy id') }),
      execute: async ({ id }) => {
        try {
          await store.disable(id)
          return { success: true, message: `Strategy "${id}" disabled.` }
        } catch (e: any) {
          return { success: false, error: e.message }
        }
      },
    }),

    strategyDelete: tool({
      description: 'Delete a strategy permanently. Does NOT close open positions.',
      inputSchema: z.object({ id: z.string().describe('Strategy id') }),
      execute: async ({ id }) => {
        try {
          await store.remove(id)
          return { success: true, message: `Strategy "${id}" deleted.` }
        } catch (e: any) {
          return { success: false, error: e.message }
        }
      },
    }),

    strategyUpdate: tool({
      description: 'Update strategy parameters, DSL expressions, or settings.',
      inputSchema: z.object({
        id: z.string().describe('Strategy id'),
        entryLong: z.string().optional().describe('New long entry DSL'),
        exitLong: z.string().optional().describe('New long exit DSL'),
        entryShort: z.string().optional().describe('New short entry DSL'),
        exitShort: z.string().optional().describe('New short exit DSL'),
        parameters: z.record(z.string(), z.number()).optional().describe('Updated parameters'),
        maxPosition: z.number().int().min(1).optional().describe('Max position size'),
        timeframe: z.enum(['1m', '5m', '15m', '30m', '1h']).optional().describe('New timeframe'),
      }),
      execute: async (input) => {
        const { id, ...updates } = input
        const clean = Object.fromEntries(Object.entries(updates).filter(([_, v]) => v !== undefined))
        try {
          const result = await store.update(id, clean)
          return { success: true, strategy: result }
        } catch (e: any) {
          return { success: false, error: e.message }
        }
      },
    }),

    strategyStatus: tool({
      description: 'Get detailed status of a strategy: current state, position, indicators, performance metrics.',
      inputSchema: z.object({ id: z.string().describe('Strategy id') }),
      execute: async ({ id }) => {
        const strategy = store.get(id)
        if (!strategy) return { success: false, error: `Strategy "${id}" not found` }

        const allExprs = [strategy.entryLong, strategy.exitLong, strategy.entryShort, strategy.exitShort].filter(Boolean) as string[]
        const indicators = watcher.getIndicators(strategy.symbol, strategy.timeframe, allExprs)
        const watcherStatus = watcher.getStatus()
        const windowSize = watcherStatus.evaluatorWindows.get(`${strategy.symbol}:${strategy.timeframe}`) ?? 0
        const metrics = await tracker.getMetrics(id)

        return {
          success: true,
          strategy: {
            id: strategy.id,
            symbol: strategy.symbol,
            timeframe: strategy.timeframe,
            broker: strategy.broker,
            enabled: strategy.enabled,
            direction: strategy.direction,
            maxPosition: strategy.maxPosition,
          },
          monitoring: {
            windowSize,
            warmup: windowSize > 0 ? 'ready' : 'not started',
          },
          indicators,
          performance: metrics,
        }
      },
    }),

    strategyPerformance: tool({
      description: 'Get performance report for a strategy over a date range.',
      inputSchema: z.object({
        id: z.string().describe('Strategy id'),
        sinceDaysAgo: z.number().int().min(1).default(30).describe('Look back N days'),
      }),
      execute: async ({ id, sinceDaysAgo }) => {
        const since = Date.now() - sinceDaysAgo * 86400000
        const records = await tracker.getRecords(id, since)
        const metrics = await tracker.getMetrics(id)
        return {
          success: true,
          strategyId: id,
          period: `${sinceDaysAgo} days`,
          recordCount: records.length,
          metrics,
          recentTrades: records.slice(-10),
        }
      },
    }),

    strategyDesign: tool({
      description: `Design a new strategy using the AI workflow: propose DSL expressions → backtest → parameter sweep → walk-forward validation → present results. This tool returns a strategy proposal with validation results — use strategyDeploy to make it live.\n\n${DSL_HELP}`,
      inputSchema: z.object({
        name: z.string().describe('Proposed strategy name (kebab-case)'),
        symbol: z.string().describe('Contract code (e.g. MXF, TXF)'),
        securityType: z.enum(['futures', 'stocks', 'options']).describe('Security type'),
        timeframe: z.enum(['1m', '5m', '15m', '30m', '1h']).describe('Bar timeframe'),
        broker: z.string().describe('Account id'),
        direction: z.enum(['long', 'short', 'both']).default('both'),
        entryLong: z.string().optional().describe('DSL entry condition for long'),
        exitLong: z.string().optional().describe('DSL exit condition for long'),
        entryShort: z.string().optional().describe('DSL entry condition for short'),
        exitShort: z.string().optional().describe('DSL exit condition for short'),
        parameters: z.record(z.string(), z.number()).default({}).describe('Strategy parameters'),
        backtestDays: z.number().int().min(7).default(90).describe('Days of historical data for backtest'),
        capital: z.number().positive().default(1000000).describe('Starting capital'),
      }),
      execute: async (input) => {
        return {
          success: true,
          message: 'Strategy design proposal ready. Use the backtester tools (runBacktest, runParameterSweep, runWalkForward) to validate, then strategyDeploy to go live.',
          proposal: {
            id: input.name,
            symbol: input.symbol,
            securityType: input.securityType,
            timeframe: input.timeframe,
            broker: input.broker,
            direction: input.direction,
            entryLong: input.entryLong,
            exitLong: input.exitLong,
            entryShort: input.entryShort,
            exitShort: input.exitShort,
            parameters: input.parameters,
          },
          nextSteps: [
            `1. Run backtest: runBacktest with symbol="${input.symbol}", timeframe="${input.timeframe}", start/end dates for ${input.backtestDays} days`,
            '2. Run parameter sweep: runParameterSweep to find optimal parameters',
            `3. Run walk-forward: runWalkForward to validate (need score >= ${DEPLOY_MIN_WALK_FORWARD_SCORE})`,
            '4. Deploy: strategyDeploy with the backtest results',
          ],
        }
      },
    }),

    strategyDeploy: tool({
      description: `Deploy a validated strategy as a live trading strategy. Requires a walk-forward score >= ${DEPLOY_MIN_WALK_FORWARD_SCORE}. Creates a disabled strategy — use strategyEnable to activate.`,
      inputSchema: z.object({
        id: z.string().describe('Strategy id (kebab-case)'),
        ...strategyInput,
        backtestId: z.string().optional().describe('Reference backtest id'),
        walkForwardScore: z.number().min(0).max(1).describe('Walk-forward validation score (0-1)'),
      }),
      execute: async (input) => {
        if (input.walkForwardScore < DEPLOY_MIN_WALK_FORWARD_SCORE) {
          return {
            success: false,
            error: `Walk-forward score ${input.walkForwardScore.toFixed(2)} is below threshold ${DEPLOY_MIN_WALK_FORWARD_SCORE}. Strategy may be overfit.`,
          }
        }
        try {
          const def: LiveStrategyDef = {
            id: input.id,
            symbol: input.symbol,
            securityType: input.securityType,
            timeframe: input.timeframe,
            broker: input.broker,
            direction: input.direction,
            entryLong: input.entryLong,
            exitLong: input.exitLong,
            entryShort: input.entryShort,
            exitShort: input.exitShort,
            parameters: input.parameters,
            maxPosition: input.maxPosition,
            enabled: false,
            deployment: {
              backtestId: input.backtestId,
              walkForwardScore: input.walkForwardScore,
              deployedAt: new Date().toISOString(),
            },
          }
          const result = await store.create(def)
          return {
            success: true,
            message: `Strategy "${input.id}" deployed (disabled). Use strategyEnable to start live monitoring.`,
            strategy: result,
          }
        } catch (e: any) {
          return { success: false, error: e.message }
        }
      },
    }),

    strategyReEvaluate: tool({
      description: 'Re-evaluate a strategy by comparing live performance against its deployment baseline. Flags divergence if live Sharpe is significantly below backtest expectations.',
      inputSchema: z.object({
        id: z.string().describe('Strategy id'),
      }),
      execute: async ({ id }) => {
        const strategy = store.get(id)
        if (!strategy) return { success: false, error: `Strategy "${id}" not found` }

        const divergence = await tracker.checkDivergence(id)
        const metrics = await tracker.getMetrics(id)

        return {
          success: true,
          strategyId: id,
          deployment: strategy.deployment ?? null,
          liveMetrics: metrics,
          divergence: divergence ?? { message: 'No deployment baseline to compare against' },
          recommendation: divergence?.divergent
            ? 'Live performance significantly below expectations. Consider re-optimizing parameters (strategyImprove) or disabling.'
            : 'Performance within acceptable range.',
        }
      },
    }),

    strategyImprove: tool({
      description: 'Suggest parameter improvements for a strategy by analyzing recent performance. Returns current state and recommendations — use backtester tools (runParameterSweep) to test alternatives.',
      inputSchema: z.object({
        id: z.string().describe('Strategy id'),
        lookbackDays: z.number().int().min(7).default(30).describe('Days of recent data to analyze'),
      }),
      execute: async ({ id, lookbackDays }) => {
        const strategy = store.get(id)
        if (!strategy) return { success: false, error: `Strategy "${id}" not found` }

        const since = Date.now() - lookbackDays * 86400_000
        const records = await tracker.getRecords(id, since)
        const metrics = await tracker.getMetrics(id)
        const divergence = await tracker.checkDivergence(id)
        const allExprs = [strategy.entryLong, strategy.exitLong, strategy.entryShort, strategy.exitShort].filter(Boolean) as string[]
        const indicators = watcher.getIndicators(strategy.symbol, strategy.timeframe, allExprs)

        return {
          success: true,
          strategyId: id,
          currentParameters: strategy.parameters,
          recentMetrics: metrics,
          divergence: divergence ?? null,
          currentIndicators: indicators,
          recentTradeCount: records.length,
          nextSteps: [
            `1. Run parameter sweep: runParameterSweep on recent ${lookbackDays} days of ${strategy.symbol} data`,
            '2. Run walk-forward to validate new params',
            `3. Update: strategyUpdate id="${id}" with improved parameters`,
          ],
        }
      },
    }),
  }
}
