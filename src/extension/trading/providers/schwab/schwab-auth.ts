import { readFile, writeFile, mkdir } from 'fs/promises'
import { resolve } from 'path'
import { createSchwabAuth, type EnhancedTokenManager, type TokenData } from '@sudowealth/schwab-api'

const TOKEN_DIR = resolve('data/config')

function tokenPath(accountId: string): string {
  return resolve(TOKEN_DIR, `schwab-tokens-${accountId}.json`)
}

export async function loadTokens(accountId: string): Promise<TokenData | null> {
  try {
    const raw = await readFile(tokenPath(accountId), 'utf-8')
    return JSON.parse(raw) as TokenData
  } catch {
    return null
  }
}

export async function saveTokens(accountId: string, tokens: TokenData): Promise<void> {
  await mkdir(TOKEN_DIR, { recursive: true })
  await writeFile(tokenPath(accountId), JSON.stringify(tokens, null, 2) + '\n')
}

export function createSchwabAuthClient(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  accountId: string,
): EnhancedTokenManager {
  return createSchwabAuth({
    oauthConfig: {
      clientId,
      clientSecret,
      redirectUri,
      save: async (tokens: TokenData) => {
        await saveTokens(accountId, tokens)
      },
      load: async () => {
        return await loadTokens(accountId)
      },
    },
  })
}

/**
 * Exchange an OAuth callback URL for tokens and persist them.
 * Call this once after the user completes browser consent.
 */
export async function completeAuth(
  auth: EnhancedTokenManager,
  callbackUrl: string,
  accountId: string,
): Promise<void> {
  const url = new URL(callbackUrl)
  const code = url.searchParams.get('code')
  if (!code) {
    throw new Error('No authorization code found in callback URL. Expected ?code=... parameter.')
  }
  const state = url.searchParams.get('state') ?? undefined
  const tokens = await auth.exchangeCode(code, state)
  await saveTokens(accountId, tokens)
}
