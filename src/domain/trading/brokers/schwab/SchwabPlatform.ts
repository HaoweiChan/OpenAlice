import type { IPlatform, PlatformCredentials } from '../factory.js'
import { SchwabBroker } from './SchwabBroker.js'


export interface SchwabPlatformConfig {
  id: string
  label?: string
}

export class SchwabPlatform implements IPlatform {
  readonly id: string
  readonly label: string
  readonly providerType = 'schwab'

  constructor(config: SchwabPlatformConfig) {
    this.id = config.id
    this.label = config.label ?? 'Schwab'
  }

  createAccount(credentials: PlatformCredentials): SchwabBroker {
    return new SchwabBroker({
      id: credentials.id,
      label: credentials.label,
      clientId: credentials.apiKey ?? '',
      clientSecret: credentials.apiSecret ?? '',
      redirectUri: credentials.password ?? 'https://127.0.0.1',
    })
  }
}
