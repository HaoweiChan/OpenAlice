/** Bridge API request/response types for Sinopac/Shioaji. */

export interface BridgeHealthResponse {
  status: string
  logged_in: boolean
}

export interface BridgeLoginRequest {
  api_key: string
  secret_key: string
}

export interface BridgeAccount {
  account_type: string
  person_id: string
  broker_id: string
  account_id: string
  signed: boolean
  username: string
}

export interface BridgeLoginResponse {
  ok: boolean
  accounts: BridgeAccount[]
  error?: string
}

export interface BridgeContract {
  code: string
  symbol: string
  name: string
  exchange?: string
  category?: string
  limit_up?: number
  limit_down?: number
  reference?: number
  unit?: number
  day_trade?: string
  delivery_month?: string
  delivery_date?: string
  underlying_kind?: string
  strike_price?: number
  option_right?: string
  security_type?: string
}

export interface BridgeDeal {
  seq: string
  price: number
  quantity: number
  ts: number
}

export interface BridgeTrade {
  order_id: string
  action: string
  price: number
  quantity: number
  status: string
  order_datetime: string | null
  deals: BridgeDeal[]
  contract: BridgeContract
}

export interface BridgeOrderRequest {
  contract_code: string
  security_type: string
  action: string
  price: number
  quantity: number
  price_type: string
  order_type: string
  order_cond?: string
  order_lot?: string
  octype?: string
  daytrade_short?: boolean
}

export interface BridgeOrderUpdateRequest {
  price?: number
  quantity?: number
}

export interface BridgeSnapshot {
  code: string
  exchange: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  total_volume: number
  amount: number
  total_amount: number
  buy_price: number
  buy_volume: number
  sell_price: number
  sell_volume: number
  change_price: number
  change_rate: number
  ts: number
}

export interface BridgePosition {
  id: string
  code: string
  direction: string
  quantity: number
  price: number
  last_price: number
  pnl: number
}

export interface BridgeAccountBalance {
  acc_balance: number
  available_balance: number
  equity: number
  equity_amount: number
  margin: number
  maintenance_margin: number
  unrealized_pnl: number
  realized_pnl: number
  yesterday_balance: number
  risk_indicator: number
}

export interface BridgeKbars {
  ts: number[]
  open: number[]
  high: number[]
  low: number[]
  close: number[]
  volume: number[]
}

export interface BridgeTicks {
  ts: number[]
  close: number[]
  volume: number[]
  bid_price: number[]
  bid_volume: number[]
  ask_price: number[]
  ask_volume: number[]
  tick_type: number[]
}
