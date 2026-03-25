## 1. Config and Schema

- [x] 1.1 Add `schwabPlatformSchema` to `src/core/config.ts` and register it in `platformConfigSchema` discriminated union
- [x] 1.2 Add `type: 'schwab'` case to `createPlatformFromConfig` in `platform-factory.ts`

## 2. Type Definitions

- [x] 2.1 Create `src/extension/trading/providers/schwab/schwab-types.ts` with Schwab API response interfaces (account, position, order, quote shapes)
- [x] 2.2 Create `src/extension/trading/providers/schwab/schwab-contracts.ts` with `makeContract`, `resolveSymbol`, `parseAliceId`, and `mapSchwabOrderStatus` helpers

## 3. OAuth and Auth

- [x] 3.1 Create `src/extension/trading/providers/schwab/schwab-auth.ts` with token persistence (`loadTokens`, `saveTokens`), `createSchwabAuthClient`, and `completeAuth` helper
- [x] 3.2 Implement token auto-save callback wired into `@sudowealth/schwab-api` auth `save` persistence hook

## 4. Platform and Account

- [x] 4.1 Create `src/extension/trading/providers/schwab/SchwabPlatform.ts` implementing `IPlatform` with `providerType: 'schwab'`
- [x] 4.2 Create `src/extension/trading/providers/schwab/SchwabAccount.ts` implementing `ITradingAccount` — scaffold all method signatures with TODO stubs
- [x] 4.3 Create `src/extension/trading/providers/schwab/index.ts` barrel export

## 5. Account Lifecycle

- [x] 5.1 Implement `SchwabAccount.init()` — load tokens, create API client, resolve account hash, verify connectivity
- [x] 5.2 Implement `SchwabAccount.close()` — cleanup (no-op for HTTP client)
- [x] 5.3 Implement account hash resolution logic (single account auto-select, multi-account warning)

## 6. Contract Operations

- [x] 6.1 Implement `searchContracts(pattern)` via `marketData.instruments.getInstruments`
- [x] 6.2 Implement `getContractDetails(query)` via `marketData.instruments.getInstruments` with `projection: 'fundamental'`

## 7. Trading Operations

- [x] 7.1 Implement `placeOrder(order)` — map `OrderRequest` to Schwab `orderLegCollection` format, extract order ID from `Location` header
- [x] 7.2 Implement `modifyOrder(orderId, changes)` — fetch existing order, apply changes, call `replaceOrder`
- [x] 7.3 Implement `cancelOrder(orderId)` via `trader.orders.cancelOrder`
- [x] 7.4 Implement `closePosition(contract, qty?)` — lookup position, place counter market order

## 8. Query Operations

- [x] 8.1 Implement `getAccount()` — map Schwab `currentBalances` to `AccountInfo`, aggregate unrealized PnL from positions
- [x] 8.2 Implement `getPositions()` — map Schwab positions to `Position[]` with side inference from `longQuantity`/`shortQuantity`
- [x] 8.3 Implement `getOrders()` — map Schwab orders to `Order[]` with status translation
- [x] 8.4 Implement `getQuote(contract)` — map Schwab quote fields to `Quote` interface
- [x] 8.5 Implement `getMarketClock()` — parse equity market hours to `MarketClock`
- [x] 8.6 Implement `getCapabilities()` — return STK/OPT sec types and supported order types

## 9. Middleware and Error Handling

- [x] 9.1 Configure `@sudowealth/schwab-api` middleware with rate limiting (`maxRequests: 120, windowMs: 60_000`) and retry policy
- [x] 9.2 Implement Schwab-specific error mapping — `SchwabAuthError` → re-auth instructions, `SchwabApiError` → `OrderResult.error`

## 10. Integration and Dependencies

- [x] 10.1 Add `@sudowealth/schwab-api` to `package.json` dependencies
- [x] 10.2 Update `ui/src/components/SDKSelector.tsx` to list Schwab as an available broker option
- [x] 10.3 Verify end-to-end: add Schwab platform to `platforms.json`, create account in `accounts.json`, confirm `init()` produces auth URL
