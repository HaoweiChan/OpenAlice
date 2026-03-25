## Purpose

Bridges `market.signal` events to actual order placement. Listens on the EventLog, resolves accounts, enforces position limits, routes orders through the UnifiedTradingAccount guard pipeline, and logs/notifies on fills and rejections.

## Requirements

### Requirement: Signal to order execution
The signal executor SHALL listen for `market.signal` events on the EventLog. For each signal, it SHALL resolve the target account via AccountManager, validate the signal against strategy limits, and place or close orders through the UnifiedTradingAccount.

#### Scenario: Entry-long signal fires
- **WHEN** a `market.signal` event with action "entry" and direction "long" is received for strategy "mxf-rsi"
- **THEN** the executor SHALL place a market buy order for `position_size` lots of MXF on the strategy's broker account

#### Scenario: Exit signal fires
- **WHEN** a `market.signal` event with action "exit" and direction "long" is received
- **THEN** the executor SHALL close the existing long position on the target account

### Requirement: Position limits
The signal executor SHALL enforce the strategy's `maxPosition` limit. It SHALL NOT place an entry order if the current position size for that strategy's symbol already equals or exceeds `maxPosition`.

#### Scenario: Max position reached
- **WHEN** strategy "mxf-rsi" has maxPosition=5 and the account already holds 5 long contracts of MXF
- **THEN** the executor SHALL skip the entry signal and log "max position reached"

### Requirement: Guard pipeline integration
The signal executor SHALL pass all orders through the existing UnifiedTradingAccount guard pipeline before execution. Guards (e.g., max-leverage) MUST be respected.

#### Scenario: Guard rejects order
- **WHEN** a guard rejects the order
- **THEN** the executor SHALL log the rejection reason, notify via connector center, and NOT place the order

### Requirement: Execution logging and notification
The signal executor SHALL log every signal received, order placed, fill received, and rejection to the event log. It SHALL notify the user via the connector center on order fills and rejections.

#### Scenario: Order fills
- **WHEN** a market buy order for MXF fills at 20150
- **THEN** the executor SHALL log the fill to the event log and send a notification: "Strategy mxf-rsi: Bought 1 MXF @ 20150"
