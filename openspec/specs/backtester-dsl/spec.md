## Purpose

Simple expression DSL for evaluating trading strategy entry/exit conditions against indicator-enriched candle data, using a safe recursive-descent parser with no eval().

## Requirements

### Requirement: Expression parsing
The DSL SHALL parse string expressions into an AST using recursive descent. Supported tokens:
- **Identifiers**: `close`, `open`, `high`, `low`, `volume`, `RSI_14`, `EMA_20`, `SMA_50`, `BBANDS_upper`, `BBANDS_lower`, `BBANDS_middle`, `MACD_value`, `MACD_signal`, `MACD_histogram`, `ATR_14`, `position_open`, `stop_loss_hit`, `take_profit_hit`
- **Number literals**: integers and decimals (e.g., `30`, `0.05`, `100.50`)
- **Comparison operators**: `<`, `>`, `<=`, `>=`, `==`, `!=`
- **Logical operators**: `&&`, `||`, `!`
- **Parentheses**: `(`, `)` for grouping
- **Arithmetic operators**: `+`, `-`, `*`, `/` for computed conditions

#### Scenario: Simple comparison parsed
- **WHEN** expression `RSI_14 < 30` is parsed
- **THEN** the parser SHALL produce an AST representing a less-than comparison of identifier `RSI_14` and literal `30`

#### Scenario: Compound expression parsed
- **WHEN** expression `RSI_14 < 30 && close > EMA_20` is parsed
- **THEN** the parser SHALL produce an AST with logical AND of two comparisons

#### Scenario: Parenthesized expression
- **WHEN** expression `(RSI_14 < 30 || RSI_14 > 70) && close > SMA_50` is parsed
- **THEN** parentheses SHALL override default operator precedence

#### Scenario: Invalid expression rejected
- **WHEN** expression `RSI_14 <<< 30` is parsed
- **THEN** the parser SHALL throw an error with a descriptive message

### Requirement: Expression evaluation
The DSL SHALL evaluate a parsed expression against a context object containing current candle values and indicator values. The result SHALL be a boolean.

#### Scenario: True condition
- **WHEN** expression `RSI_14 < 30` is evaluated with context `{ RSI_14: 25 }`
- **THEN** the result SHALL be `true`

#### Scenario: False condition
- **WHEN** expression `RSI_14 < 30` is evaluated with context `{ RSI_14: 55 }`
- **THEN** the result SHALL be `false`

#### Scenario: Missing variable returns false
- **WHEN** expression references `EMA_200` but context does not contain it (NaN or undefined)
- **THEN** the evaluation SHALL return `false` (skip this candle rather than error)

### Requirement: Indicator variable naming convention
Indicator variables SHALL follow the pattern `{INDICATOR}_{PERIOD}` or `{INDICATOR}_{COMPONENT}`:
- `RSI_14` → RSI with period 14
- `EMA_20`, `EMA_50` → EMA with periods 20, 50
- `SMA_50`, `SMA_200` → SMA with periods
- `BBANDS_upper`, `BBANDS_lower`, `BBANDS_middle` → Bollinger Bands components (default period 20)
- `MACD_value`, `MACD_signal`, `MACD_histogram` → MACD components (default 12/26/9)
- `ATR_14` → ATR with period 14

The engine SHALL parse these variable names to determine which indicators to compute and with which parameters.

#### Scenario: Custom period extracted from variable name
- **WHEN** entry_logic contains `RSI_21`
- **THEN** the engine SHALL compute RSI with period 21

#### Scenario: Default BBANDS period
- **WHEN** entry_logic contains `BBANDS_upper`
- **THEN** the engine SHALL compute Bollinger Bands with default period 20 and multiplier 2

### Requirement: Special boolean variables
The DSL SHALL support special boolean variables:
- `position_open`: `true` when a position is currently held
- `stop_loss_hit`: `true` when unrealized loss exceeds `parameters.stop_loss_pct`
- `take_profit_hit`: `true` when unrealized profit exceeds `parameters.take_profit_pct`

#### Scenario: Stop loss triggers exit
- **WHEN** `exit_logic = "stop_loss_hit || RSI_14 > 70"` and unrealized loss exceeds `stop_loss_pct`
- **THEN** `stop_loss_hit` SHALL be `true` and exit_logic SHALL evaluate to `true`
