## ADDED Requirements

### Requirement: Schwab platform configuration
The system SHALL accept a platform configuration with `type: 'schwab'` in `platforms.json` containing:
- `id` (string, required): unique platform identifier
- `label` (string, optional): display name, defaults to `'Schwab'`
- `type` (literal `'schwab'`, required): platform type discriminator

The Zod schema `schwabPlatformSchema` SHALL be added to the `platformConfigSchema` discriminated union.

#### Scenario: Schwab platform created from config
- **WHEN** `platforms.json` contains `{ "id": "schwab-platform", "type": "schwab" }`
- **THEN** `createPlatformFromConfig` SHALL return a `SchwabPlatform` instance with `providerType` equal to `'schwab'`

#### Scenario: Platform factory handles all types
- **WHEN** `platforms.json` contains entries with `type: 'ccxt'`, `type: 'alpaca'`, and `type: 'schwab'`
- **THEN** each SHALL create the correct platform class without errors

### Requirement: Account credentials mapping
The system SHALL map `accounts.json` credentials to Schwab OAuth configuration:
- `apiKey` → Schwab OAuth Client ID (App Key)
- `apiSecret` → Schwab OAuth Client Secret
- `password` → OAuth redirect URI (callback URL)

#### Scenario: Credentials passed to SchwabAccount
- **WHEN** `SchwabPlatform.createAccount()` is called with `{ apiKey: 'client-id', apiSecret: 'client-secret', password: 'https://127.0.0.1' }`
- **THEN** the `@sudowealth/schwab-api` auth client SHALL be initialized with `clientId: 'client-id'`, `clientSecret: 'client-secret'`, `redirectUri: 'https://127.0.0.1'`

### Requirement: OAuth token persistence
The system SHALL persist OAuth tokens to `data/config/schwab-tokens-{accountId}.json` and load them on init:
- On `init()`, load tokens from disk if the file exists
- After every token refresh, write updated tokens to disk
- Token file SHALL contain `access_token`, `refresh_token`, `expires_at`, and `token_type`

#### Scenario: Tokens loaded from disk on init
- **WHEN** `init()` is called and `schwab-tokens-{id}.json` exists with valid tokens
- **THEN** the auth client SHALL use those tokens without requiring browser consent

#### Scenario: Tokens persisted after refresh
- **WHEN** the auth middleware refreshes an expired access token
- **THEN** the updated tokens SHALL be written to `schwab-tokens-{id}.json`

### Requirement: Initial OAuth setup flow
The system SHALL provide a clear path for first-time authentication:
- When `init()` is called with no token file, throw an error containing the authorization URL
- The error message SHALL include step-by-step instructions for completing the OAuth flow
- A helper method `completeAuth(callbackUrl: string)` SHALL exchange the authorization code for tokens and persist them

#### Scenario: First init without tokens
- **WHEN** `init()` is called and no token file exists
- **THEN** the system SHALL throw an error with message containing `'Visit this URL to authorize'` and the full authorization URL

#### Scenario: Auth completion with callback URL
- **WHEN** `completeAuth('https://127.0.0.1?code=AUTH_CODE&session=...')` is called
- **THEN** the system SHALL exchange the code for tokens, persist them, and resolve the account hash

### Requirement: Token refresh and expiry handling
The system SHALL handle Schwab's token expiry model:
- Access tokens expire after 30 minutes — auto-refreshed by middleware
- Refresh tokens expire after 7 days — requires full re-authentication
- On `SchwabAuthError` with code `TOKEN_EXPIRED`, throw with re-auth instructions

#### Scenario: Automatic access token refresh
- **WHEN** an API call fails due to expired access token
- **THEN** the middleware SHALL refresh the token, retry the request, and persist the new tokens

#### Scenario: Expired refresh token
- **WHEN** a token refresh fails with `TOKEN_EXPIRED`
- **THEN** the system SHALL throw an error with message containing `'Re-authentication required'` and the authorization URL

### Requirement: Account hash resolution
The system SHALL resolve Schwab's encrypted account hash on init:
- Call `trader.accounts.getAccounts()` after token setup
- Extract `hashValue` from the first account (or user-specified account)
- Cache the hash for the session lifetime

#### Scenario: Single account auto-resolved
- **WHEN** `init()` succeeds and the user has one Schwab account
- **THEN** the system SHALL cache that account's hash automatically

