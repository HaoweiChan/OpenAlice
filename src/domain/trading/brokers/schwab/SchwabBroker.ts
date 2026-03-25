/**
 * Schwab IBroker adapter — US equities + options via Schwab API.
 *
 * Uses @sudowealth/schwab-api for OAuth token management and API calls.
 * Token persistence handled by schwab-auth.ts (file-based).
 */

import type { Contract, ContractDescription, ContractDetails, Order, OrderCancel } from '@traderalice/ibkr'
import type Decimal from 'decimal.js'
import type {
  IBroker,
  Position,
  PlaceOrderResult,
  OpenOrder,
  AccountInfo,
  Quote,
  MarketClock,
  AccountCapabilities,
} from '../types.js'
import { createSchwabAuthClient, completeAuth } from './schwab-auth.js'

// Loose type for the Schwab API client (avoids tight coupling to SDK types)
type SchwabClient = {
  trader: {
    accounts: {
      getAccountNumbers: (p?: unknown) => Promise<unknown>
      getAccountByNumber: (p: unknown) => Promise<unknown>
    }
    orders: {
      getOrdersByAccount: (p: unknown) => Promise<unknown>
    }
  }
  marketData: {
    quotes: { getQuotes: (p: unknown) => Promise<unknown> }
    marketHours: { getMarketHours: (p: unknown) => Promise<unknown> }
  }
}


export interface SchwabBrokerConfig {
  id: string
  label?: string
  clientId: string
  clientSecret: string
  redirectUri: string
}

export class SchwabBroker implements IBroker {
  readonly id: string
  readonly provider = 'schwab'
  readonly label: string
  private readonly config: SchwabBrokerConfig
  private auth: Awaited<ReturnType<typeof createSchwabAuthClient>> | null = null
  private api: SchwabClient | null = null
  private accountHash: string | null = null
  private connected = false

  constructor(config: SchwabBrokerConfig) {
    this.config = config
    this.id = config.id
    this.label = config.label ?? 'Schwab'
  }

