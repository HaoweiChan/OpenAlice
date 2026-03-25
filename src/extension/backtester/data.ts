/**
 * Backtester — OHLCV data fetching
 *
 * Fetches historical candle data via OpenBB SDK clients or CCXT,
 * with asset class auto-detection, data normalization, and caching.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { EquityClientLike, CryptoClientLike, CurrencyClientLike } from '../../domain/market-data/client/types.js'
import type { Candle } from './types.js'

export type DataSource = 'openbb' | 'ccxt' | 'sinopac'

export interface CcxtAccountLike {
  fetchOHLCV(
    symbol: string,
    timeframe: string,
    since?: number,
    limit?: number,
  ): Promise<Array<[number, number, number, number, number, number]>>
}

export interface SinopacClientLike {
  kbars(code: string, securityType: string, start: string, end: string): Promise<{
    ts: number[]
    open: number[]
    high: number[]
    low: number[]
    close: number[]
    volume: number[]
  }>
}

export interface DataClients {
  equity: EquityClientLike
  crypto: CryptoClientLike
  currency: CurrencyClientLike
  ccxtAccount?: CcxtAccountLike
  sinopacClient?: SinopacClientLike
}

export type AssetClass = 'equity' | 'crypto' | 'currency' | 'tw_futures'

const CRYPTO_BASES = new Set([
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'DOT', 'MATIC',
  'LINK', 'UNI', 'AAVE', 'ATOM', 'LTC', 'FIL', 'APT', 'ARB', 'OP', 'SUI',
  'NEAR', 'FTM', 'ALGO', 'ICP', 'TRX', 'SHIB', 'PEPE', 'WIF', 'JUP',
])

const FIAT_CODES = new Set([
  'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD', 'CNY', 'HKD', 'SGD',
  'SEK', 'NOK', 'DKK', 'TWD', 'KRW', 'INR', 'MXN', 'BRL', 'ZAR',
])

const TW_FUTURES_CODES = new Set([
  'TX', 'TXF', 'MTX', 'MXF', 'EXF', 'FXF', 'ZEF', 'ZFF',
  'T5F', 'TJF', 'SPF', 'UDF', 'UNF', 'GTF', 'XIF', 'G2F',
])

function isTaiwanFutures(symbol: string): boolean {
  const upper = symbol.toUpperCase()
  const base = upper.replace(/[A-Z]\d$/, '') // strip month code like "D6"
  return TW_FUTURES_CODES.has(upper) || TW_FUTURES_CODES.has(base)
}

export function detectAssetClass(symbol: string): AssetClass {
  const upper = symbol.toUpperCase()

  if (isTaiwanFutures(upper)) return 'tw_futures'

  // Handle slash format: BTC/USD, EUR/USD
  if (upper.includes('/')) {
    const base = upper.split('/')[0]
    if (CRYPTO_BASES.has(base)) return 'crypto'
    if (FIAT_CODES.has(base)) return 'currency'
  }

  // Handle dash format: BTC-USD
  if (upper.includes('-')) {
    const base = upper.split('-')[0]
    if (CRYPTO_BASES.has(base)) return 'crypto'
    if (FIAT_CODES.has(base)) return 'currency'
  }

  // Handle concatenated format: BTCUSD, BTCUSDT
  for (const base of CRYPTO_BASES) {
    if (upper.startsWith(base) && upper.length > base.length) return 'crypto'
  }

  return 'equity'
}

function toUnixSeconds(dateStr: string): number {
  const d = new Date(dateStr)
  return Math.floor(d.getTime() / 1000)
}

function normalizeCandles(rawData: Record<string, unknown>[]): Candle[] {
  const candles: Candle[] = []

  for (const row of rawData) {
    const dateVal = row.date ?? row.Date ?? row.datetime ?? row.timestamp
    if (!dateVal) continue

    const ts = typeof dateVal === 'number'
      ? (dateVal > 1e12 ? Math.floor(dateVal / 1000) : dateVal)
      : toUnixSeconds(String(dateVal))

    candles.push({
      timestamp: ts,
      open: Number(row.open ?? row.Open ?? 0),
      high: Number(row.high ?? row.High ?? 0),
      low: Number(row.low ?? row.Low ?? 0),
      close: Number(row.close ?? row.Close ?? 0),
      volume: Number(row.volume ?? row.Volume ?? 0),
    })
  }

  candles.sort((a, b) => a.timestamp - b.timestamp)
  return candles
}

export interface FetchOhlcvResult {
  success: boolean
  candles?: Candle[]
  error?: string
  source?: DataSource
}

function normalizeCryptoSymbol(symbol: string): string {
  return symbol.replace('/', '')
}

// Candle data cache
const CACHE_DIR = resolve('data/backtests/cache')

function cacheKey(symbol: string, interval: string, startDate: string, endDate: string, source: DataSource): string {
  const s = symbol.replace(/[^a-zA-Z0-9]/g, '_')
  return `${s}_${interval}_${startDate}_${endDate}_${source}.json`
}

async function readCache(key: string): Promise<Candle[] | null> {
  try {
    const raw = await readFile(resolve(CACHE_DIR, key), 'utf-8')
    return JSON.parse(raw) as Candle[]
  } catch { return null }
}

async function writeCache(key: string, candles: Candle[]): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true })
    await writeFile(resolve(CACHE_DIR, key), JSON.stringify(candles))
  } catch { /* non-fatal */ }
}

