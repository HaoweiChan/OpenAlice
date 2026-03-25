import { createApiClient } from '@sudowealth/schwab-api'
import type { Contract, ContractDescription, ContractDetails } from '../../contract.js'
import type {
  ITradingAccount,
  AccountCapabilities,
  AccountInfo,
  Position,
  Order,
  OrderRequest,
  OrderResult,
  Quote,
  MarketClock,
} from '../../interfaces.js'
import type {
  SchwabAccountConfig,
  SchwabAccountsResponse,
  SchwabPositionRaw,
  SchwabOrderRaw,
  SchwabQuoteRaw,
  SchwabInstrumentRaw,
  SchwabMarketHoursRaw,
} from './schwab-types.js'
import { makeContract, resolveSymbol, mapSchwabOrderStatus } from './schwab-contracts.js'
import { createSchwabAuthClient, loadTokens, completeAuth } from './schwab-auth.js'
import type { EnhancedTokenManager, SchwabApiClient } from '@sudowealth/schwab-api'

export class SchwabAccount implements ITradingAccount {
  readonly id: string
  readonly provider = 'schwab'
  readonly label: string

  private client!: SchwabApiClient
  private auth!: EnhancedTokenManager
  private accountHash!: string
  private readonly config: SchwabAccountConfig

  constructor(config: SchwabAccountConfig) {
    this.config = config
    this.id = config.id ?? 'schwab-main'
    this.label = config.label ?? 'Schwab'
  }

  // ---- Lifecycle ----

