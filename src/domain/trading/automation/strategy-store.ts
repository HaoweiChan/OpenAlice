import { readFile, writeFile, mkdir, readdir, unlink, watch } from 'node:fs/promises'
import { resolve } from 'node:path'
import { z } from 'zod'
import { EventEmitter } from 'node:events'

const STRATEGIES_DIR = resolve('data/strategies')

export const LiveStrategySchema = z.object({
  id: z.string().min(1),
  symbol: z.string().min(1),
  securityType: z.enum(['futures', 'stocks', 'options']),
  timeframe: z.enum(['1m', '5m', '15m', '30m', '1h']),
  broker: z.string().min(1),
  direction: z.enum(['long', 'short', 'both']).default('both'),
  entryLong: z.string().optional(),
  exitLong: z.string().optional(),
  entryShort: z.string().optional(),
  exitShort: z.string().optional(),
  parameters: z.record(z.string(), z.number()).default({}),
  maxPosition: z.number().int().min(1).default(5),
  enabled: z.boolean().default(false),
  deployment: z.object({
    backtestId: z.string().optional(),
    walkForwardScore: z.number().optional(),
    deployedAt: z.string().optional(),
  }).optional(),
})

export type LiveStrategyDef = z.infer<typeof LiveStrategySchema>

type StrategyEvent = 'create' | 'update' | 'delete' | 'enable' | 'disable'


export class StrategyStore extends EventEmitter {
  private strategies = new Map<string, LiveStrategyDef>()
  private watcher: AsyncIterable<{ eventType: string; filename: string | null }> | null = null
  private watchAbort: AbortController | null = null

  async init(): Promise<void> {
    await mkdir(STRATEGIES_DIR, { recursive: true })
    await this._loadAll()
    this._startWatch()
  }

  list(): LiveStrategyDef[] {
    return [...this.strategies.values()]
  }

  listEnabled(): LiveStrategyDef[] {
    return this.list().filter((s) => s.enabled)
  }

  get(id: string): LiveStrategyDef | undefined {
    return this.strategies.get(id)
  }

  async create(def: LiveStrategyDef): Promise<LiveStrategyDef> {
    const validated = LiveStrategySchema.parse(def)
    if (this.strategies.has(validated.id)) {
      throw new Error(`Strategy "${validated.id}" already exists`)
    }
    await this._write(validated)
    this.strategies.set(validated.id, validated)
    this.emit('change', 'create' as StrategyEvent, validated)
    return validated
  }

  async update(id: string, partial: Partial<LiveStrategyDef>): Promise<LiveStrategyDef> {
    const existing = this.strategies.get(id)
    if (!existing) throw new Error(`Strategy "${id}" not found`)
    const merged = LiveStrategySchema.parse({ ...existing, ...partial, id })
    await this._write(merged)
    this.strategies.set(id, merged)
    this.emit('change', 'update' as StrategyEvent, merged)
    return merged
  }

  async enable(id: string): Promise<void> {
    const s = await this.update(id, { enabled: true })
    this.emit('change', 'enable' as StrategyEvent, s)
  }

  async disable(id: string): Promise<void> {
    const s = await this.update(id, { enabled: false })
    this.emit('change', 'disable' as StrategyEvent, s)
  }

  async remove(id: string): Promise<void> {
    const existing = this.strategies.get(id)
    if (!existing) return
    await unlink(this._filePath(id)).catch(() => {})
    this.strategies.delete(id)
    this.emit('change', 'delete' as StrategyEvent, existing)
  }

  destroy(): void {
    this.watchAbort?.abort()
  }

  private _filePath(id: string): string {
    return resolve(STRATEGIES_DIR, `${id}.json`)
  }

  private async _write(def: LiveStrategyDef): Promise<void> {
    await writeFile(this._filePath(def.id), JSON.stringify(def, null, 2))
  }

  private async _loadAll(): Promise<void> {
    let files: string[]
    try {
      files = await readdir(STRATEGIES_DIR)
    } catch {
      return
    }
    for (const f of files) {
      if (!f.endsWith('.json') || f.endsWith('.performance.json')) continue
      try {
        const raw = await readFile(resolve(STRATEGIES_DIR, f), 'utf-8')
        const parsed = LiveStrategySchema.parse(JSON.parse(raw))
        this.strategies.set(parsed.id, parsed)
      } catch (e) {
        console.warn(`strategy-store: failed to load ${f}:`, e)
      }
    }
  }

  private _startWatch(): void {
    this.watchAbort = new AbortController()
    ;(async () => {
      try {
        const watcher = watch(STRATEGIES_DIR, { signal: this.watchAbort!.signal })
        for await (const event of watcher) {
          if (!event.filename?.endsWith('.json') || event.filename.endsWith('.performance.json')) continue
          const id = event.filename.replace('.json', '')
          try {
            const raw = await readFile(resolve(STRATEGIES_DIR, event.filename), 'utf-8')
            const parsed = LiveStrategySchema.parse(JSON.parse(raw))
            const existed = this.strategies.has(id)
            this.strategies.set(id, parsed)
            this.emit('change', existed ? 'update' : 'create', parsed)
          } catch {
            if (this.strategies.has(id)) {
              const old = this.strategies.get(id)!
              this.strategies.delete(id)
              this.emit('change', 'delete', old)
            }
          }
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') console.warn('strategy-store: watcher error:', e)
      }
    })()
  }
}