#### Scenario: Multiple accounts without explicit selection
- **WHEN** the user has multiple Schwab accounts and no preference is configured
- **THEN** the system SHALL use the first account and log a warning listing all available account hashes

### Requirement: Contract search
The system SHALL search for instruments via `marketData.instruments.getInstruments`:
- Map results to `ContractDescription[]`
- Each contract SHALL have `aliceId: 'schwab-{symbol}'`, `secType: 'STK'`, `exchange: 'SMART'`, `currency: 'USD'`
- For option-eligible underlyings, include `derivativeSecTypes: ['OPT']`

#### Scenario: Search by ticker
- **WHEN** `searchContracts('AAPL')` is called
- **THEN** the system SHALL return at least one `ContractDescription` with `contract.symbol` equal to `'AAPL'`

#### Scenario: Empty search result
- **WHEN** `searchContracts('')` is called
- **THEN** the system SHALL return an empty array

### Requirement: Contract details
The system SHALL retrieve instrument details via `marketData.instruments.getInstruments` with `projection: 'fundamental'`:
- Map to `ContractDetails` including `longName`, `stockType`, `validExchanges`

#### Scenario: Equity details returned
- **WHEN** `getContractDetails({ symbol: 'AAPL' })` is called
- **THEN** the system SHALL return `ContractDetails` with `longName` containing `'Apple'`

#### Scenario: Unknown symbol
- **WHEN** `getContractDetails({ symbol: 'XYZNONEXISTENT' })` is called
- **THEN** the system SHALL return `null`

### Requirement: Place order
The system SHALL place orders via `trader.orders.placeOrderForAccount`:
- Map `OrderRequest` to Schwab's order format:
  - `side: 'buy'` → `instruction: 'BUY'`; `side: 'sell'` → `instruction: 'SELL'`
  - `type: 'market'` → `orderType: 'MARKET'`; `type: 'limit'` → `orderType: 'LIMIT'`; etc.
  - `qty` → `quantity`; `price` → `price`; `stopPrice` → `stopPrice`
  - `timeInForce: 'day'` → `duration: 'DAY'`; `'gtc'` → `'GOOD_TILL_CANCEL'`
  - `extendedHours: true` → `session: 'SEAMLESS'` (default `'NORMAL'`)
- Wrap in `orderLegCollection` with `instrument: { symbol, assetType: 'EQUITY' }`
- Extract order ID from response `Location` header

#### Scenario: Market buy order placed
- **WHEN** `placeOrder({ contract: {symbol:'AAPL'}, side:'buy', type:'market', qty:10 })` is called
- **THEN** the system SHALL return `{ success: true, orderId: '<extracted-id>' }`

#### Scenario: Limit order with price
- **WHEN** a limit order is placed with `price: 150.00`
- **THEN** the Schwab payload SHALL include `orderType: 'LIMIT'` and `price: '150.00'`

#### Scenario: Order rejected by Schwab
- **WHEN** the Schwab API returns an error (insufficient funds, market closed)
- **THEN** the system SHALL return `{ success: false, error: '<schwab error message>' }`

### Requirement: Modify order
The system SHALL replace orders via `trader.orders.replaceOrder`:
- Fetch existing order, apply changes, submit replacement
- Schwab does not support partial modification — full order resubmission is required

#### Scenario: Modify limit price
- **WHEN** `modifyOrder(orderId, { price: 155.00 })` is called
- **THEN** the system SHALL submit a replacement order with the updated price

### Requirement: Cancel order
The system SHALL cancel orders via `trader.orders.cancelOrder`:
- Return `true` on successful cancellation, `false` on failure

#### Scenario: Cancel pending order
- **WHEN** `cancelOrder(orderId)` is called for a cancellable order
- **THEN** the system SHALL return `true`

#### Scenario: Cancel already-filled order
- **WHEN** `cancelOrder(orderId)` is called for a filled order
- **THEN** the system SHALL return `false`

### Requirement: Close position
The system SHALL close positions by placing a counter-order:
- Look up current position side and quantity from `getPositions()`
- Place a market order in the opposite direction
- If `qty` is specified, close that amount (partial); if omitted, close full position

#### Scenario: Full close of long position
- **WHEN** `closePosition({ symbol: 'AAPL' })` is called and user holds 100 shares long
- **THEN** the system SHALL place a market SELL order for 100 shares

#### Scenario: Partial close
- **WHEN** `closePosition({ symbol: 'AAPL' }, 50)` is called
- **THEN** the system SHALL place a market SELL order for 50 shares

