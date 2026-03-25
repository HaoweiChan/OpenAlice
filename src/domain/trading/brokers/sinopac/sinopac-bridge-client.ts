import WebSocket from 'ws'
import type {
  BridgeHealthResponse,
  BridgeLoginResponse,
  BridgeContract,
  BridgeTrade,
  BridgeOrderRequest,
  BridgeOrderUpdateRequest,
  BridgeSnapshot,
  BridgeKbars,
  BridgeTicks,
  BridgeAccount,
  BridgePosition,
  BridgeAccountBalance,
} from './sinopac-types.js'

export interface BarEvent {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type BarCallback = (code: string, timeframe: string, bar: BarEvent) => void
export type TickCallback = (code: string, data: Record<string, unknown>) => void

interface StreamSubscription {
  code: string
  securityType: string
  quoteType: 'tick' | 'bar' | 'bidask'
  timeframe?: string
  callback: BarCallback | TickCallback
}


export class SinopacBridgeClient {
  private _ws: WebSocket | null = null
  private _wsReconnectTimer: ReturnType<typeof setTimeout> | null = null
  private _wsReconnectDelay = 1000
  private _wsSubscriptions = new Map<string, StreamSubscription>()
  private _wsConnecting = false

  constructor(private readonly baseUrl: string) {}

  // ==================== Health / Auth ====================

  async health(): Promise<BridgeHealthResponse> {
    return this._get('/health')
  }

  async login(apiKey: string, secretKey: string): Promise<BridgeLoginResponse> {
    return this._post('/login', { api_key: apiKey, secret_key: secretKey })
  }

