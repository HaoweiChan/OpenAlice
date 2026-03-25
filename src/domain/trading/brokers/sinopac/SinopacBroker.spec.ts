import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SinopacBroker } from './SinopacBroker.js'
import type { Contract, Order } from '@traderalice/ibkr'


const mockClient = {
  health: vi.fn(),
  login: vi.fn(),
  searchContracts: vi.fn(),
  getContract: vi.fn(),
  placeOrder: vi.fn(),
  updateOrder: vi.fn(),
  cancelOrder: vi.fn(),
  listOrders: vi.fn(),
  snapshots: vi.fn(),
  listAccounts: vi.fn(),
  waitForHealth: vi.fn(),
}

vi.mock('./sinopac-bridge-client.js', () => ({
  SinopacBridgeClient: vi.fn(function () { return mockClient as any }),
}))

describe('SinopacBroker', () => {
  let broker: SinopacBroker

  beforeEach(() => {
    vi.clearAllMocks()
    broker = new SinopacBroker({
      id: 'sinopac-test',
      apiKey: 'key',
      secretKey: 'secret',
      bridgeUrl: 'http://localhost:8890',
      accountType: 'both',
    })
  })

  describe('init', () => {
    it('logs in when bridge is not authenticated', async () => {
      mockClient.health.mockResolvedValue({ status: 'ok', logged_in: false })
      mockClient.login.mockResolvedValue({ ok: true, accounts: [] })
      await broker.init()
      expect(mockClient.login).toHaveBeenCalledWith('key', 'secret')
    })

    it('skips login when already authenticated', async () => {
      mockClient.health.mockResolvedValue({ status: 'ok', logged_in: true })
      await broker.init()
      expect(mockClient.login).not.toHaveBeenCalled()
    })
  })

  describe('searchContracts', () => {
    it('returns mapped contract descriptions', async () => {
      mockClient.searchContracts.mockResolvedValue([
        { code: '2330', symbol: 'TSE2330', name: '台積電', exchange: 'TSE', security_type: 'stocks' },
      ])
      const results = await broker.searchContracts('2330')
      expect(results).toHaveLength(1)
      expect(results[0].contract.symbol).toBe('2330')
      expect(results[0].contract.secType).toBe('STK')
    })
  })

  describe('placeOrder', () => {
    it('maps and places a stock limit order', async () => {
      mockClient.placeOrder.mockResolvedValue({ order_id: 'abc123', status: 'Submitted' })
      const contract = { symbol: '2890', secType: 'STK' } as Contract
      const order = { action: 'BUY', orderType: 'LMT', lmtPrice: 17, totalQuantity: 1 } as Order
      const result = await broker.placeOrder(contract, order)
      expect(result.success).toBe(true)
      expect(result.orderId).toBe('abc123')
      expect(mockClient.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          contract_code: '2890',
          security_type: 'stocks',
          action: 'Buy',
          price: 17,
          quantity: 1,
          price_type: 'LMT',
        }),
      )
    })

    it('returns failure on bridge error', async () => {
      mockClient.placeOrder.mockRejectedValue(new Error('Market closed'))
      const contract = { symbol: '2890', secType: 'STK' } as Contract
      const order = { action: 'BUY', orderType: 'MKT', totalQuantity: 1 } as Order
      const result = await broker.placeOrder(contract, order)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Market closed')
    })
  })

  describe('cancelOrder', () => {
    it('returns true when cancelled', async () => {
      mockClient.cancelOrder.mockResolvedValue({ order_id: 'abc', status: 'Cancelled' })
      expect(await broker.cancelOrder('abc')).toBe(true)
    })

    it('returns false on error', async () => {
      mockClient.cancelOrder.mockRejectedValue(new Error('Not found'))
      expect(await broker.cancelOrder('xyz')).toBe(false)
    })
  })

  describe('getQuote', () => {
    it('maps snapshot to Quote', async () => {
      mockClient.snapshots.mockResolvedValue([{
        code: '2330',
        close: 600,
        buy_price: 599,
        sell_price: 601,
        total_volume: 50000,
        high: 605,
        low: 595,
        ts: 1673620200000000000,
      }])
      const contract = { symbol: '2330', secType: 'STK' } as Contract
      const quote = await broker.getQuote(contract)
      expect(quote.last).toBe(600)
      expect(quote.bid).toBe(599)
      expect(quote.ask).toBe(601)
      expect(quote.volume).toBe(50000)
    })
  })

  describe('getCapabilities', () => {
    it('returns STK, FUT, OPT', () => {
      const caps = broker.getCapabilities()
      expect(caps.supportedSecTypes).toEqual(['STK', 'FUT', 'OPT'])
      expect(caps.supportedOrderTypes).toEqual(['LMT', 'MKT', 'MKP'])
    })
  })

  describe('getMarketClock', () => {
    it('returns a MarketClock object', async () => {
      const clock = await broker.getMarketClock()
      expect(clock).toHaveProperty('isOpen')
      expect(clock).toHaveProperty('timestamp')
    })
  })
})
