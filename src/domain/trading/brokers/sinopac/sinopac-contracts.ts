import type { Contract, ContractDescription, ContractDetails } from '@traderalice/ibkr'
import type { BridgeContract } from './sinopac-types.js'


/** Infer secType from Shioaji security_type string. */
function inferSecType(bc: BridgeContract): string {
  if (bc.security_type === 'options' || bc.strike_price != null) return 'OPT'
  if (bc.security_type === 'futures' || bc.delivery_month) return 'FUT'
  return 'STK'
}

/** Infer exchange from Shioaji contract fields. */
function inferExchange(bc: BridgeContract): string {
  if (bc.exchange) return bc.exchange
  const secType = inferSecType(bc)
  if (secType === 'FUT' || secType === 'OPT') return 'TAIFEX'
  return 'TSE'
}

/** Map a Shioaji bridge contract to an OpenAlice Contract. */
export function toContract(bc: BridgeContract): Contract {
  const secType = inferSecType(bc)
  const contract: Contract = {
    conId: 0,
    symbol: bc.code,
    secType,
    exchange: inferExchange(bc),
    currency: 'TWD',
    localSymbol: bc.symbol || bc.code,
  }
  // aliceId extension
  ;(contract as any).aliceId = `sinopac-${bc.code}`

  if (secType === 'OPT' && bc.strike_price != null) {
    contract.strike = bc.strike_price
    contract.right = bc.option_right === 'P' ? 'P' : 'C'
  }
  if (bc.delivery_month) {
    contract.lastTradeDateOrContractMonth = bc.delivery_month
  }
  return contract
}

/** Map a Shioaji bridge contract to a ContractDescription. */
export function toContractDescription(bc: BridgeContract): ContractDescription {
  const contract = toContract(bc)
  const secType = inferSecType(bc)
  const derivativeSecTypes: string[] = []
  if (secType === 'STK') derivativeSecTypes.push('OPT')
  return { contract, derivativeSecTypes }
}

/** Map a Shioaji bridge contract to ContractDetails. */
export function toContractDetails(bc: BridgeContract): ContractDetails {
  const contract = toContract(bc)
  return {
    contract,
    longName: bc.name || bc.symbol || bc.code,
    stockType: inferSecType(bc) === 'STK' ? 'COMMON' : '',
    validExchanges: inferExchange(bc),
    minTick: 0.01,
    priceMagnifier: 1,
  } as ContractDetails
}

/** Map a contract's secType to bridge security_type string. */
export function toBridgeSecurityType(secType: string): string {
  switch (secType) {
    case 'FUT': return 'futures'
    case 'OPT': return 'options'
    default: return 'stocks'
  }
}