  async waitForHealth(timeoutMs = 30_000, pollMs = 1_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        const res = await this.health()
        if (res.status === 'ok') return
      } catch {
        // bridge not ready yet
      }
      await new Promise((r) => setTimeout(r, pollMs))
    }
    throw new Error(`Bridge not available at ${this.baseUrl} after ${timeoutMs}ms`)
  }

  // ==================== Contracts ====================

  async getContract(securityType: string, code: string): Promise<BridgeContract | null> {
    try {
      return await this._get(`/contracts/${securityType}/${code}`)
    } catch (e: any) {
      if (e.status === 404) return null
      throw e
    }
  }

  async searchContracts(query: string): Promise<BridgeContract[]> {
    return this._get(`/contracts/search?q=${encodeURIComponent(query)}`)
  }

  // ==================== Orders ====================

  async placeOrder(req: BridgeOrderRequest): Promise<BridgeTrade> {
    return this._post('/orders', req)
  }

  async updateOrder(orderId: string, req: BridgeOrderUpdateRequest): Promise<BridgeTrade> {
    return this._request('PUT', `/orders/${orderId}`, req)
  }

  async cancelOrder(orderId: string): Promise<BridgeTrade> {
    return this._request('DELETE', `/orders/${orderId}`)
  }

  async listOrders(accountType = 'stock'): Promise<BridgeTrade[]> {
    return this._get(`/orders?account_type=${accountType}`)
  }

  // ==================== Market Data ====================

  async snapshots(codes: string[], securityType = 'stocks'): Promise<BridgeSnapshot[]> {
    return this._get(`/snapshots?codes=${codes.join(',')}&security_type=${securityType}`)
  }

  async kbars(code: string, securityType: string, start: string, end: string): Promise<BridgeKbars> {
    return this._get(`/kbars?code=${code}&security_type=${securityType}&start=${start}&end=${end}`)
  }

  async ticks(code: string, securityType: string, date: string): Promise<BridgeTicks> {
    return this._get(`/ticks?code=${code}&security_type=${securityType}&date=${date}`)
  }

  // ==================== Accounts ====================

  async listAccounts(): Promise<BridgeAccount[]> {
    return this._get('/accounts')
  }

  // ==================== Positions & Balance ====================

  async listPositions(accountType = 'stock'): Promise<BridgePosition[]> {
    return this._get(`/positions?account_type=${accountType}`)
  }

  async getAccountBalance(): Promise<BridgeAccountBalance> {
    return this._get('/account-balance')
  }

  // ==================== WebSocket Streaming ====================

  subscribeBars(code: string, securityType: string, timeframe: string, callback: BarCallback): void {
    const key = `bar:${code}:${timeframe}`
    this._wsSubscriptions.set(key, { code, securityType, quoteType: 'bar', timeframe, callback })
    this._ensureWsConnected()
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ action: 'subscribe', code, security_type: securityType, quote_type: 'bar', timeframe }))
    }
  }

  unsubscribeBars(code: string, securityType: string, timeframe: string): void {
    const key = `bar:${code}:${timeframe}`
    this._wsSubscriptions.delete(key)
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ action: 'unsubscribe', code, security_type: securityType, quote_type: 'bar', timeframe }))
    }
    if (this._wsSubscriptions.size === 0) this.disconnectStream()
  }

  subscribeTicks(code: string, securityType: string, callback: TickCallback): void {
    const key = `tick:${code}`
    this._wsSubscriptions.set(key, { code, securityType, quoteType: 'tick', callback })
    this._ensureWsConnected()
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ action: 'subscribe', code, security_type: securityType, quote_type: 'tick' }))
    }
  }

  unsubscribeTicks(code: string, securityType: string): void {
    const key = `tick:${code}`
    this._wsSubscriptions.delete(key)
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ action: 'unsubscribe', code, security_type: securityType, quote_type: 'tick' }))
    }
    if (this._wsSubscriptions.size === 0) this.disconnectStream()
  }

  subscribeBidask(code: string, securityType: string, callback: TickCallback): void {
    const key = `bidask:${code}`
    this._wsSubscriptions.set(key, { code, securityType, quoteType: 'bidask', callback })
    this._ensureWsConnected()
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ action: 'subscribe', code, security_type: securityType, quote_type: 'bidask' }))
    }
  }

  unsubscribeBidask(code: string, securityType: string): void {
    const key = `bidask:${code}`
    this._wsSubscriptions.delete(key)
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ action: 'unsubscribe', code, security_type: securityType, quote_type: 'bidask' }))
    }
    if (this._wsSubscriptions.size === 0) this.disconnectStream()
  }

  disconnectStream(): void {
    if (this._wsReconnectTimer) {
      clearTimeout(this._wsReconnectTimer)
      this._wsReconnectTimer = null
    }
    if (this._ws) {
      this._ws.removeAllListeners()
      this._ws.close()
      this._ws = null
    }
    this._wsConnecting = false
  }

  private _ensureWsConnected(): void {
    if (this._ws?.readyState === WebSocket.OPEN || this._wsConnecting) return
    this._wsConnecting = true
    const wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/stream'
    const ws = new WebSocket(wsUrl)

    ws.on('open', () => {
      this._ws = ws
      this._wsConnecting = false
      this._wsReconnectDelay = 1000
      // Replay all subscriptions
      for (const sub of this._wsSubscriptions.values()) {
        const msg: Record<string, string> = {
          action: 'subscribe',
          code: sub.code,
          security_type: sub.securityType,
          quote_type: sub.quoteType,
        }
        if (sub.timeframe) msg.timeframe = sub.timeframe
        ws.send(JSON.stringify(msg))
      }
    })

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.topic === 'bar' && msg.code && msg.timeframe) {
          const key = `bar:${msg.code}:${msg.timeframe}`
          const sub = this._wsSubscriptions.get(key)
          if (sub && sub.quoteType === 'bar') {
            ;(sub.callback as BarCallback)(msg.code, msg.timeframe, msg.data as BarEvent)
          }
        } else if (msg.topic && msg.data) {
          const code = msg.data?.code ?? msg.topic.split('/').pop() ?? ''
          const isBidask = msg.topic.includes('bidask') || msg.data?.BidPrice !== undefined
          const key = isBidask ? `bidask:${code}` : `tick:${code}`
          const sub = this._wsSubscriptions.get(key)
          if (sub) {
            ;(sub.callback as TickCallback)(code, msg.data)
          }
        }
      } catch { /* ignore malformed messages */ }
    })

    ws.on('close', () => {
      this._ws = null
      this._wsConnecting = false
      if (this._wsSubscriptions.size > 0) this._scheduleReconnect()
    })

    ws.on('error', () => {
      ws.close()
    })
  }

  private _scheduleReconnect(): void {
    if (this._wsReconnectTimer) return
    this._wsReconnectTimer = setTimeout(() => {
      this._wsReconnectTimer = null
      if (this._wsSubscriptions.size > 0) this._ensureWsConnected()
    }, this._wsReconnectDelay)
    this._wsReconnectDelay = Math.min(this._wsReconnectDelay * 2, 30_000)
  }

  // ==================== Internal ====================

  private async _get<T>(path: string): Promise<T> {
    return this._request('GET', path)
  }

  private async _post<T>(path: string, body?: unknown): Promise<T> {
    return this._request('POST', path, body)
  }

  private async _request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const opts: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
    }
    if (body && method !== 'GET') {
      opts.body = JSON.stringify(body)
    }

    let res: Response
    try {
      res = await fetch(url, opts)
    } catch (e: any) {
      if (e.name === 'TimeoutError' || e.name === 'AbortError') {
        // Retry once on timeout
        try {
          res = await fetch(url, { ...opts, signal: AbortSignal.timeout(30_000) })
        } catch {
          throw Object.assign(new Error(`Bridge not available at ${this.baseUrl}`), { status: 0 })
        }
      } else {
        throw Object.assign(new Error(`Bridge not available at ${this.baseUrl}`), { status: 0 })
      }
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Bridge error: ${detail}`), { status: res.status })
    }
    return res.json() as Promise<T>
  }
}
