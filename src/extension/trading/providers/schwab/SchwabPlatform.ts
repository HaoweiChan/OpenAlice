import type { IPlatform, PlatformCredentials } from '../../platform.js'
import { SchwabAccount } from './SchwabAccount.js'

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

  createAccount(credentials: PlatformCredentials): SchwabAccount {
    return new SchwabAccount({
      id: credentials.id,
      label: credentials.label,
      clientId: credentials.apiKey ?? '',
      clientSecret: credentials.apiSecret ?? '',
      redirectUri: credentials.password ?? 'https://127.0.0.1',
    })
  }
}