async function fetchViaCcxt(
  symbol: string,
  interval: string,
  startDate: string,
  endDate: string,
  ccxtAccount: CcxtAccountLike,
): Promise<FetchOhlcvResult> {
  const since = new Date(startDate).getTime()
  const endMs = new Date(endDate).getTime()
  const allCandles: Candle[] = []
  let cursor = since

  // CCXT returns at most ~1000 candles per call; paginate
  while (cursor < endMs) {
    const batch = await ccxtAccount.fetchOHLCV(symbol, interval, cursor, 1000)
    if (!batch || batch.length === 0) break

    for (const [ts, open, high, low, close, volume] of batch) {
      if (ts > endMs) break
      allCandles.push({
        timestamp: Math.floor(ts / 1000),
        open, high, low, close, volume,
      })
    }

    const lastTs = batch[batch.length - 1][0]
    if (lastTs <= cursor) break
    cursor = lastTs + 1
  }

  if (allCandles.length === 0) {
    return { success: false, error: `No CCXT candle data returned for ${symbol}` }
  }

  allCandles.sort((a, b) => a.timestamp - b.timestamp)
  return { success: true, candles: allCandles, source: 'ccxt' }
}

async function fetchViaSinopac(
  symbol: string,
  securityType: string,
  startDate: string,
  endDate: string,
  client: SinopacClientLike,
): Promise<FetchOhlcvResult> {
  const resp = await client.kbars(symbol, securityType, startDate, endDate)
  if (!resp.ts || resp.ts.length === 0) {
    return { success: false, error: `No Sinopac kbar data returned for ${symbol}` }
  }

  const candles: Candle[] = resp.ts.map((ts, i) => ({
    timestamp: ts > 1e15 ? Math.floor(ts / 1e9) : ts > 1e12 ? Math.floor(ts / 1000) : ts,
    open: resp.open[i],
    high: resp.high[i],
    low: resp.low[i],
    close: resp.close[i],
    volume: resp.volume[i],
  }))

  candles.sort((a, b) => a.timestamp - b.timestamp)
  return { success: true, candles, source: 'sinopac' }
}

export async function fetchOhlcv(
  symbol: string,
  interval: string,
  startDate: string,
  endDate: string,
  assetClass: AssetClass | undefined,
  clients: DataClients,
  dataSource?: DataSource,
): Promise<FetchOhlcvResult> {
  const asset = assetClass ?? detectAssetClass(symbol)
  const source = dataSource ?? (asset === 'tw_futures' ? 'sinopac' : 'openbb')

  // Check cache first
  const key = cacheKey(symbol, interval, startDate, endDate, source)
  const cached = await readCache(key)
  if (cached && cached.length > 0) {
    return { success: true, candles: cached, source }
  }

  // CCXT path
  if (source === 'ccxt') {
    if (!clients.ccxtAccount) {
      console.warn('backtester: CCXT requested but no account available, falling back to OpenBB')
    } else {
      try {
        const result = await fetchViaCcxt(symbol, interval, startDate, endDate, clients.ccxtAccount)
        if (result.success && result.candles) {
          await writeCache(key, result.candles)
        }
        return result
      } catch (err) {
        console.warn(`backtester: CCXT fetch failed, falling back to OpenBB: ${err}`)
      }
    }
  }

  // Sinopac path
  if (source === 'sinopac' || asset === 'tw_futures') {
    if (!clients.sinopacClient) {
      return { success: false, error: 'Sinopac bridge unavailable — no client configured' }
    }
    try {
      const result = await fetchViaSinopac(symbol, 'futures', startDate, endDate, clients.sinopacClient)
      if (result.success && result.candles) {
        await writeCache(key, result.candles)
      }
      return result
    } catch (err) {
      return { success: false, error: `Sinopac fetch failed: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  // OpenBB path
  const normalizedSymbol = asset === 'crypto' ? normalizeCryptoSymbol(symbol) : symbol
  const params: Record<string, unknown> = {
    symbol: normalizedSymbol,
    start_date: startDate,
    end_date: endDate,
    interval,
  }

  try {
    let rawData: Record<string, unknown>[]

    switch (asset) {
      case 'equity':
        rawData = await clients.equity.getHistorical(params)
        break
      case 'crypto':
        rawData = await clients.crypto.getHistorical(params)
        break
      case 'currency':
        rawData = await clients.currency.getHistorical(params)
        break
    }

    if (!rawData || rawData.length === 0) {
      return { success: false, error: `No candle data returned for ${symbol} (${asset}, ${interval}, ${startDate} to ${endDate})` }
    }

    const candles = normalizeCandles(rawData)
    if (candles.length === 0) {
      return { success: false, error: `Failed to normalize candle data for ${symbol}` }
    }

    await writeCache(key, candles)
    return { success: true, candles, source: 'openbb' }
  } catch (err) {
    return { success: false, error: `Data fetch failed: ${err instanceof Error ? err.message : String(err)}` }
  }
}
