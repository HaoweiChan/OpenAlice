## ADDED Requirements

### Requirement: Sync recent Truth Social posts for a handle
The system SHALL fetch recent posts for a configured Truth Social account handle and return newly discovered posts since the last successful sync.

#### Scenario: New posts are discovered
- **WHEN** a sync runs for handle `realDonaldTrump` and the remote source contains posts not yet seen locally
- **THEN** the system returns those posts as “new” and persists them to the local post store

#### Scenario: No new posts are discovered
- **WHEN** a sync runs and all remote posts are already present in the local post store
- **THEN** the system returns an empty “new posts” list and does not duplicate stored entries

### Requirement: Persist posts with provenance and stable keys
The system SHALL store each fetched post with a stable `postKey`, source URL, author handle, published timestamp, and raw text content.

#### Scenario: Post is persisted with required metadata
- **WHEN** the system ingests a post from the remote source
- **THEN** the stored record includes `postKey`, `handle`, `url`, `publishedAt`, `fetchedAt`, and `text`

### Requirement: Dedupe posts across repeated sync runs
The system MUST deduplicate posts so that repeated sync runs are idempotent.

#### Scenario: Duplicate remote post is not re-stored
- **WHEN** the same remote post appears across multiple sync runs
- **THEN** the system does not create a second stored record with the same `postKey`

### Requirement: Fail safely on fetch/parse errors
The system SHALL surface a structured error when it cannot fetch or parse posts, without corrupting the local store.

#### Scenario: Remote fetch fails
- **WHEN** the remote request fails due to network or HTTP error
- **THEN** the system returns an error describing the failure and does not write partial/corrupt post entries

#### Scenario: Remote content format changes
- **WHEN** the fetch succeeds but the response cannot be parsed into posts
- **THEN** the system returns an error describing the parse failure and preserves the prior sync state

