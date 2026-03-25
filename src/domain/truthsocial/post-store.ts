import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { truthSocialPostSchema, type TruthSocialPost } from './types.js'


const DEFAULT_DIR = 'data/truthsocial/posts'
const DEFAULT_MAX_IN_MEMORY = 1000


export interface TruthSocialPostStoreOpts {
  dir?: string
  maxInMemory?: number
}


export class TruthSocialPostStore {
  private dir: string
  private maxInMemory: number
  private dedup: Set<string> = new Set()
  private buffer: TruthSocialPost[] = []

  constructor(opts?: TruthSocialPostStoreOpts) {
    this.dir = opts?.dir ?? DEFAULT_DIR
    this.maxInMemory = opts?.maxInMemory ?? DEFAULT_MAX_IN_MEMORY
  }

  async init(handle: string): Promise<void> {
    const path = this.logPath(handle)
    await mkdir(dirname(path), { recursive: true })

    let raw: string
    try {
      raw = await readFile(path, 'utf-8')
    } catch (err: unknown) {
      if (isENOENT(err)) return
      throw err
    }

    if (!raw.trim()) return
    const lines = raw.split('\n')
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const parsed = truthSocialPostSchema.parse(JSON.parse(line))
        this.dedup.add(parsed.postKey)
        this.buffer.push(parsed)
      } catch {
        // skip
      }
    }

    this.buffer.sort((a, b) => a.publishedAt - b.publishedAt)
    if (this.buffer.length > this.maxInMemory) {
      this.buffer = this.buffer.slice(-this.maxInMemory)
    }
  }

  has(postKey: string): boolean {
    return this.dedup.has(postKey)
  }

  listRecent(limit: number = 50): TruthSocialPost[] {
    if (limit <= 0) return []
    if (this.buffer.length <= limit) return [...this.buffer]
    return this.buffer.slice(-limit)
  }

  async ingestBatch(handle: string, posts: TruthSocialPost[]): Promise<TruthSocialPost[]> {
    const path = this.logPath(handle)
    await mkdir(dirname(path), { recursive: true })

    const newPosts: TruthSocialPost[] = []
    for (const post of posts) {
      if (this.dedup.has(post.postKey)) continue
      const validated = truthSocialPostSchema.parse(post)
      await appendFile(path, JSON.stringify(validated) + '\n', 'utf-8')
      this.dedup.add(validated.postKey)
      this.buffer.push(validated)
      newPosts.push(validated)
    }

    this.buffer.sort((a, b) => a.publishedAt - b.publishedAt)
    if (this.buffer.length > this.maxInMemory) {
      this.buffer = this.buffer.slice(-this.maxInMemory)
    }

    return newPosts
  }

  private logPath(handle: string): string {
    return `${this.dir}/${sanitizeHandle(handle)}.jsonl`
  }
}


function sanitizeHandle(handle: string): string {
  return handle.replace(/[^a-z0-9-_]/gi, '_')
}

function isENOENT(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT'
}
