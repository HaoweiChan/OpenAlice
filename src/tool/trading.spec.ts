import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ContractDescription } from '@traderalice/ibkr'
import { MockBroker, makeContract } from '../domain/trading/brokers/mock/index.js'
import { AccountManager } from '../domain/trading/account-manager.js'
import { UnifiedTradingAccount } from '../domain/trading/UnifiedTradingAccount.js'
import { createTradingTools } from './trading.js'
import '../domain/trading/contract-ext.js'

function makeUta(broker: MockBroker): UnifiedTradingAccount {
  return new UnifiedTradingAccount(broker)
}

function makeManager(...brokers: MockBroker[]): AccountManager {
  const mgr = new AccountManager()
  for (const b of brokers) mgr.add(makeUta(b))
  return mgr
}

// ==================== AccountManager.resolve ====================

describe('AccountManager.resolve', () => {
  let mgr: AccountManager

  beforeEach(() => {
    mgr = makeManager(
      new MockBroker({ id: 'alpaca-paper', label: 'Alpaca Paper' }),
      new MockBroker({ id: 'bybit-main', label: 'Bybit Main' }),
    )
  })

  it('returns all UTAs when source is not provided', () => {
    const results = mgr.resolve()
    expect(results).toHaveLength(2)
    expect(results.map((r) => r.id).sort()).toEqual(['alpaca-paper', 'bybit-main'])
  })

  it('returns single UTA by exact id', () => {
    const results = mgr.resolve('alpaca-paper')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('alpaca-paper')
  })

  it('returns empty array when source matches nothing', () => {
    expect(mgr.resolve('nonexistent')).toHaveLength(0)
  })
})

// ==================== resolveOne ====================

describe('AccountManager.resolveOne', () => {
  let mgr: AccountManager

  beforeEach(() => {
    mgr = makeManager(
      new MockBroker({ id: 'alpaca-paper' }),
      new MockBroker({ id: 'bybit-main' }),
    )
  })

  it('returns the single matching UTA', () => {
    const result = mgr.resolveOne('alpaca-paper')
    expect(result.id).toBe('alpaca-paper')
  })

  it('throws when no UTA matches', () => {
    expect(() => mgr.resolveOne('unknown-id')).toThrow('No account found matching source "unknown-id"')
  })
})

// ==================== createTradingTools: listAccounts ====================

describe('createTradingTools — listAccounts', () => {
  it('returns summaries for all registered UTAs', async () => {
    const mgr = makeManager(new MockBroker({ id: 'acc1', label: 'Test' }))
    const tools = createTradingTools(mgr)
    const result = await (tools.listAccounts.execute as Function)({})
    expect(Array.isArray(result)).toBe(true)
    expect(result[0].id).toBe('acc1')
  })
})

// ==================== createTradingTools: searchContracts ====================

describe('createTradingTools — searchContracts', () => {
  it('aggregates results from all UTAs', async () => {
    const a1 = new MockBroker({ id: 'acc1' })
    const a2 = new MockBroker({ id: 'acc2' })
    const desc1 = new ContractDescription()
    desc1.contract = makeContract({ symbol: 'AAPL' })
    const desc2 = new ContractDescription()
    desc2.contract = makeContract({ symbol: 'AAPL' })
    vi.spyOn(a1, 'searchContracts').mockResolvedValue([desc1])
    vi.spyOn(a2, 'searchContracts').mockResolvedValue([desc2])

    const mgr = makeManager(a1, a2)
    const tools = createTradingTools(mgr)
    const result = await (tools.searchContracts.execute as Function)({ pattern: 'AAPL' })
    expect(result).toHaveLength(2)
  })
})
