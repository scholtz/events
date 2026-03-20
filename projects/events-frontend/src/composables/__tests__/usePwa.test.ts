/**
 * Unit tests for usePwa composable.
 *
 * These tests run in the Node test environment (no DOM / window) and verify:
 *  - the composable exposes the correct API shape
 *  - isOffline and updateAvailable default to false
 *  - acceptUpdate is callable without throwing when no SW is registered
 *  - multiple instances are independent (no shared state)
 *  - offline/online state is represented as a Vue ref that can be mutated
 *
 * Browser-specific behaviour (addEventListener, navigator.onLine, workbox
 * registration) is exercised by the Playwright E2E tests instead.
 */

import { describe, expect, it, afterEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePwa', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exports the expected API shape', async () => {
    const { usePwa } = await import('@/composables/usePwa')
    const result = usePwa()

    expect(result).toHaveProperty('isOffline')
    expect(result).toHaveProperty('updateAvailable')
    expect(result).toHaveProperty('acceptUpdate')
    expect(typeof result.acceptUpdate).toBe('function')
    expect(typeof result.isOffline.value).toBe('boolean')
    expect(typeof result.updateAvailable.value).toBe('boolean')
  })

  it('isOffline starts as false', async () => {
    const { usePwa } = await import('@/composables/usePwa')
    const { isOffline } = usePwa()
    expect(isOffline.value).toBe(false)
  })

  it('updateAvailable starts as false', async () => {
    const { usePwa } = await import('@/composables/usePwa')
    const { updateAvailable } = usePwa()
    expect(updateAvailable.value).toBe(false)
  })

  it('acceptUpdate is callable without throwing when no SW is registered', async () => {
    const { usePwa } = await import('@/composables/usePwa')
    const { acceptUpdate } = usePwa()
    await expect(acceptUpdate()).resolves.toBeUndefined()
  })

  it('does not throw when called outside a component context', async () => {
    const { usePwa } = await import('@/composables/usePwa')
    expect(() => usePwa()).not.toThrow()
  })

  it('isOffline is a mutable reactive ref', async () => {
    const { usePwa } = await import('@/composables/usePwa')
    const { isOffline } = usePwa()

    isOffline.value = true
    expect(isOffline.value).toBe(true)
    isOffline.value = false
    expect(isOffline.value).toBe(false)
  })

  it('updateAvailable is a mutable reactive ref', async () => {
    const { usePwa } = await import('@/composables/usePwa')
    const { updateAvailable } = usePwa()

    expect(updateAvailable.value).toBe(false)
    updateAvailable.value = true
    expect(updateAvailable.value).toBe(true)
  })

  it('multiple composable instances have independent state', async () => {
    const { usePwa } = await import('@/composables/usePwa')
    const a = usePwa()
    const b = usePwa()

    a.isOffline.value = true
    expect(b.isOffline.value).toBe(false)

    a.updateAvailable.value = true
    expect(b.updateAvailable.value).toBe(false)
  })

  it('acceptUpdate is idempotent and resolves when wb is null (no SW)', async () => {
    const { usePwa } = await import('@/composables/usePwa')
    const { acceptUpdate } = usePwa()
    // Call twice - neither should throw
    await expect(acceptUpdate()).resolves.toBeUndefined()
    await expect(acceptUpdate()).resolves.toBeUndefined()
  })
})

