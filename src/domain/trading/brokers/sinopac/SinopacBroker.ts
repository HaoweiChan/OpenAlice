import type { Contract, ContractDescription, ContractDetails, Order, OrderCancel } from '@traderalice/ibkr'
import type Decimal from 'decimal.js'
import type { IBroker, AccountCapabilities, AccountInfo, MarketClock, OpenOrder, PlaceOrderResult, Position, Quote } from '../types.js'
import { SinopacBridgeClient } from './sinopac-bridge-client.js'
import { toContractDescription, toContractDetails, toContract, toBridgeSecurityType } from './sinopac-contracts.js'
import type { BridgeTrade } from './sinopac-types.js'


export interface SinopacBrokerConfig {
  id: string
  label?: string
  apiKey: string
  secretKey: string
  bridgeUrl: string
  accountType: 'stock' | 'futures' | 'both'
}

/** Shioaji status → OpenAlice OrderState status string. */
function mapOrderStatus(status: string): string {
  switch (status) {
    case 'PendingSubmit':
    case 'PreSubmitted':
    case 'Submitted':
      return 'PreSubmitted'
    case 'Filled':
      return 'Filled'
    case 'PartFilled':
      return 'PreSubmitted'
    case 'Cancelled':
      return 'Cancelled'
    case 'Failed':
      return 'Inactive'
    default:
      return 'PreSubmitted'
  }
}

export class SinopacBroker implements IBroker {
  readonly id: string
  readonly provider = 'sinopac'
  readonly label: string

  private readonly config: SinopacBrokerConfig
  private readonly client: SinopacBridgeClient

  constructor(config: SinopacBrokerConfig) {
    this.config = config
    this.id = config.id
    this.label = config.label ?? 'Sinopac'
    this.client = new SinopacBridgeClient(config.bridgeUrl)
  }

  async init(): Promise<void> {
    const health = await this.client.health()
    if (!health.logged_in) {
      await this.client.login(this.config.apiKey, this.config.secretKey)
    }
  }

  async close(): Promise<void> {
    // Bridge lifecycle managed by SinopacPlatform, not per-broker
  }

  // ==================== Contracts ====================

  async searchContracts(pattern: string): Promise<ContractDescription[]> {
    const results = await this.client.searchContracts(pattern)
    return results.map(toContractDescription)
  }

  async getContractDetails(query: Contract): Promise<ContractDetails | null> {
    const secType = toBridgeSecurityType(query.secType ?? 'STK')
    const bc = await this.client.getContract(secType, query.symbol)
    if (!bc) return null
    return toContractDetails(bc)
  }

  // ==================== Trading ====================

