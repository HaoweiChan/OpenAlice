## 1. Setup

- [ ] 1.1 Add a new domain folder `src/domain/truthsocial/` with initial types for Post + Signal (postKey, url, publishedAt, text)
- [ ] 1.2 Add config wiring for Truth Social handle(s) and storage paths (file-driven), with sane defaults

## 2. Post sync (truthsocial-post-sync)

- [ ] 2.1 Implement `TruthSocialClient` interface + initial public fetcher (best-effort parse, isolated parsing module)
- [ ] 2.2 Implement post store using append-only JSONL and idempotent dedupe by `postKey`
- [ ] 2.3 Implement `syncPosts(handle)` returning `{ newPosts, totalFetched }` and persisting fetched metadata
- [ ] 2.4 Add structured error handling + logging for fetch and parse failures (no partial writes)

## 3. Signal classification (truthsocial-bull-bear-signal)

- [ ] 3.1 Define `TruthSocialSignal` schema (direction, confidence, rationale, optional tickers/themes) and runtime validation
- [ ] 3.2 Implement `classifyPost(post)` using AgentCenter/provider with strict JSON output and injection-hardening prompt
- [ ] 3.3 Implement signal store keyed by `postKey`, with cache-first behavior and an override to force re-classification
- [ ] 3.4 Implement `syncAndClassifyRecent(handle, opts)` that returns a digest of newly produced signals

## 4. Tooling + cron integration

- [ ] 4.1 Add tool(s) to query recent posts and signals (e.g. `truthsocial_recent_posts`, `truthsocial_recent_signals`)
- [ ] 4.2 Add tool to run `sync+classify` (optionally limited to N newest posts) and return a compact digest
- [ ] 4.3 Add cron recipe/example for scheduled sync+classify, delivering to a specified connector channel

## 5. Tests and docs

- [ ] 5.1 Add unit tests for dedupe logic and JSONL persistence (post store + signal store)
- [ ] 5.2 Add tests for schema validation (reject malformed model outputs)
- [ ] 5.3 Document configuration and usage (how to run manually, how to schedule via cron, where files are stored)
