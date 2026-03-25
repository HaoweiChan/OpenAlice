import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { TruthSocialSignalStore } from './signal.js'
import { truthSocialSignalSchema } from './types.js'


const TEST_DIR = resolve('data/test-truthsocial/signals')
const HANDLE = 'realDonaldTrump'


describe('TruthSocialSignalStore', () => {
  let store: TruthSocialSignalStore

  beforeEach(async () => {
    try { await unlink(resolve(TEST_DIR, `${HANDLE}.jsonl`)) } catch { /* ignore */ }
    store = new TruthSocialSignalStore({ dir: TEST_DIR, maxInMemory: 100 })
    await store.init(HANDLE)
  })

  afterEach(async () => {
    try { await unlink(resolve(TEST_DIR, `${HANDLE}.jsonl`)) } catch { /* ignore */ }
  })

  it('persists and recovers signals keyed by postKey', async () => {
    const now = Date.now()
    await store.persist(HANDLE, {
      postKey: 'truthsocial:1',
      handle: HANDLE,
      url: 'https://example.com/p/1',
      publishedAt: now - 10_000,
      direction: 'bullish',
      confidence: 0.72,
      rationale: 'Test',
      classifiedAt: now,
    })

    expect(store.has('truthsocial:1')).toBe(true)
    expect(store.listRecent(10)).toHaveLength(1)

    const store2 = new TruthSocialSignalStore({ dir: TEST_DIR, maxInMemory: 100 })
    await store2.init(HANDLE)
    expect(store2.has('truthsocial:1')).toBe(true)
    expect(store2.listRecent(10)).toHaveLength(1)
  })
})

describe('TruthSocialSignal schema', () => {
  it('rejects out-of-range confidence', () => {
    const parsed = truthSocialSignalSchema.safeParse({
      postKey: 'truthsocial:1',
      handle: HANDLE,
      url: 'https://example.com/p/1',
      publishedAt: Date.now(),
      direction: 'bullish',
      confidence: 10,
      rationale: 'Bad',
      classifiedAt: Date.now(),
    })
    expect(parsed.success).toBe(false)
  })
})
