import { describe, expect, it } from 'vitest'
import { isValidHexColor, safeHexColor } from '@/lib/colorUtils'

describe('isValidHexColor', () => {
  // ── Valid values (should return true) ───────────────────────────────────────
  it('accepts a 6-digit lowercase hex color', () => {
    expect(isValidHexColor('#137fec')).toBe(true)
  })

  it('accepts a 6-digit uppercase hex color', () => {
    expect(isValidHexColor('#AABBCC')).toBe(true)
  })

  it('accepts a 6-digit mixed-case hex color', () => {
    expect(isValidHexColor('#Ff5500')).toBe(true)
  })

  it('accepts a 3-digit lowercase hex color', () => {
    expect(isValidHexColor('#fff')).toBe(true)
  })

  it('accepts a 3-digit uppercase hex color', () => {
    expect(isValidHexColor('#ABC')).toBe(true)
  })

  it('accepts a 3-digit shorthand with digits', () => {
    expect(isValidHexColor('#123')).toBe(true)
  })

  it('accepts value with surrounding whitespace (trims before matching)', () => {
    expect(isValidHexColor('  #137fec  ')).toBe(true)
  })

  // ── Empty / blank (treated as "clearing the field" — valid) ─────────────────
  it('returns true for an empty string', () => {
    expect(isValidHexColor('')).toBe(true)
  })

  it('returns true for a whitespace-only string', () => {
    expect(isValidHexColor('   ')).toBe(true)
  })

  it('returns true for null', () => {
    expect(isValidHexColor(null)).toBe(true)
  })

  it('returns true for undefined', () => {
    expect(isValidHexColor(undefined)).toBe(true)
  })

  // ── Invalid values (should return false) ────────────────────────────────────
  it('rejects a named CSS color', () => {
    expect(isValidHexColor('red')).toBe(false)
  })

  it('rejects an rgb() function value', () => {
    expect(isValidHexColor('rgb(255, 0, 0)')).toBe(false)
  })

  it('rejects a hex color missing the leading #', () => {
    expect(isValidHexColor('137fec')).toBe(false)
  })

  it('rejects a 4-digit hex value', () => {
    expect(isValidHexColor('#1234')).toBe(false)
  })

  it('rejects a 5-digit hex value', () => {
    expect(isValidHexColor('#12345')).toBe(false)
  })

  it('rejects a 7-digit hex value', () => {
    expect(isValidHexColor('#1234567')).toBe(false)
  })

  it('rejects a hex value with invalid characters (g)', () => {
    expect(isValidHexColor('#gg0000')).toBe(false)
  })

  it('rejects a hex value with special characters', () => {
    expect(isValidHexColor('#ff550!')).toBe(false)
  })

  it('rejects just a hash symbol with no digits', () => {
    expect(isValidHexColor('#')).toBe(false)
  })

  it('rejects a hex value with a space inside', () => {
    expect(isValidHexColor('#ff 550')).toBe(false)
  })
})

describe('safeHexColor', () => {
  // ── Valid values (should return the trimmed color string) ────────────────────
  it('returns the color for a valid 6-digit hex', () => {
    expect(safeHexColor('#137fec')).toBe('#137fec')
  })

  it('returns the color for a valid 3-digit hex', () => {
    expect(safeHexColor('#fff')).toBe('#fff')
  })

  it('returns the uppercase hex unchanged', () => {
    expect(safeHexColor('#AABBCC')).toBe('#AABBCC')
  })

  it('trims surrounding whitespace before returning the valid color', () => {
    expect(safeHexColor('  #137fec  ')).toBe('#137fec')
  })

  // ── Absent / empty values (should return null) ───────────────────────────────
  it('returns null for null input', () => {
    expect(safeHexColor(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(safeHexColor(undefined)).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(safeHexColor('')).toBeNull()
  })

  it('returns null for a whitespace-only string', () => {
    expect(safeHexColor('   ')).toBeNull()
  })

  // ── Invalid color values (should return null to prevent CSS injection) ────────
  it('returns null for a named CSS color', () => {
    expect(safeHexColor('red')).toBeNull()
  })

  it('returns null for an rgb() value', () => {
    expect(safeHexColor('rgb(255, 0, 0)')).toBeNull()
  })

  it('returns null for a hex missing the leading #', () => {
    expect(safeHexColor('137fec')).toBeNull()
  })

  it('returns null for a 7-digit hex (would be CSS injection risk)', () => {
    expect(safeHexColor('#1234567')).toBeNull()
  })

  it('returns null for a hex with invalid characters', () => {
    expect(safeHexColor('#gg0000')).toBeNull()
  })

  it('returns null for a hex with a space inside', () => {
    expect(safeHexColor('#ff 550')).toBeNull()
  })
})
