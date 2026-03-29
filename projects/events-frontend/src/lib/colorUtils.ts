/**
 * Utility helpers for CSS color value validation used in domain hub branding forms.
 */

/**
 * Validates a CSS hex color string (3- or 6-digit, with a leading `#`).
 * Returns `true` when the value is valid OR when it is empty/blank
 * (empty is treated as "clearing the field", which is acceptable).
 *
 * Examples of valid values:  `#fff`, `#FFF`, `#137fec`, `#AABBCC`
 * Examples of invalid values: `red`, `rgb(0,0,0)`, `#gg0000`, `#12345`, `#1234567`
 */
export function isValidHexColor(value: string | null | undefined): boolean {
  if (!value || !value.trim()) return true
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value.trim())
}