  async placeOrder(contract: Contract, order: Order): Promise<PlaceOrderResult> {
    const securityType = toBridgeSecurityType(contract.secType ?? 'STK')
    const action = order.action === 'BUY' ? 'Buy' : 'Sell'
    const priceType = order.orderType === 'MKT' ? 'MKT' : 'LMT'
    let orderType = 'ROD'
    if (order.tif === 'IOC') orderType = 'IOC'
    else if (order.tif === 'FOK') orderType = 'FOK'

    try {
      const trade = await this.client.placeOrder({
        contract_code: contract.symbol,
        security_type: securityType,
        action,
        price: order.lmtPrice ?? 0,
        quantity: order.totalQuantity ?? 1,
        price_type: priceType,
        order_type: orderType,
        octype: securityType !== 'stocks' ? 'Auto' : undefined,
      })
      return { success: true, orderId: trade.order_id }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async modifyOrder(orderId: string, changes: Order): Promise<PlaceOrderResult> {
    try {
      const update: { price?: number; quantity?: number } = {}
      if (changes.lmtPrice != null) update.price = changes.lmtPrice
      if (changes.totalQuantity != null) update.quantity = changes.totalQuantity
      const trade = await this.client.updateOrder(orderId, update)
      return { success: true, orderId: trade.order_id }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async cancelOrder(orderId: string, _orderCancel?: OrderCancel): Promise<boolean> {
    try {
      const trade = await this.client.cancelOrder(orderId)
      return trade.status === 'Cancelled'
    } catch {
      return false
    }
  }

  async closePosition(contract: Contract, quantity?: Decimal): Promise<PlaceOrderResult> {
    const positions = await this.getPositions()
    const pos = positions.find((p) => p.contract.symbol === contract.symbol)
    if (!pos) return { success: false, error: 'No position found' }

    const closeQty = quantity ? Number(quantity) : Number(pos.quantity)
    const action = pos.side === 'long' ? 'SELL' : 'BUY'
    const closeOrder = {
      action,
      orderType: 'MKT',
      totalQuantity: closeQty,
    } as Order
    return this.placeOrder(contract, closeOrder)
  }

  // ==================== Queries ====================

  async getAccount(): Promise<AccountInfo> {
    try {
      const bal = await this.client.getAccountBalance()
      const positions = await this.getPositions()
      const positionPnL = positions.reduce((sum, p) => sum + p.unrealizedPnL, 0)
      const equity = bal.equity || bal.acc_balance || 0
      const cash = bal.available_balance || bal.acc_balance || 0
      return {
        netLiquidation: equity || (cash + positionPnL),
        totalCashValue: cash,
        unrealizedPnL: bal.unrealized_pnl || positionPnL,
        realizedPnL: bal.realized_pnl,
        initMarginReq: bal.margin || undefined,
        maintMarginReq: bal.maintenance_margin || undefined,
      }
    } catch {
      return { netLiquidation: 0, totalCashValue: 0, unrealizedPnL: 0, realizedPnL: 0 }
    }
  }

  async getPositions(): Promise<Position[]> {
    const DecimalClass = (await import('decimal.js')).default
    const mapPositions = (raw: Awaited<ReturnType<typeof this.client.listPositions>>, secType: string) =>
      raw
        .filter((p) => p.quantity !== 0)
        .map((p) => ({
          contract: {
            aliceId: `sinopac-${p.code}`,
            symbol: p.code,
            secType,
            exchange: 'TWSE',
            currency: 'TWD',
          } as Contract,
          side: (p.direction === 'Buy' || p.direction === 'Long') ? 'long' as const : 'short' as const,
          quantity: new DecimalClass(Math.abs(p.quantity)),
          avgCost: p.price,
          marketPrice: p.last_price || p.price,
          marketValue: Math.abs(p.quantity) * (p.last_price || p.price),
          unrealizedPnL: p.pnl,
          realizedPnL: 0,
        }))

    try {
      if (this.config.accountType === 'both') {
        const [stockRaw, futuresRaw] = await Promise.all([
          this.client.listPositions('stock').catch(() => []),
          this.client.listPositions('futures').catch(() => []),
        ])
        return [...mapPositions(stockRaw, 'STK'), ...mapPositions(futuresRaw, 'FUT')]
      }
      const type = this.config.accountType === 'futures' ? 'futures' : 'stock'
      const secType = type === 'futures' ? 'FUT' : 'STK'
      const raw = await this.client.listPositions(type)
      return mapPositions(raw, secType)
    } catch {
      return []
    }
  }

  async getOrders(orderIds: string[]): Promise<OpenOrder[]> {
    const accountType = this.config.accountType === 'futures' ? 'futures' : 'stock'
    const trades = await this.client.listOrders(accountType)
    let filtered = trades
    if (orderIds.length > 0) {
      const idSet = new Set(orderIds)
      filtered = trades.filter((t) => idSet.has(t.order_id))
    }
    return filtered.map((t) => this._mapTradeToOpenOrder(t))
  }

  async getOrder(orderId: string): Promise<OpenOrder | null> {
    const orders = await this.getOrders([orderId])
    return orders[0] ?? null
  }

  async getQuote(contract: Contract): Promise<Quote> {
    const secType = toBridgeSecurityType(contract.secType ?? 'STK')
    const snapshots = await this.client.snapshots([contract.symbol], secType)
    if (!snapshots.length) {
      return { contract, last: 0, bid: 0, ask: 0, volume: 0, timestamp: new Date() }
    }
    const s = snapshots[0]
    return {
      contract,
      last: s.close,
      bid: s.buy_price,
      ask: s.sell_price,
      volume: s.total_volume,
      high: s.high,
      low: s.low,
      timestamp: new Date(s.ts / 1_000_000), // Shioaji ts is nanoseconds
    }
  }

  getMarketClock(): Promise<MarketClock> {
    const now = new Date()
    // Taiwan is UTC+8
    const twOffset = 8 * 60
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes()
    const twMinutes = (utcMinutes + twOffset) % (24 * 60)
    const twDay = now.getUTCDay()

    const stockOpen = 9 * 60          // 09:00
    const stockClose = 13 * 60 + 30   // 13:30
    const futDayOpen = 8 * 60 + 45    // 08:45
    const futDayClose = 13 * 60 + 45  // 13:45
    const futNightOpen = 15 * 60      // 15:00
    const futNightClose = 5 * 60      // 05:00 next day

    const isWeekday = twDay >= 1 && twDay <= 5
    const isStockOpen = isWeekday && twMinutes >= stockOpen && twMinutes < stockClose
    const isFutDayOpen = isWeekday && twMinutes >= futDayOpen && twMinutes < futDayClose
    const isFutNightOpen = isWeekday && (twMinutes >= futNightOpen || twMinutes < futNightClose)
    const isOpen = isStockOpen || isFutDayOpen || isFutNightOpen

    const result: MarketClock = { isOpen, timestamp: now }
    if (isOpen && isStockOpen) {
      result.nextClose = this._twTime(now, stockClose)
    } else if (!isOpen && isWeekday && twMinutes < stockOpen) {
      result.nextOpen = this._twTime(now, stockOpen)
    }

    return Promise.resolve(result)
  }

  getCapabilities(): AccountCapabilities {
    return {
      supportedSecTypes: ['STK', 'FUT', 'OPT'],
      supportedOrderTypes: ['LMT', 'MKT', 'MKP'],
    }
  }

  // ==================== Internal ====================

  private _mapTradeToOpenOrder(t: BridgeTrade): OpenOrder {
    const contract = toContract(t.contract)
    const order: Order = {
      action: t.action === 'Buy' ? 'BUY' : 'SELL',
      orderType: 'LMT',
      lmtPrice: t.price,
      totalQuantity: t.quantity,
    } as Order
    const orderState = {
      status: mapOrderStatus(t.status),
    } as any
    return { contract, order, orderState }
  }

  private _twTime(base: Date, minutesSinceMidnight: number): Date {
    const d = new Date(base)
    d.setUTCHours(Math.floor(minutesSinceMidnight / 60) - 8, minutesSinceMidnight % 60, 0, 0)
    return d
  }
}
