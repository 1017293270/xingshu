export type RgbColor = {
  r: number
  g: number
  b: number
}
export type HsvColor = {
  h: number
  s: number
  v: number
}

export type ParsedColor = {
  rgb: RgbColor
  alpha: number
  hex: string
  cssValue: string
  isParsed: boolean
  isTransparent: boolean
}

const HEX_COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const RGB_COLOR_PATTERN = /^rgba?\((.+)\)$/i

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function clampChannel(value: number): number {
  return Math.round(clamp(Number.isFinite(value) ? value : 0, 0, 255))
}

export function clampAlpha(value: number): number {
  return Math.round(clamp(Number.isFinite(value) ? value : 1, 0, 1) * 100) / 100
}

export function clampPercent(value: number): number {
  return Math.round(clamp(Number.isFinite(value) ? value : 0, 0, 100))
}

export function rgbToHex({ r, g, b }: RgbColor): string {
  return `#${[r, g, b].map((channel) => clampChannel(channel).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

export function hexToRgb(value: string): RgbColor | null {
  const trimmed = value.trim()
  const match = trimmed.match(HEX_COLOR_PATTERN)
  if (!match) return null

  const hex = match[1]
  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((character) => `${character}${character}`)
          .join('')
      : hex

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

function parseRgbColor(value: string): { rgb: RgbColor; alpha: number } | null {
  const match = value.trim().match(RGB_COLOR_PATTERN)
  if (!match) return null

  const parts = match[1]
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length !== 3 && parts.length !== 4) return null

  const channels = parts.slice(0, 3).map((part) => Number(part))
  if (channels.some((channel) => !Number.isFinite(channel))) return null

  const alpha = parts[3] === undefined ? 1 : Number(parts[3])
  if (!Number.isFinite(alpha)) return null

  return {
    rgb: {
      r: clampChannel(channels[0]),
      g: clampChannel(channels[1]),
      b: clampChannel(channels[2]),
    },
    alpha: clampAlpha(alpha),
  }
}

function formatAlpha(alpha: number): string {
  return clampAlpha(alpha).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

export function colorToCssValue(rgb: RgbColor, alpha = 1): string {
  const normalizedAlpha = clampAlpha(alpha)
  if (normalizedAlpha >= 1) return rgbToHex(rgb)

  return `rgba(${clampChannel(rgb.r)}, ${clampChannel(rgb.g)}, ${clampChannel(rgb.b)}, ${formatAlpha(normalizedAlpha)})`
}

export function parseColorValue(value: string, fallbackValue = '#2563eb'): ParsedColor {
  const trimmed = value.trim()
  const fallback = hexToRgb(fallbackValue) ?? { r: 37, g: 99, b: 235 }

  if (trimmed.toLowerCase() === 'transparent') {
    return {
      rgb: fallback,
      alpha: 0,
      hex: rgbToHex(fallback),
      cssValue: 'transparent',
      isParsed: true,
      isTransparent: true,
    }
  }

  const hexRgb = hexToRgb(trimmed)
  if (hexRgb) {
    return {
      rgb: hexRgb,
      alpha: 1,
      hex: rgbToHex(hexRgb),
      cssValue: rgbToHex(hexRgb),
      isParsed: true,
      isTransparent: false,
    }
  }

  const rgbColor = parseRgbColor(trimmed)
  if (rgbColor) {
    return {
      rgb: rgbColor.rgb,
      alpha: rgbColor.alpha,
      hex: rgbToHex(rgbColor.rgb),
      cssValue: colorToCssValue(rgbColor.rgb, rgbColor.alpha),
      isParsed: true,
      isTransparent: false,
    }
  }

  return {
    rgb: fallback,
    alpha: 1,
    hex: rgbToHex(fallback),
    cssValue: trimmed,
    isParsed: false,
    isTransparent: false,
  }
}

export function rgbToHsv({ r, g, b }: RgbColor): HsvColor {
  const red = clampChannel(r) / 255
  const green = clampChannel(g) / 255
  const blue = clampChannel(b) / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min

  let hue = 0
  if (delta !== 0) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6)
    if (max === green) hue = 60 * ((blue - red) / delta + 2)
    if (max === blue) hue = 60 * ((red - green) / delta + 4)
  }

  return {
    h: Math.round((hue + 360) % 360),
    s: max === 0 ? 0 : Math.round((delta / max) * 100),
    v: Math.round(max * 100),
  }
}

export function hsvToRgb({ h, s, v }: HsvColor): RgbColor {
  const hue = ((Number.isFinite(h) ? h : 0) % 360 + 360) % 360
  const saturation = clamp(Number.isFinite(s) ? s : 0, 0, 100) / 100
  const value = clamp(Number.isFinite(v) ? v : 0, 0, 100) / 100
  const chroma = value * saturation
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = value - chroma
  let red = 0
  let green = 0
  let blue = 0

  if (hue < 60) {
    red = chroma
    green = x
  } else if (hue < 120) {
    red = x
    green = chroma
  } else if (hue < 180) {
    green = chroma
    blue = x
  } else if (hue < 240) {
    green = x
    blue = chroma
  } else if (hue < 300) {
    red = x
    blue = chroma
  } else {
    red = chroma
    blue = x
  }

  return {
    r: clampChannel((red + m) * 255),
    g: clampChannel((green + m) * 255),
    b: clampChannel((blue + m) * 255),
  }
}
