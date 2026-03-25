import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SinopacPlatform } from './SinopacPlatform.js'


const mockHealth = vi.fn()
const mockWaitForHealth = vi.fn()

vi.mock('./sinopac-bridge-client.js', () => ({
  SinopacBridgeClient: vi.fn(() => ({
    health: mockHealth,
    waitForHealth: mockWaitForHealth,
  })),
}))

describe('SinopacPlatform', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates with correct defaults', () => {
    const platform = new SinopacPlatform({
      id: 'sinopac-test',
      bridgeUrl: 'http://localhost:8890',
      bridgeAutoStart: false,
      accountType: 'both',
    })
    expect(platform.id).toBe('sinopac-test')
    expect(platform.label).toBe('Sinopac')
    expect(platform.providerType).toBe('sinopac')
  })

  it('uses custom label', () => {
    const platform = new SinopacPlatform({
      id: 'sp',
      label: 'My Sinopac',
      bridgeUrl: 'http://localhost:8890',
      bridgeAutoStart: false,
      accountType: 'stock',
    })
    expect(platform.label).toBe('My Sinopac')
  })

  it('createAccount returns SinopacBroker', () => {
    const platform = new SinopacPlatform({
      id: 'sp',
      bridgeUrl: 'http://localhost:8890',
      bridgeAutoStart: false,
      accountType: 'both',
    })
    const broker = platform.createAccount({ id: 'acc-1', apiKey: 'key', apiSecret: 'secret' })
    expect(broker.id).toBe('acc-1')
    expect(broker.provider).toBe('sinopac')
  })

  describe('init', () => {
    it('succeeds when bridge is healthy', async () => {
      mockHealth.mockResolvedValue({ status: 'ok', logged_in: false })
      const platform = new SinopacPlatform({
        id: 'sp',
        bridgeUrl: 'http://localhost:8890',
        bridgeAutoStart: false,
        accountType: 'both',
      })
      await platform.init()
      expect(mockHealth).toHaveBeenCalled()
    })

    it('throws when bridge not available and autoStart is false', async () => {
      mockHealth.mockRejectedValue(new Error('ECONNREFUSED'))
      const platform = new SinopacPlatform({
        id: 'sp',
        bridgeUrl: 'http://localhost:8890',
        bridgeAutoStart: false,
        accountType: 'both',
      })
      await expect(platform.init()).rejects.toThrow('Bridge not available')
    })
  })
})
