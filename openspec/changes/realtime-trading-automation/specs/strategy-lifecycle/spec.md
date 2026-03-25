## ADDED Requirements

### Requirement: Strategy design workflow
The system SHALL provide a `strategyDesign` tool that guides the AI through a complete strategy creation workflow: propose entry/exit logic → backtest → parameter sweep → walk-forward validation → report results. The AI SHALL use existing backtester tools in sequence.

#### Scenario: AI designs a mean-reversion strategy
- **WHEN** the user says "design a mean-reversion strategy for MXF using RSI"
- **THEN** the AI SHALL propose entry/exit DSL expressions, run a backtest on recent Sinopac data, sweep key parameters, run walk-forward validation, and present the results with metrics

### Requirement: Strategy deployment gate
The `strategyDeploy` tool SHALL deploy a validated strategy to live trading. It MUST require a walk-forward validation score >= the configured threshold (default 0.5). The deployed strategy file SHALL include deployment metadata: source backtest ID, walk-forward score, deployment timestamp.

#### Scenario: Deploy validated strategy
- **WHEN** the AI calls `strategyDeploy` with a strategy that has walk-forward score 0.72
- **THEN** it SHALL create the live strategy file in `data/strategies/` with the optimal parameters and deployment metadata

#### Scenario: Reject underfit strategy
- **WHEN** the AI calls `strategyDeploy` with a strategy that has walk-forward score 0.35
- **THEN** it SHALL reject deployment with error "Walk-forward score 0.35 below threshold 0.5 — strategy likely overfit"

### Requirement: Strategy re-evaluation
The system SHALL support re-evaluating a live strategy against recent market data. The `strategyReEvaluate` tool SHALL run a backtest on the most recent N days of data using the strategy's current parameters and compare metrics against the original deployment backtest.

#### Scenario: Re-evaluate after 30 days
- **WHEN** the AI calls `strategyReEvaluate` for strategy "mxf-rsi" with lookback 30 days
- **THEN** it SHALL fetch recent Sinopac kbars, run a backtest, and report: current Sharpe vs deployment Sharpe, current win rate vs deployment win rate, and a recommendation (continue / adjust / pause)

### Requirement: Strategy improvement suggestions
When re-evaluation shows degraded performance (current Sharpe < 50% of deployment Sharpe), the system SHALL suggest running a new parameter sweep on recent data and present the top 3 parameter combinations with their metrics.

#### Scenario: Strategy underperforming
- **WHEN** strategy "mxf-rsi" has live Sharpe of 0.3 vs deployment Sharpe of 1.2
- **THEN** the AI SHALL run a parameter sweep on recent 60-day data, present top 3 parameter sets, and ask the user whether to update the strategy
