import { createHash } from 'node:crypto'
import { z } from 'zod'


export const truthSocialDirectionSchema = z.enum(['bullish', 'bearish', 'neutral'])

export const truthSocialPostSchema = z.object({
  postKey: z.string().min(1),
  handle: z.string().min(1),
  url: z.string().url(),
  publishedAt: z.number().int().positive(),
  fetchedAt: z.number().int().positive(),
  text: z.string(),
  rawHtml: z.string().optional(),
  source: z.string().min(1),
})

export type TruthSocialPost = z.infer<typeof truthSocialPostSchema>

export const truthSocialSignalSchema = z.object({
  postKey: z.string().min(1),
  handle: z.string().min(1),
  url: z.string().url(),
  publishedAt: z.number().int().positive(),
  direction: truthSocialDirectionSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1).max(280),
  tickers: z.array(z.string()).optional(),
  themes: z.array(z.string()).optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
  classifiedAt: z.number().int().positive(),
})

export type TruthSocialSignal = z.infer<typeof truthSocialSignalSchema>

export function stablePostKey(input: { url: string; platformId?: string; text?: string }): string {
  if (input.platformId && input.platformId.trim()) {
    return `truthsocial:${input.platformId.trim()}`
  }

  const url = input.url.trim()
  if (url) return `truthsocial:${url}`

  const text = (input.text ?? '').trim()
  const h = createHash('sha256').update(text).digest('hex').slice(0, 16)
  return `truthsocial:hash:${h}`
}

export function stripHtml(html: string): string {
  const noScript = html.replace(/<script[\s\S]*?<\/script>/gi, '')
  const noStyle = noScript.replace(/<style[\s\S]*?<\/style>/gi, '')
  const noTags = noStyle.replace(/<[^>]+>/g, ' ')
  const decoded = decodeHtmlEntities(noTags)
  return decoded.replace(/\s+/g, ' ').trim()
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}
