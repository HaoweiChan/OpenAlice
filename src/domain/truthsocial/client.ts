import { parseRss } from './rss.js'
import { stablePostKey, stripHtml, type TruthSocialPost } from './types.js'


export interface FetchRecentPostsOptions {
  limit?: number
}

export interface TruthSocialClient {
  fetchRecentPosts(handle: string, opts?: FetchRecentPostsOptions): Promise<TruthSocialPost[]>
}


export class TrumpstruthRssClient implements TruthSocialClient {
  constructor(
    private feedUrl: string = 'https://trumpstruth.org/feed',
    private allowedHandle: string = 'realDonaldTrump',
  ) {}

  async fetchRecentPosts(handle: string, opts?: FetchRecentPostsOptions): Promise<TruthSocialPost[]> {
    if (handle !== this.allowedHandle) {
      throw new Error(`TrumpstruthRssClient only supports handle "${this.allowedHandle}" (requested "${handle}")`)
    }

    const resp = await fetch(this.feedUrl, {
      headers: {
        'accept': 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1',
        'user-agent': 'OpenAlice/TruthSocialSync (+https://github.com/HaoweiChan/OpenAlice)',
      },
    })
    if (!resp.ok) {
      throw new Error(`Truth Social feed fetch failed: ${resp.status} ${resp.statusText}`)
    }

    const xml = await resp.text()
    const rssItems = parseRss(xml)
    const fetchedAt = Date.now()
    const posts: TruthSocialPost[] = []

    for (const item of rssItems) {
      const url = (item.link ?? '').trim()
      if (!url) continue

      const publishedAt = Date.parse(item.pubDate ?? '')
      if (!Number.isFinite(publishedAt)) continue

      const rawHtml = item.description?.trim() || undefined
      const text = rawHtml ? stripHtml(rawHtml) : (item.title ?? '').trim()
      if (!text) continue

      const platformId = item.guid?.trim() || undefined
      const postKey = stablePostKey({ url, platformId, text })
      posts.push({
        postKey,
        handle,
        url,
        publishedAt,
        fetchedAt,
        text,
        rawHtml,
        source: 'trumpstruth.org/rss',
      })
    }

    posts.sort((a, b) => a.publishedAt - b.publishedAt)
    const limit = opts?.limit
    if (limit && posts.length > limit) return posts.slice(-limit)
    return posts
  }
}
