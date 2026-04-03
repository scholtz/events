/**
 * Unit tests for pure utility functions exported from @/stores/communities.
 *
 * Covers:
 *  generateCommunitySlug — convert a display name to a URL-safe slug
 *
 * No store state, Pinia, or Vue components are involved; these are plain
 * function tests that run in the Vitest node environment.
 */

import { describe, expect, it } from 'vitest'
import { generateCommunitySlug } from '@/stores/communities'

describe('generateCommunitySlug', () => {
  it('lowercases all characters', () => {
    expect(generateCommunitySlug('Prague Crypto Circle')).toBe('prague-crypto-circle')
  })

  it('replaces spaces with hyphens', () => {
    expect(generateCommunitySlug('hello world')).toBe('hello-world')
  })

  it('replaces special characters with hyphens', () => {
    expect(generateCommunitySlug('AI & ML Enthusiasts!')).toBe('ai-ml-enthusiasts')
  })

  it('collapses multiple consecutive non-alphanumeric chars to a single hyphen', () => {
    expect(generateCommunitySlug('Web3 --- DeFi')).toBe('web3-defi')
  })

  it('trims leading hyphens', () => {
    expect(generateCommunitySlug('---blockchain')).toBe('blockchain')
  })

  it('trims trailing hyphens', () => {
    expect(generateCommunitySlug('blockchain---')).toBe('blockchain')
  })

  it('trims both leading and trailing hyphens', () => {
    expect(generateCommunitySlug('----Blockchain----')).toBe('blockchain')
  })

  it('handles all-lowercase alphanumeric input unchanged', () => {
    expect(generateCommunitySlug('meetupgroup')).toBe('meetupgroup')
  })

  it('preserves digits', () => {
    expect(generateCommunitySlug('Web3 2025')).toBe('web3-2025')
  })

  it('handles accented and unicode characters by replacing them with hyphens', () => {
    // Characters outside a-z0-9 are replaced; consecutive replacements collapse to one hyphen
    expect(generateCommunitySlug('Café de Paris')).toBe('caf-de-paris')
  })

  it('returns empty string for empty input', () => {
    expect(generateCommunitySlug('')).toBe('')
  })

  it('returns empty string for all-special-character input', () => {
    expect(generateCommunitySlug('!@#$%^&*()')).toBe('')
  })

  it('handles input that is already a valid slug', () => {
    expect(generateCommunitySlug('already-valid-slug')).toBe('already-valid-slug')
  })

  it('handles a single word', () => {
    expect(generateCommunitySlug('Blockchain')).toBe('blockchain')
  })

  it('handles leading and trailing whitespace', () => {
    expect(generateCommunitySlug('  Crypto Events  ')).toBe('crypto-events')
  })

  it('slug is stable (same output for same input)', () => {
    const name = 'Prague Blockchain Week'
    expect(generateCommunitySlug(name)).toBe(generateCommunitySlug(name))
  })
})
