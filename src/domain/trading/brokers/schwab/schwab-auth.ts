import { readFile, writeFile, mkdir } from 'fs/promises'
import { resolve } from 'path'


const TOKEN_DIR = resolve('data/config')

function tokenPath(accountId: string): string {
  return resolve(TOKEN_DIR, `schwab-tokens-${accountId}.json`)
}

export async function loadTokens(accountId: string): Promise<unknown | null> {
  try {
    const raw = await readFile(tokenPath(accountId), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function saveTokens(accountId: string, tokens: unknown): Promise<void> {
  await mkdir(TOKEN_DIR, { recursive: true })
  await writeFile(tokenPath(accountId), JSON.stringify(tokens, null, 2) + '\n')
}

export async function createSchwabAuthClient(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  accountId: string,
) {
  const { createSchwabAuth } = await import('@sudowealth/schwab-api')
  return createSchwabAuth({
    oauthConfig: {
      clientId,
      clientSecret,
      redirectUri,
      save: async (tokens: unknown) => {
        await saveTokens(accountId, tokens)
      },
      load: async () => {
        return await loadTokens(accountId)
      },
    },
  })
}

export async function completeAuth(
  auth: { exchangeCode: (code: string, state?: string) => Promise<unknown> },
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
