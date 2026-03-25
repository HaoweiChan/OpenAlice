## ADDED Requirements

### Requirement: Strategy CRUD tools
The system SHALL register AI-callable tools: `strategyCreate`, `strategyList`, `strategyEnable`, `strategyDisable`, `strategyDelete`, `strategyUpdate`.

#### Scenario: Create strategy via chat
- **WHEN** the user says "create a strategy for MXF that buys when RSI_14 < 30 and sells when RSI_14 > 70"
- **THEN** the AI SHALL use `strategyCreate` to write a strategy file with the appropriate DSL expressions and parameters

#### Scenario: List strategies via chat
- **WHEN** the user says "show my live strategies"
- **THEN** the AI SHALL use `strategyList` to return all strategies with their enabled status, symbol, timeframe, and current PnL

### Requirement: Strategy status and monitoring tools
The `strategyStatus` tool SHALL return the strategy's current state: enabled/disabled, last signal time, current position, rolling window size, warmup status, recent signals, rolling performance metrics (Sharpe, win rate, PnL), and indicator values from the current rolling window.

#### Scenario: Check strategy health
- **WHEN** the user asks "how is my MXF strategy doing?"
- **THEN** the tool SHALL return the strategy's position, PnL, last signal, current indicator values (RSI, EMA, etc.), and rolling performance metrics

### Requirement: Strategy lifecycle tools
The system SHALL register tools for the full strategy lifecycle: `strategyDesign` (propose + backtest + sweep + validate), `strategyDeploy` (validated strategy → live), `strategyReEvaluate` (re-test on recent data), and `strategyPerformance` (generate performance report).

#### Scenario: Design and deploy workflow
- **WHEN** the user says "design and deploy a momentum strategy for TXF"
- **THEN** the AI SHALL use `strategyDesign` to propose DSL, backtest, sweep, and validate, then use `strategyDeploy` if validation passes

#### Scenario: Performance review
- **WHEN** the user says "review my MXF strategy performance this month"
- **THEN** the AI SHALL use `strategyPerformance` to generate a report comparing live metrics against deployment expectations

### Requirement: Strategy improvement tools
The `strategyImprove` tool SHALL re-run parameter sweep on recent data for an underperforming strategy and present top parameter combinations. It SHALL NOT auto-modify the strategy without user approval.

#### Scenario: Improve underperforming strategy
- **WHEN** the user says "my MXF strategy isn't working well, can you improve it?"
- **THEN** the AI SHALL use `strategyImprove` to sweep parameters on recent data, present top 3 alternatives with metrics, and ask for confirmation before updating