  async init(): Promise<void> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error(
        'No Schwab API credentials configured. Set apiKey (Client ID) and apiSecret (Client Secret) in accounts.json.',
      )
    }

    try {
      this.auth = await createSchwabAuthClient(
        this.config.clientId,
        this.config.clientSecret,
        this.config.redirectUri,
        this.id,
      )

      const ready = await this.auth.initialize().catch(() => false)
      if (!ready) {
        const { authUrl } = await this.auth.getAuthorizationUrl()
        throw new Error(
          `Schwab OAuth tokens not found for "${this.id}".\n` +
          `Visit to authorize: ${authUrl}\n` +
          `Then complete the callback flow to store tokens.`,
        )
      }

      const { createApiClient } = await import('@sudowealth/schwab-api')
      this.api = createApiClient({ auth: this.auth }) as unknown as SchwabClient
      await this.resolveAccountHash()
      this.connected = true
      console.log(`SchwabBroker[${this.id}]: connected (hash=${this.accountHash?.slice(0, 8)}...)`)
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err))
    }
  }

  async close(): Promise<void> {
    this.connected = false
  }

  private async resolveAccountHash(): Promise<void> {
    const response = await this.api!.trader.accounts.getAccountNumbers() as unknown as
      Array<{ accountNumber: string; hashValue: string }>
    if (!response || response.length === 0) {
      throw new Error('No Schwab accounts found. Ensure your developer app is linked to a brokerage account.')
    }
    this.accountHash = response[0].hashValue
  }

  private async ensureAuth() {
    if (!this.auth) {
      this.auth = await createSchwabAuthClient(
        this.config.clientId,
        this.config.clientSecret,
        this.config.redirectUri,
        this.id,
      )
    }
    return this.auth
  }

  async getAuthUrl(): Promise<string> {
    const auth = await this.ensureAuth()
    const { authUrl } = await auth.getAuthorizationUrl()
    return authUrl
  }

  async completeOAuth(callbackUrl: string): Promise<void> {
    const auth = await this.ensureAuth()
    await completeAuth(auth, callbackUrl, this.id)
    const { createApiClient } = await import('@sudowealth/schwab-api')
    this.api = createApiClient({ auth }) as unknown as SchwabClient
    await this.resolveAccountHash()
    this.connected = true
    console.log(`SchwabBroker[${this.id}]: OAuth completed, connected`)
  }

  private requireConnected(): SchwabClient {
    if (!this.connected || !this.api) throw new Error(`SchwabBroker[${this.id}]: not connected`)
    return this.api
  }

  // ==================== Contract search ====================

  async searchContracts(_pattern: string): Promise<ContractDescription[]> {
    this.requireConnected()
    return []
  }

  async getContractDetails(_query: Contract): Promise<ContractDetails | null> {
    this.requireConnected()
    return null
  }

  // ==================== Trading operations ====================

  async placeOrder(_contract: Contract, _order: Order): Promise<PlaceOrderResult> {
    this.requireConnected()
    return { success: false, error: 'Schwab order placement not yet implemented in domain layer' }
  }

  async modifyOrder(_orderId: string, _changes: Order): Promise<PlaceOrderResult> {
    this.requireConnected()
    return { success: false, error: 'Schwab order modification not yet implemented' }
  }

  async cancelOrder(_orderId: string, _orderCancel?: OrderCancel): Promise<boolean> {
    this.requireConnected()
    return false
  }

  async closePosition(_contract: Contract, _quantity?: Decimal): Promise<PlaceOrderResult> {
    this.requireConnected()
    return { success: false, error: 'Schwab close position not yet implemented' }
  }

  // ==================== Queries ====================

  async getAccount(): Promise<AccountInfo> {
    const client = this.requireConnected()
    const response = await client.trader.accounts.getAccountByNumber({
      pathParams: { accountNumber: this.accountHash },
      queryParams: { fields: 'positions' },
    }) as any

    const acct = response?.securitiesAccount ?? response
    const bal = acct?.currentBalances ?? {}
    const positions = acct?.positions ?? []
    const unrealizedPnL = positions.reduce((sum: number, p: any) => sum + (p.currentDayProfitLoss ?? 0), 0)
    const longMv = bal.longMarketValue ?? 0
    const shortMv = bal.shortMarketValue ?? 0

    return {
      netLiquidation: bal.liquidationValue ?? bal.equity ?? (longMv + shortMv + (bal.cashBalance ?? 0)),
      totalCashValue: bal.cashBalance ?? bal.availableFunds ?? 0,
      unrealizedPnL,
      realizedPnL: 0,
      buyingPower: bal.buyingPower ?? 0,
    }
  }

  async getPositions(): Promise<Position[]> {
    const client = this.requireConnected()
    const response = await client.trader.accounts.getAccountByNumber({
      pathParams: { accountNumber: this.accountHash },
      queryParams: { fields: 'positions' },
    }) as any

    const acct = response?.securitiesAccount ?? response
    const positions: any[] = acct?.positions ?? []
    return Promise.all(positions.map((p) => this.mapPosition(p)))
  }

  async getOrders(_orderIds: string[]): Promise<OpenOrder[]> {
    this.requireConnected()
    return []
  }

  async getOrder(_orderId: string): Promise<OpenOrder | null> {
    this.requireConnected()
    return null
  }

  async getQuote(contract: Contract): Promise<Quote> {
    const client = this.requireConnected()
    const symbol = contract.symbol
    if (!symbol) throw new Error('No symbol in contract')

    const response = await client.marketData.quotes.getQuotes({
      queryParams: { symbols: [symbol], fields: ['quote'] },
    }) as any

    const data = response[symbol]
    if (!data?.quote) throw new Error(`No quote data for ${symbol}`)

    return {
      contract: { ...contract, aliceId: `schwab-${symbol}` },
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
    try {
      const client = this.requireConnected()
      const response = await client.marketData.marketHours.getMarketHours({
        queryParams: { markets: ['equity'] },
      }) as any

      const equityHours = response?.equity
      if (!equityHours) return { isOpen: false }

      const market = Object.values(equityHours)[0] as any
      if (!market) return { isOpen: false }

      const regularSession = market.sessionHours?.regularMarket?.[0]
      const result: MarketClock = { isOpen: market.isOpen, timestamp: new Date() }
      if (regularSession) {
        if (market.isOpen) result.nextClose = new Date(regularSession.end)
        else result.nextOpen = new Date(regularSession.start)
      }
      return result
    } catch {
      return { isOpen: false, timestamp: new Date() }
    }
  }

  getCapabilities(): AccountCapabilities {
    return {
      supportedSecTypes: ['STK', 'OPT'],
      supportedOrderTypes: ['market', 'limit', 'stop', 'stop_limit', 'trailing_stop'],
    }
  }

  // ==================== Internal helpers ====================

  private async mapPosition(p: any): Promise<Position> {
    const { default: DecimalClass } = await import('decimal.js')
    const isLong = (p.longQuantity ?? 0) > 0
    const qty = isLong ? p.longQuantity : p.shortQuantity
    const currentPrice = qty > 0 ? Math.abs(p.marketValue / qty) : 0

    return {
      contract: {
        aliceId: `schwab-${p.instrument?.symbol ?? 'UNKNOWN'}`,
        symbol: p.instrument?.symbol ?? 'UNKNOWN',
        secType: p.instrument?.assetType === 'EQUITY' ? 'STK' : p.instrument?.assetType === 'OPTION' ? 'OPT' : 'STK',
        exchange: 'SMART',
        currency: 'USD',
      },
      side: isLong ? 'long' : 'short',
      quantity: new DecimalClass(qty),
      avgCost: p.averagePrice ?? 0,
      marketPrice: currentPrice,
      marketValue: Math.abs(p.marketValue ?? 0),
      unrealizedPnL: p.currentDayProfitLoss ?? 0,
      realizedPnL: 0,
    }
  }
}
