import type { Contract } from '../../contract.js'
import type { Order } from '../../interfaces.js'

/** Build a fully qualified Contract for a Schwab ticker. */
export function makeContract(ticker: string, provider: string): Contract {
  return {
    aliceId: `${provider}-${ticker}`,
    symbol: ticker,
    secType: 'STK',
    exchange: 'SMART',
    currency: 'USD',
  }
}

/** Extract native symbol from aliceId, or null if not ours. */
export function parseAliceId(aliceId: string, provider: string): string | null {
  const prefix = `${provider}-`
  if (!aliceId.startsWith(prefix)) return null
  return aliceId.slice(prefix.length)
}

/** Resolve a Contract to a Schwab ticker symbol. */
export function resolveSymbol(contract: Contract, provider: string): string | null {
  if (contract.aliceId) {
    return parseAliceId(contract.aliceId, provider)
  }
  if (contract.symbol) {
    if (contract.secType && contract.secType !== 'STK' && contract.secType !== 'OPT') return null
    return contract.symbol.toUpperCase()
  }
  return null
}

export function mapSchwabOrderStatus(schwabStatus: string): Order['status'] {
  switch (schwabStatus) {
    case 'FILLED':
      return 'filled'
    case 'AWAITING_PARENT_ORDER':
    case 'AWAITING_CONDITION':
    case 'PENDING_ACTIVATION':
    case 'QUEUED':
    case 'WORKING':
    case 'PENDING_CANCEL':
    case 'PENDING_REPLACE':
    case 'ACCEPTED':
    case 'NEW':
      return 'pending'
    case 'CANCELED':
    case 'EXPIRED':
    case 'REPLACED':
      return 'cancelled'
    case 'REJECTED':
      return 'rejected'
    case 'PARTIALLY_FILLED':
      return 'partially_filled'
    default:
      return 'pending'
  }
}
