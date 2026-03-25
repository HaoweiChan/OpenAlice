import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { TruthSocialPostStore } from './post-store.js'


const TEST_DIR = resolve('data/test-truthsocial/posts')
const HANDLE = 'realDonaldTrump'


describe('TruthSocialPostStore', () => {
  let store: TruthSocialPostStore

  beforeEach(async () => {
    try { await unlink(resolve(TEST_DIR, `${HANDLE}.jsonl`)) } catch { /* ignore */ }
    store = new TruthSocialPostStore({ dir: TEST_DIR, maxInMemory: 100 })
    await store.init(HANDLE)
  })

  afterEach(async () => {
    try { await unlink(resolve(TEST_DIR, `${HANDLE}.jsonl`)) } catch { /* ignore */ }
  })

  it('starts empty', () => {
    expect(store.listRecent(10)).toHaveLength(0)
  })

  it('ingests new posts and dedupes by postKey', async () => {
    const base = {
      handle: HANDLE,
      url: 'https://example.com/p/1',
      publishedAt: Date.now() - 10_000,
      fetchedAt: Date.now(),
      text: 'Hello world',
      source: 'test',
    }

    const p1 = { ...base, postKey: 'truthsocial:1' }
    const p2 = { ...base, postKey: 'truthsocial:2', url: 'https://example.com/p/2' }
    const dup = { ...base, postKey: 'truthsocial:1', url: 'https://example.com/p/1?dup=1' }

    const new1 = await store.ingestBatch(HANDLE, [p1, p2])
    expect(new1).toHaveLength(2)
    expect(store.has('truthsocial:1')).toBe(true)
    expect(store.has('truthsocial:2')).toBe(true)

    const new2 = await store.ingestBatch(HANDLE, [dup])
    expect(new2).toHaveLength(0)
    expect(store.listRecent(10)).toHaveLength(2)
  })

  it('recovers from JSONL on init', async () => {
    const now = Date.now()
    await store.ingestBatch(HANDLE, [
      {
        postKey: 'truthsocial:1',
        handle: HANDLE,
        url: 'https://example.com/p/1',
        publishedAt: now - 20_000,
        fetchedAt: now,
        text: 'A',
        source: 'test',
      },
      {
        postKey: 'truthsocial:2',
        handle: HANDLE,
        url: 'https://example.com/p/2',
        publishedAt: now - 10_000,
        fetchedAt: now,
        text: 'B',
        source: 'test',
      },
    ])

    const store2 = new TruthSocialPostStore({ dir: TEST_DIR, maxInMemory: 100 })
    await store2.init(HANDLE)
    expect(store2.listRecent(10)).toHaveLength(2)
    expect(store2.has('truthsocial:1')).toBe(true)
    expect(store2.has('truthsocial:2')).toBe(true)
  })
})