### Requirement: Account info
The system SHALL retrieve account balances via `trader.accounts.getAccountByNumber` with `fields: 'positions'`:
- Map `currentBalances.cashBalance` → `cash`
- Map `currentBalances.equity` → `equity`
- Map `currentBalances.buyingPower` → `buyingPower`
- Aggregate position unrealized gains → `unrealizedPnL`
- Compute realized PnL from transaction history (cached with 60s TTL)

#### Scenario: Account info retrieved
- **WHEN** `getAccount()` is called
- **THEN** the system SHALL return `AccountInfo` with `cash`, `equity`, `buyingPower`, `unrealizedPnL`, and `realizedPnL`

### Requirement: Positions
The system SHALL retrieve positions from the account endpoint:
- Map each Schwab position to the `Position` interface
- Infer `side` from `longQuantity` (> 0 → `'long'`) vs `shortQuantity` (> 0 → `'short'`)
- Build contract with `makeContract(symbol, 'schwab')`

#### Scenario: Positions returned
- **WHEN** `getPositions()` is called and the account holds AAPL shares
- **THEN** the system SHALL return an array including a `Position` with `contract.symbol` equal to `'AAPL'`

#### Scenario: No positions
- **WHEN** `getPositions()` is called and the account has no holdings
- **THEN** the system SHALL return an empty array

### Requirement: Orders
The system SHALL retrieve recent orders via `trader.orders.getOrdersByAccount`:
- Map Schwab order statuses:
  - `AWAITING_PARENT_ORDER`, `AWAITING_CONDITION`, `PENDING_ACTIVATION`, `QUEUED`, `WORKING` → `'pending'`
  - `FILLED` → `'filled'`
  - `CANCELED`, `EXPIRED`, `REPLACED` → `'cancelled'`
  - `REJECTED` → `'rejected'`
  - `PARTIALLY_FILLED` → `'partially_filled'`

#### Scenario: Orders retrieved with status mapping
- **WHEN** `getOrders()` is called
- **THEN** the system SHALL return `Order[]` with Schwab statuses correctly mapped

### Requirement: Quote
The system SHALL retrieve real-time quotes via `marketData.quotes.getQuotes`:
- Map `lastPrice` → `last`, `bidPrice` → `bid`, `askPrice` → `ask`
- Map `totalVolume` → `volume`, `highPrice` → `high`, `lowPrice` → `low`

#### Scenario: Equity quote returned
- **WHEN** `getQuote({ symbol: 'AAPL' })` is called
- **THEN** the system SHALL return a `Quote` with `last`, `bid`, `ask`, and `volume` populated

### Requirement: Market clock
The system SHALL determine market open/close status via `marketData.marketHours.getMarketHours`:
- Query equity market hours
- Parse session times to determine `isOpen`, `nextOpen`, `nextClose`

#### Scenario: Market open
- **WHEN** `getMarketClock()` is called during US equity trading hours
- **THEN** the system SHALL return `{ isOpen: true, nextClose: <Date> }`

#### Scenario: Market closed
- **WHEN** `getMarketClock()` is called outside trading hours
- **THEN** the system SHALL return `{ isOpen: false, nextOpen: <Date> }`

### Requirement: Capabilities
The system SHALL report:
- `supportedSecTypes: ['STK', 'OPT']`
- `supportedOrderTypes: ['market', 'limit', 'stop', 'stop_limit', 'trailing_stop']`

#### Scenario: Capabilities queried
- **WHEN** `getCapabilities()` is called
- **THEN** the system SHALL return STK and OPT as supported security types

### Requirement: Rate limiting
The system SHALL configure `@sudowealth/schwab-api` middleware with `maxRequests: 120, windowMs: 60_000`:
- On 429 responses, the retry middleware SHALL back off and retry automatically

#### Scenario: Rate limit exceeded
- **WHEN** requests exceed 120 per minute
- **THEN** the middleware SHALL queue and retry after the rate limit window

### Requirement: Error handling
The system SHALL handle Schwab-specific errors:
- `SchwabAuthError` with `TOKEN_EXPIRED` → throw with re-auth URL and instructions
- `SchwabApiError` → map to `OrderResult.error` or throw with descriptive message
- Network errors → retried by middleware with exponential backoff

#### Scenario: Auth error surfaces re-auth instructions
- **WHEN** a `SchwabAuthError` with `TOKEN_EXPIRED` occurs during any API call
- **THEN** the system SHALL throw an error containing the authorization URL
