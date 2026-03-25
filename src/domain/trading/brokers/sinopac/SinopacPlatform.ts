import type { ChildProcess } from 'node:child_process'
import type { IPlatform, PlatformCredentials } from '../factory.js'
import { SinopacBroker } from './SinopacBroker.js'
import { SinopacBridgeClient } from './sinopac-bridge-client.js'


export interface SinopacPlatformConfig {
  id: string
  label?: string
  bridgeUrl: string
  bridgeAutoStart: boolean
  accountType: 'stock' | 'futures' | 'both'
}

export class SinopacPlatform implements IPlatform {
  readonly id: string
  readonly label: string
  readonly providerType = 'sinopac'

  private readonly config: SinopacPlatformConfig
  private readonly client: SinopacBridgeClient
  private bridgeProcess: ChildProcess | null = null

  constructor(config: SinopacPlatformConfig) {
    this.config = config
    this.id = config.id
    this.label = config.label ?? 'Sinopac'
    this.client = new SinopacBridgeClient(config.bridgeUrl)
  }

  createAccount(credentials: PlatformCredentials): SinopacBroker {
    return new SinopacBroker({
      id: credentials.id,
      label: credentials.label,
      apiKey: credentials.apiKey ?? '',
      secretKey: credentials.apiSecret ?? '',
      bridgeUrl: this.config.bridgeUrl,
      accountType: this.config.accountType,
    })
  }

  /** Check bridge health. If bridgeAutoStart, spawn uvicorn when unavailable. */
  async init(): Promise<void> {
    try {
      const health = await this.client.health()
      if (health.status === 'ok') return
    } catch {
      // bridge not running
    }

    if (!this.config.bridgeAutoStart) {
      throw new Error(
        `Bridge not available at ${this.config.bridgeUrl}. ` +
        `Start the bridge manually: cd packages/sinopac/bridge && python server.py`,
      )
    }

    const { spawn } = await import('node:child_process')
    const port = new URL(this.config.bridgeUrl).port || '8890'
    this.bridgeProcess = spawn('uvicorn', ['server:app', '--host', '0.0.0.0', '--port', port], {
      cwd: 'packages/sinopac/bridge',
      stdio: 'pipe',
    })
    this.bridgeProcess.on('error', (err) => {
      console.error('[SinopacPlatform] Bridge process error:', err.message)
    })

    await this.client.waitForHealth(30_000)
  }

  async close(): Promise<void> {
    if (this.bridgeProcess) {
      this.bridgeProcess.kill('SIGTERM')
      this.bridgeProcess = null
    }
  }
}
