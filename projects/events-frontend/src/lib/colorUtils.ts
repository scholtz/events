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

/**
 * Guards against CSS injection in domain brand color values.
 * Returns the trimmed color string when it is a valid 3- or 6-digit hex color,
 * or `null` when the value is absent, empty, or not a valid hex color.
 *
 * Use this when setting CSS custom properties from user-supplied domain brand colors
 * to prevent arbitrary CSS values from being injected into inline style attributes.
 *
 * Examples:
 *   safeHexColor('#137fec') → '#137fec'
 *   safeHexColor('#fff')    → '#fff'
 *   safeHexColor('red')     → null
 *   safeHexColor(null)      → null
 *   safeHexColor('')        → null
 */
export function safeHexColor(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(trimmed) ? trimmed : null
}
