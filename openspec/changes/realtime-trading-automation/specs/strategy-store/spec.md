## ADDED Requirements

### Requirement: Strategy file persistence
The system SHALL store each live trading strategy as a JSON file at `data/strategies/{id}.json`. A strategy MUST contain: id, symbol, securityType, timeframe, broker (account id), direction (long/short/both), entry/exit DSL expressions, parameters (including position_size), maxPosition, and an enabled flag.

#### Scenario: Strategy file is created
- **WHEN** a new strategy is created with id "mxf-rsi"
- **THEN** the file `data/strategies/mxf-rsi.json` SHALL be written with all required fields

#### Scenario: Strategy file is valid
- **WHEN** the strategy store loads a strategy file
- **THEN** it SHALL validate all required fields are present and DSL expressions parse without error

### Requirement: Strategy CRUD operations
The strategy store SHALL support create, read, update, delete, enable, and disable operations. Updates SHALL write the file atomically. Delete SHALL remove the file.

#### Scenario: Enable a disabled strategy
- **WHEN** the user enables strategy "mxf-rsi"
- **THEN** the strategy file SHALL be updated with `enabled: true` and the market watcher SHALL begin monitoring it

#### Scenario: Delete a strategy
- **WHEN** the user deletes strategy "mxf-rsi"
- **THEN** the file SHALL be removed, any active monitoring for it SHALL stop, and open positions SHALL NOT be automatically closed

### Requirement: Strategy hot reload
The strategy store SHALL watch the `data/strategies/` directory for file changes. When a strategy file is modified externally, the store SHALL reload it and notify the market watcher.

#### Scenario: Strategy file edited on disk
- **WHEN** the user edits `data/strategies/mxf-rsi.json` directly
- **THEN** the strategy store SHALL detect the change, reload the strategy, and the market watcher SHALL apply the updated parameters on the next bar
