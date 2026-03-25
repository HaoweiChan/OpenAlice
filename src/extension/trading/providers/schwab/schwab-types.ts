export interface SchwabAccountConfig {
  id?: string
  label?: string
  clientId: string
  clientSecret: string
  redirectUri: string
}

// ==================== Schwab API response shapes ====================

export interface SchwabSecuritiesAccount {
  type: string
  accountNumber: string
  roundTrips: number
  isDayTrader: boolean
  isClosingOnlyRestricted: boolean
  pfcbFlag: boolean
  positions?: SchwabPositionRaw[]
  currentBalances: {
    cashBalance: number
    equity: number
    longMarketValue: number
    shortMarketValue: number
    buyingPower: number
    availableFunds: number
    maintenanceRequirement: number
    dayTradingBuyingPower?: number
  }
}

export interface SchwabAccountResponse {
  securitiesAccount: SchwabSecuritiesAccount
  aggregatedBalance?: { currentLiquidationValue: number }
}

export interface SchwabAccountsResponse {
  hashValue: string
  account: SchwabAccountResponse
}

export interface SchwabPositionRaw {
  shortQuantity: number
  averagePrice: number
  currentDayProfitLoss: number
  currentDayProfitLossPercentage: number
  longQuantity: number
  settledLongQuantity: number
  settledShortQuantity: number
  instrument: {
    assetType: string
    cusip: string
    symbol: string
    description?: string
    type?: string
  }
  marketValue: number
  maintenanceRequirement?: number
  currentDayCost: number
}

export interface SchwabOrderLeg {
  orderLegType: string
  legId: number
  instrument: {
    assetType: string
    cusip?: string
    symbol: string
    description?: string
  }
  instruction: string
  positionEffect?: string
  quantity: number
}

export interface SchwabOrderRaw {
  session: string
  duration: string
  orderType: string
  complexOrderStrategyType: string
  quantity: number
  filledQuantity: number
  remainingQuantity: number
  requestedDestination?: string
  destinationLinkName?: string
  price?: number
  stopPrice?: number
  stopPriceLinkBasis?: string
  stopPriceLinkType?: string
  stopPriceOffset?: number
  orderLegCollection: SchwabOrderLeg[]
  orderStrategyType: string
  orderId: number
  cancelable: boolean
  editable: boolean
  status: string
  enteredTime: string
  closeTime?: string
  tag?: string
  accountNumber?: number
}

export interface SchwabQuoteRaw {
  assetType: string
  assetMainType: string
  ssid: number
  symbol: string
  realtime: boolean
  quote: {
    lastPrice: number
    bidPrice: number
    askPrice: number
    totalVolume: number
    highPrice: number
    lowPrice: number
    openPrice: number
    closePrice: number
    netChange: number
    netPercentChange: number
    tradeTime: number
    quoteTime: number
    mark: number
    '52WeekHigh'?: number
    '52WeekLow'?: number
  }
  fundamental?: {
    symbol: string
    high52: number
    low52: number
    peRatio: number
    divAmount: number
    divYield: number
    marketCap: number
    description: string
  }
  reference?: {
    cusip: string
    description: string
    exchange: string
    exchangeName: string
    type: string
  }
}

export interface SchwabInstrumentRaw {
  cusip: string
  symbol: string
  description: string
  exchange: string
  assetType: string
  fundamental?: {
    symbol: string
    high52: number
    low52: number
    peRatio: number
    divAmount: number
    divYield: number
    marketCap: number
  }
}

export interface SchwabMarketHoursRaw {
  date: string
  marketType: string
  exchange?: string
  category?: string
  product: string
  productName: string
  isOpen: boolean
  sessionHours?: {
    preMarket?: Array<{ start: string; end: string }>
    regularMarket?: Array<{ start: string; end: string }>
    postMarket?: Array<{ start: string; end: string }>
  }
}

export interface SchwabTransactionRaw {
  activityId: number
  time: string
  type: string
  status: string
  subAccount: string
  tradeDate: string
  netAmount: number
  transferItems?: Array<{
    instrument: { symbol: string; assetType: string }
    amount: number
    cost: number
    price: number
  }>
}
