## Why

We want OpenAlice to react faster to high-impact, market-moving social posts. Donald Trump’s Truth Social posts are a distinct input stream that can shift sentiment and price action, and we need a repeatable way to ingest them and turn them into a tradable “bullish vs bearish” signal.

## What Changes

- Add a Truth Social ingestion pipeline that can periodically fetch new posts from a specific account, deduplicate them, and store them in the existing file-driven state model.
- Add a classification layer that converts each post’s content into a structured market sentiment signal (bullish/bearish/neutral + confidence + rationale).
- Expose the data + signal through an in-process tool so the agent can query recent posts and/or request classification on demand.
- Optionally run on a cron schedule to keep the signal up to date and deliver the result to a chosen connector channel (web/telegram).

## Capabilities

### New Capabilities

- `truthsocial-post-sync`: Fetch and persist new Truth Social posts for a configured account (starting with Donald Trump) with dedupe and provenance metadata.
- `truthsocial-bull-bear-signal`: Convert a Truth Social post (or a batch of recent posts) into a structured bullish/bearish/neutral signal for markets, suitable for downstream automation and notifications.

### Modified Capabilities

<!-- none -->

## Impact

- **New domain module** under `src/domain/` for Truth Social ingestion + storage.
- **New tool(s)** under `src/tool/` to query recent Truth Social posts and request signal classification.
- **Config additions** (e.g. account handle, polling cadence, optional auth tokens if needed).
- **Cron integration** to run the sync/classification periodically and deliver results through the connector system.
