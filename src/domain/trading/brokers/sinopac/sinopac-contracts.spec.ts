import { describe, it, expect } from 'vitest'
import { toContract, toContractDescription, toContractDetails, toBridgeSecurityType } from './sinopac-contracts.js'
import type { BridgeContract } from './sinopac-types.js'


describe('sinopac-contracts', () => {
  const stockContract: BridgeContract = {
    code: '2890',
    symbol: 'TSE2890',
    name: '永豐金',
    exchange: 'TSE',
    security_type: 'stocks',
    limit_up: 19.1,
    limit_down: 15.7,
    reference: 17.4,
    unit: 1000,
    day_trade: 'Yes',
  }

  const futuresContract: BridgeContract = {
    code: 'TXFA3',
    symbol: 'TXF202301',
    name: '臺股期貨01',
    category: 'TXF',
    delivery_month: '202301',
    delivery_date: '2023/01/30',
    security_type: 'futures',
  }

  const optionContract: BridgeContract = {
    code: 'TXO18000R3',
    symbol: 'TXO20230618000P',
    name: '臺指選擇權06月 18000P',
    category: 'TXO',
    delivery_month: '202306',
    strike_price: 18000,
    option_right: 'P',
    security_type: 'options',
  }

  describe('toContract', () => {
    it('maps stock contract', () => {
      const c = toContract(stockContract)
      expect(c.symbol).toBe('2890')
      expect(c.secType).toBe('STK')
      expect(c.exchange).toBe('TSE')
      expect(c.currency).toBe('TWD')
      expect((c as any).aliceId).toBe('sinopac-2890')
    })

    it('maps futures contract', () => {
      const c = toContract(futuresContract)
      expect(c.symbol).toBe('TXFA3')
      expect(c.secType).toBe('FUT')
      expect(c.exchange).toBe('TAIFEX')
      expect(c.lastTradeDateOrContractMonth).toBe('202301')
    })

    it('maps options contract', () => {
      const c = toContract(optionContract)
      expect(c.symbol).toBe('TXO18000R3')
      expect(c.secType).toBe('OPT')
      expect(c.strike).toBe(18000)
      expect(c.right).toBe('P')
    })
  })

  describe('toContractDescription', () => {
    it('includes derivativeSecTypes for stocks', () => {
      const desc = toContractDescription(stockContract)
      expect(desc.derivativeSecTypes).toContain('OPT')
    })

    it('no derivativeSecTypes for futures', () => {
      const desc = toContractDescription(futuresContract)
      expect(desc.derivativeSecTypes).toEqual([])
    })
  })

  describe('toContractDetails', () => {
    it('maps longName from contract name', () => {
      const details = toContractDetails(stockContract)
      expect(details.longName).toBe('永豐金')
    })
  })

  describe('toBridgeSecurityType', () => {
    it('maps STK to stocks', () => {
      expect(toBridgeSecurityType('STK')).toBe('stocks')
    })

    it('maps FUT to futures', () => {
      expect(toBridgeSecurityType('FUT')).toBe('futures')
    })

    it('maps OPT to options', () => {
      expect(toBridgeSecurityType('OPT')).toBe('options')
    })
  })
})
