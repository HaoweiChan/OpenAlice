import type { TruthSocialClient } from './client.js'
import type { TruthSocialPostStore } from './post-store.js'
import type { TruthSocialPost } from './types.js'


export async function syncPosts(opts: {
  client: TruthSocialClient
  postStore: TruthSocialPostStore
  handle: string
  fetchLimit?: number
}): Promise<{
  fetched: TruthSocialPost[]
  newPosts: TruthSocialPost[]
}> {
  let fetched: TruthSocialPost[]
  try {
    fetched = await opts.client.fetchRecentPosts(opts.handle, { limit: opts.fetchLimit })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`truthsocial sync fetch failed (handle=${opts.handle}): ${msg}`)
  }

  try {
    const newPosts = await opts.postStore.ingestBatch(opts.handle, fetched)
    return { fetched, newPosts }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`truthsocial sync persist failed (handle=${opts.handle}): ${msg}`)
  }
}
