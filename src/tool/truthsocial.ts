import { tool } from 'ai'
import { z } from 'zod'
import type { AgentCenter } from '@/core/agent-center.js'
import type { TruthSocialClient } from '@/domain/truthsocial/client.js'
import type { TruthSocialPostStore } from '@/domain/truthsocial/post-store.js'
import type { TruthSocialSignalStore } from '@/domain/truthsocial/signal.js'
import { syncAndClassifyRecent } from '@/domain/truthsocial/signal.js'
import { syncPosts } from '@/domain/truthsocial/sync.js'


export function createTruthSocialTools(opts: {
  agentCenter: AgentCenter
  getDisabledTools: () => string[]
  client: TruthSocialClient
  postStore: TruthSocialPostStore
  signalStore: TruthSocialSignalStore
  defaultHandle: string
}) {
  const { agentCenter, getDisabledTools, client, postStore, signalStore, defaultHandle } = opts

  return {
    truthsocialSync: tool({
      description: 'Fetch and persist recent Truth Social posts for a handle (default: realDonaldTrump). Returns newly ingested posts.',
      inputSchema: z.object({
        handle: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async ({ handle, limit }) => {
        try {
          const h = handle ?? defaultHandle
          const { fetched, newPosts } = await syncPosts({ client, postStore, handle: h, fetchLimit: limit })
          return {
            success: true,
            handle: h,
            fetched: fetched.length,
            newPosts: newPosts.length,
            latest: newPosts.slice(-5).map((p) => ({
              postKey: p.postKey,
              publishedAt: p.publishedAt,
              url: p.url,
              text: p.text.slice(0, 240),
            })),
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return { success: false, error: msg }
        }
      },
    }),

    truthsocialRecentPosts: tool({
      description: 'List recently stored Truth Social posts.',
      inputSchema: z.object({
        limit: z.number().int().min(1).max(200).default(20),
      }),
      execute: async ({ limit }) => {
        const posts = postStore.listRecent(limit)
        return {
          count: posts.length,
          posts: posts.map((p) => ({
            postKey: p.postKey,
            handle: p.handle,
            publishedAt: p.publishedAt,
            url: p.url,
            text: p.text,
          })),
        }
      },
    }),

    truthsocialRecentSignals: tool({
      description: 'List recently stored Truth Social bullish/bearish/neutral signals.',
      inputSchema: z.object({
        limit: z.number().int().min(1).max(200).default(20),
      }),
      execute: async ({ limit }) => {
        const signals = signalStore.listRecent(limit)
        return {
          count: signals.length,
          signals: signals.map((s) => ({
            postKey: s.postKey,
            handle: s.handle,
            publishedAt: s.publishedAt,
            url: s.url,
            direction: s.direction,
            confidence: s.confidence,
            rationale: s.rationale,
            tickers: s.tickers,
            themes: s.themes,
          })),
        }
      },
    }),

    truthsocialSyncAndClassify: tool({
      description: 'Sync recent Truth Social posts and classify them into bullish/bearish/neutral signals. Returns a digest suitable for notifications.',
      inputSchema: z.object({
        handle: z.string().optional(),
        fetchLimit: z.number().int().min(1).max(100).default(25),
        maxToClassify: z.number().int().min(1).max(10).default(5),
        forceReclassify: z.boolean().default(false),
      }),
      execute: async ({ handle, fetchLimit, maxToClassify, forceReclassify }) => {
        try {
          const h = handle ?? defaultHandle
          const { fetched, newPosts } = await syncPosts({ client, postStore, handle: h, fetchLimit })

          const { newlyClassified, digest } = await syncAndClassifyRecent({
            agentCenter,
            disabledTools: getDisabledTools(),
            posts: newPosts.length > 0 ? newPosts : postStore.listRecent(fetchLimit),
            signalStore,
            maxToClassify,
            forceReclassify,
          })

          return {
            success: true,
            handle: h,
            fetched: fetched.length,
            newPosts: newPosts.length,
            newlyClassified: newlyClassified.length,
            digest,
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return { success: false, error: msg }
        }
      },
    }),
  }
}