  async init(): Promise<void> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error(
        'No Schwab API credentials configured. Set apiKey (Client ID) and apiSecret (Client Secret) in accounts.json.',
      )
    }

    this.auth = createSchwabAuthClient(
      this.config.clientId,
      this.config.clientSecret,
      this.config.redirectUri,
      this.id,
    )

    const tokens = await loadTokens(this.id)
    if (!tokens) {
      const { authUrl } = await this.auth.getAuthorizationUrl()
      throw new Error(
        `No Schwab OAuth tokens found for account "${this.id}".\n\n` +
        `Visit this URL to authorize:\n${authUrl}\n\n` +
        `After consenting, copy the full callback URL and run the auth completion flow.`,
      )
    }

    const ready = await this.auth.initialize()
    if (!ready) {
      throw new Error(`Schwab token initialization failed for "${this.id}". Tokens may be expired — re-authorize.`)
    }

    this.client = createApiClient({
      auth: this.auth,
      middleware: {
        rateLimit: { maxRequests: 120, windowMs: 60_000 },
        retry: { maxAttempts: 3, baseDelayMs: 1000 },
      },
    })

    await this.resolveAccountHash()
    console.log(`SchwabAccount[${this.id}]: connected (hash=${this.accountHash.slice(0, 8)}...)`)
  }

  async close(): Promise<void> {
    // HTTP client — no persistent connection to close
  }

  /**
   * Complete initial OAuth flow by exchanging callback URL for tokens.
   * Call once after the user completes browser consent.
   */
  async completeAuth(callbackUrl: string): Promise<void> {
    if (!this.auth) {
      this.auth = createSchwabAuthClient(
        this.config.clientId,
        this.config.clientSecret,
        this.config.redirectUri,
        this.id,
      )
    }
    await completeAuth(this.auth, callbackUrl, this.id)
  }

  private async resolveAccountHash(): Promise<void> {
    const response = await this.client.trader.accounts.getAccountNumbers() as unknown as Array<{ accountNumber: string; hashValue: string }>
    if (!response || response.length === 0) {
      throw new Error('No Schwab accounts found. Ensure your developer app is linked to a brokerage account.')
    }
    if (response.length > 1) {
      const hashes = response.map(a => a.hashValue)
      console.warn(
        `SchwabAccount[${this.id}]: Multiple accounts found. Using first. ` +
        `Available hashes: ${hashes.join(', ')}. ` +
        `To specify, add accountHash to your config.`,
      )
    }
    this.accountHash = response[0].hashValue
  }

  // ---- Contract search ----

  async searchContracts(pattern: string): Promise<ContractDescription[]> {
    if (!pattern) return []

    try {
      const response = await this.client.marketData.instruments.getInstruments({
        queryParams: { symbol: pattern.toUpperCase(), projection: 'symbol-search' },
      }) as unknown as { instruments?: SchwabInstrumentRaw[] }

      const instruments = response?.instruments ?? []
      return instruments.map(inst => ({
        contract: makeContract(inst.symbol, this.provider),
        derivativeSecTypes: inst.assetType === 'EQUITY' ? ['OPT' as const] : undefined,
      }))
    } catch {
      return []
    }
  }

  async getContractDetails(query: Partial<Contract>): Promise<ContractDetails | null> {
    const symbol = resolveSymbol(query as Contract, this.provider)
    if (!symbol) return null

    try {
      const response = await this.client.marketData.instruments.getInstruments({
        queryParams: { symbol, projection: 'fundamental' },
      }) as unknown as { instruments?: SchwabInstrumentRaw[] }

      const inst = response?.instruments?.[0]
      if (!inst) return null

      return {
        contract: makeContract(inst.symbol, this.provider),
        longName: inst.description,
        validExchanges: inst.exchange ? [inst.exchange] : ['SMART'],
        stockType: inst.assetType === 'EQUITY' ? 'COMMON' : inst.assetType,
      }
    } catch {
      return null
    }
  }

  // ---- Trading operations ----

  async placeOrder(order: OrderRequest): Promise<OrderResult> {
    const symbol = resolveSymbol(order.contract, this.provider)
    if (!symbol) {
      return { success: false, error: 'Cannot resolve contract to Schwab symbol' }
    }

    try {
      const schwabOrder = this.buildSchwabOrder(symbol, order)
      const response = await this.client.trader.orders.placeOrderForAccount({
        pathParams: { accountNumber: this.accountHash },
        body: schwabOrder as never,
      }) as unknown as Response | { orderId?: string }

      // Extract order ID from Location header or response body
      let orderId: string | undefined
      if (response && typeof response === 'object' && 'headers' in response) {
        const location = (response as Response).headers?.get?.('location')
        if (location) {
          orderId = location.split('/').pop()
        }
      }

      return { success: true, orderId }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async modifyOrder(orderId: string, changes: Partial<OrderRequest>): Promise<OrderResult> {
    try {
      const orders = await this.client.trader.orders.getOrdersByAccount({
        pathParams: { accountNumber: this.accountHash },
        queryParams: { maxResults: 100 },
      }) as unknown as SchwabOrderRaw[]

      const existing = (orders ?? []).find(o => String(o.orderId) === orderId)
      if (!existing) {
        return { success: false, error: `Order ${orderId} not found` }
      }

      const leg = existing.orderLegCollection?.[0]
      if (!leg) {
        return { success: false, error: 'Cannot modify: no order legs found' }
      }

      const updatedOrder: Record<string, unknown> = {
        orderType: existing.orderType,
        session: existing.session,
        duration: existing.duration,
        orderStrategyType: existing.orderStrategyType,
        orderLegCollection: [{
          instruction: leg.instruction,
          quantity: changes.qty ?? existing.quantity,
          instrument: { symbol: leg.instrument.symbol, assetType: leg.instrument.assetType },
        }],
      }

      if (changes.price != null) updatedOrder.price = changes.price.toString()
      else if (existing.price != null) updatedOrder.price = existing.price.toString()

      if (changes.stopPrice != null) updatedOrder.stopPrice = changes.stopPrice.toString()
      else if (existing.stopPrice != null) updatedOrder.stopPrice = existing.stopPrice.toString()

      if (changes.timeInForce) updatedOrder.duration = this.mapTimeInForce(changes.timeInForce)

      await this.client.trader.orders.replaceOrder({
        pathParams: { accountNumber: this.accountHash, orderId: Number(orderId) },
        body: updatedOrder as never,
      })

      return { success: true, orderId }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      await this.client.trader.orders.cancelOrder({
        pathParams: { accountNumber: this.accountHash, orderId: Number(orderId) },
      })
      return true
    } catch {
      return false
    }
  }

  async closePosition(contract: Contract, qty?: number): Promise<OrderResult> {
    const symbol = resolveSymbol(contract, this.provider)
    if (!symbol) {
      return { success: false, error: 'Cannot resolve contract to Schwab symbol' }
    }

    const positions = await this.getPositions()
    const pos = positions.find(p => p.contract.symbol === symbol)
    if (!pos) return { success: false, error: `No position for ${symbol}` }

    return this.placeOrder({
      contract,
      side: pos.side === 'long' ? 'sell' : 'buy',
      type: 'market',
      qty: qty ?? pos.qty,
      timeInForce: 'day',
    })
  }

  // ---- Queries ----

  async getAccount(): Promise<AccountInfo> {
    const response = await this.client.trader.accounts.getAccountByNumber({
      pathParams: { accountNumber: this.accountHash },
      queryParams: { fields: 'positions' },
    }) as unknown as { securitiesAccount: SchwabAccountsResponse['account']['securitiesAccount'] }

    const acct = response.securitiesAccount
    const bal = acct.currentBalances ?? {} as Record<string, number>
    const positions = acct.positions ?? []
    const unrealizedPnL = positions.reduce((sum, p) => sum + (p.currentDayProfitLoss ?? 0), 0)
    const longMv = bal.longMarketValue ?? 0
    const shortMv = bal.shortMarketValue ?? 0

    return {
      cash: bal.cashBalance ?? bal.availableFunds ?? 0,
      equity: bal.equity ?? (longMv + shortMv + (bal.cashBalance ?? 0)),
      unrealizedPnL,
      realizedPnL: 0,
      portfolioValue: longMv + shortMv,
      buyingPower: bal.buyingPower ?? 0,
    }
  }

  async getPositions(): Promise<Position[]> {
    const response = await this.client.trader.accounts.getAccountByNumber({
      pathParams: { accountNumber: this.accountHash },
      queryParams: { fields: 'positions' },
    }) as unknown as { securitiesAccount: SchwabAccountsResponse['account']['securitiesAccount'] }

    const positions = response.securitiesAccount.positions ?? []
    return positions.map(p => this.mapPosition(p))
  }

  async getOrders(): Promise<Order[]> {
    const orders = await this.client.trader.orders.getOrdersByAccount({
      pathParams: { accountNumber: this.accountHash },
      queryParams: { maxResults: 100 },
    }) as unknown as SchwabOrderRaw[]

    return (orders ?? []).map(o => this.mapOrder(o))
  }

  async getQuote(contract: Contract): Promise<Quote> {
    const symbol = resolveSymbol(contract, this.provider)
    if (!symbol) throw new Error('Cannot resolve contract to Schwab symbol')

    const response = await this.client.marketData.quotes.getQuotes({
      queryParams: { symbols: [symbol], fields: ['quote'] },
    }) as unknown as Record<string, SchwabQuoteRaw>

    const data = response[symbol]
    if (!data?.quote) throw new Error(`No quote data for ${symbol}`)

    return {
      contract: makeContract(symbol, this.provider),
      last: data.quote.lastPrice,
      bid: data.quote.bidPrice,
      ask: data.quote.askPrice,
      volume: data.quote.totalVolume,
      high: data.quote.highPrice,
      low: data.quote.lowPrice,
      timestamp: new Date(data.quote.tradeTime),
    }
  }

  async getMarketClock(): Promise<MarketClock> {
    const response = await this.client.marketData.marketHours.getMarketHours({
      queryParams: { markets: ['equity'] },
    }) as unknown as { equity?: Record<string, SchwabMarketHoursRaw> }

    const equityHours = response?.equity
    if (!equityHours) {
      return { isOpen: false }
    }

    const market = Object.values(equityHours)[0]
    if (!market) return { isOpen: false }

    const regularSession = market.sessionHours?.regularMarket?.[0]
    const result: MarketClock = {
      isOpen: market.isOpen,
      timestamp: new Date(),
    }

    if (regularSession) {
      if (market.isOpen) {
        result.nextClose = new Date(regularSession.end)
      } else {
        result.nextOpen = new Date(regularSession.start)
      }
    }

    return result
  }

  // ---- Capabilities ----

  getCapabilities(): AccountCapabilities {
    return {
      supportedSecTypes: ['STK', 'OPT'],
      supportedOrderTypes: ['market', 'limit', 'stop', 'stop_limit', 'trailing_stop'],
    }
  }

  // ---- Internal helpers ----

  private buildSchwabOrder(symbol: string, order: OrderRequest): Record<string, unknown> {
    const schwabOrder: Record<string, unknown> = {
      orderType: this.mapOrderType(order.type),
      session: order.extendedHours ? 'SEAMLESS' : 'NORMAL',
      duration: this.mapTimeInForce(order.timeInForce ?? 'day'),
      orderStrategyType: 'SINGLE',
      orderLegCollection: [{
        instruction: order.side.toUpperCase(),
        quantity: order.qty,
        instrument: {
          symbol,
          assetType: 'EQUITY',
        },
      }],
    }

    if (order.price != null) schwabOrder.price = order.price.toString()
    if (order.stopPrice != null) schwabOrder.stopPrice = order.stopPrice.toString()
    if (order.trailingAmount != null) {
      schwabOrder.stopPriceLinkBasis = 'LAST'
      schwabOrder.stopPriceLinkType = 'VALUE'
      schwabOrder.stopPriceOffset = order.trailingAmount
    }
    if (order.trailingPercent != null) {
      schwabOrder.stopPriceLinkBasis = 'LAST'
      schwabOrder.stopPriceLinkType = 'PERCENT'
      schwabOrder.stopPriceOffset = order.trailingPercent
    }

    return schwabOrder
  }

  private mapOrderType(type: string): string {
    switch (type) {
      case 'market': return 'MARKET'
      case 'limit': return 'LIMIT'
      case 'stop': return 'STOP'
      case 'stop_limit': return 'STOP_LIMIT'
      case 'trailing_stop': return 'TRAILING_STOP'
      default: return 'MARKET'
    }
  }

  private mapTimeInForce(tif: string): string {
    switch (tif) {
      case 'day': return 'DAY'
      case 'gtc': return 'GOOD_TILL_CANCEL'
      case 'fok': return 'FILL_OR_KILL'
      case 'ioc': return 'IMMEDIATE_OR_CANCEL'
      default: return 'DAY'
    }
  }

  private mapPosition(p: SchwabPositionRaw): Position {
    const isLong = p.longQuantity > 0
    const qty = isLong ? p.longQuantity : p.shortQuantity
    const currentPrice = qty > 0 ? p.marketValue / qty : 0

    return {
      contract: makeContract(p.instrument.symbol, this.provider),
      side: isLong ? 'long' : 'short',
      qty,
      avgEntryPrice: p.averagePrice,
      currentPrice: Math.abs(currentPrice),
      marketValue: Math.abs(p.marketValue),
      unrealizedPnL: p.currentDayProfitLoss,
      unrealizedPnLPercent: p.currentDayProfitLossPercentage,
      costBasis: p.averagePrice * qty,
      leverage: 1,
    }
  }

  private mapOrder(o: SchwabOrderRaw): Order {
    const leg = o.orderLegCollection?.[0]
    const symbol = leg?.instrument?.symbol ?? 'UNKNOWN'

    return {
      id: String(o.orderId),
      contract: makeContract(symbol, this.provider),
      side: (leg?.instruction?.toLowerCase() === 'sell' ? 'sell' : 'buy') as 'buy' | 'sell',
      type: this.reversMapOrderType(o.orderType),
      qty: o.quantity,
      price: o.price,
      stopPrice: o.stopPrice,
      timeInForce: this.reverseMapTimeInForce(o.duration),
      status: mapSchwabOrderStatus(o.status),
      filledPrice: o.filledQuantity > 0 && o.price ? o.price : undefined,
      filledQty: o.filledQuantity > 0 ? o.filledQuantity : undefined,
      createdAt: new Date(o.enteredTime),
    }
  }

  private reversMapOrderType(type: string): Order['type'] {
    switch (type) {
      case 'MARKET': return 'market'
      case 'LIMIT': return 'limit'
      case 'STOP': return 'stop'
      case 'STOP_LIMIT': return 'stop_limit'
      case 'TRAILING_STOP': return 'trailing_stop'
      default: return 'market'
    }
  }

  private reverseMapTimeInForce(duration: string): Order['timeInForce'] {
    switch (duration) {
      case 'DAY': return 'day'
      case 'GOOD_TILL_CANCEL': return 'gtc'
      case 'FILL_OR_KILL': return 'fok'
      case 'IMMEDIATE_OR_CANCEL': return 'ioc'
      default: return 'day'
    }
  }
}
