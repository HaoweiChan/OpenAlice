## ADDED Requirements

### Requirement: Classify a Truth Social post into a structured signal
The system SHALL convert a Truth Social post’s text into a structured market sentiment signal with direction, confidence, and rationale.

#### Scenario: Bullish classification
- **WHEN** the system classifies a post that expresses market-positive intent or policy likely to benefit risk assets
- **THEN** the system returns `direction: bullish` with `confidence` in \(0..1\) and a short `rationale`

#### Scenario: Bearish classification
- **WHEN** the system classifies a post that expresses market-negative intent or policy likely to harm risk assets
- **THEN** the system returns `direction: bearish` with `confidence` in \(0..1\) and a short `rationale`

#### Scenario: Neutral classification
- **WHEN** the post content is ambiguous, purely personal, or not market-relevant
- **THEN** the system returns `direction: neutral` and a low-to-moderate confidence with rationale

### Requirement: Enforce output schema and validation
The system MUST validate classification output against a schema and reject/repair invalid outputs.

#### Scenario: Invalid model output is handled
- **WHEN** the classification backend returns malformed JSON or missing required fields
- **THEN** the system retries or returns a structured error without producing an invalid signal record

### Requirement: Cache and persist derived signals per postKey
The system SHALL persist derived signals keyed by `postKey` and avoid re-classifying the same post unless explicitly requested.

#### Scenario: Signal is persisted and reused
- **WHEN** a post has already been classified and the system is asked to classify it again
- **THEN** the system returns the persisted signal instead of invoking classification again by default

### Requirement: Provide batch classification for recent posts
The system SHALL support classifying a batch of recently synced posts and producing a digest of new signals.

#### Scenario: Sync and classify recent posts
- **WHEN** the system runs “sync+classify” for a handle
- **THEN** it returns newly ingested posts and their newly produced signals, plus a compact digest suitable for notifications

