<script setup lang="ts">
import { computed, onBeforeUnmount, ref, type CSSProperties } from 'vue'
import { bigScreenText } from '../i18n/zh-CN'
import {
  clampChannel,
  clampPercent,
  colorToCssValue,
  hexToRgb,
  hsvToRgb,
  parseColorValue,
  rgbToHsv,
  type RgbColor,
} from './colorUtils'

const props = defineProps<{
  name: string
  label: string
  value: string
  defaultValue: string
  swatches: string[]
  disabled: boolean
  showBackgroundBlur?: boolean
  backgroundBlur?: number
  defaultBlur?: number
}>()

const emit = defineEmits<{
  change: [value: string]
  blurChange: [value: number]
}>()

const saturationArea = ref<HTMLElement | null>(null)

const parsedColor = computed(() =>
  parseColorValue(props.value || props.defaultValue, props.defaultValue || '#2563eb'),
)
const hsvColor = computed(() => rgbToHsv(parsedColor.value.rgb))
const alphaPercent = computed(() => Math.round(parsedColor.value.alpha * 100))
const blurValue = computed(() => clampPercent(props.backgroundBlur ?? 0))
const uniqueSwatches = computed(() => {
  const seen = new Set<string>()

  return props.swatches
    .map((swatch) => swatch.trim())
    .filter((swatch) => {
      if (!swatch || swatch.toLowerCase() === 'transparent' || seen.has(swatch)) return false
      seen.add(swatch)
      return true
    })
    .slice(0, 16)
})
const spectrumStyle = computed<CSSProperties>(() => ({
  backgroundColor: `hsl(${hsvColor.value.h} 100% 50%)`,
}))
const spectrumHandleStyle = computed<CSSProperties>(() => ({
  left: `${hsvColor.value.s}%`,
  top: `${100 - hsvColor.value.v}%`,
}))

function emitColor(rgb: RgbColor, alpha = parsedColor.value.alpha) {
  if (props.disabled) return
  emit('change', colorToCssValue(rgb, alpha))
}

function selectSwatch(value: string) {
  if (props.disabled) return
  emit('change', value)
}

function restoreDefault() {
  if (props.disabled) return
  emit('change', props.defaultValue)
  if (props.showBackgroundBlur) {
    emit('blurChange', clampPercent(props.defaultBlur ?? 0))
  }
}

function updateHex(event: Event) {
  const rawValue = (event.target as HTMLInputElement).value.trim()
  const hex = rawValue.startsWith('#') ? rawValue : `#${rawValue}`
  const rgb = hexToRgb(hex)
  if (rgb) emitColor(rgb)
}

function updateChannel(channel: keyof RgbColor, event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  emitColor({ ...parsedColor.value.rgb, [channel]: clampChannel(value) })
}

function updateHue(event: Event) {
  const hue = Number((event.target as HTMLInputElement).value)
  emitColor(hsvToRgb({ ...hsvColor.value, h: hue }))
}

function updateAlpha(event: Event) {
  const percent = clampPercent(Number((event.target as HTMLInputElement).value))
  emitColor(parsedColor.value.rgb, percent / 100)
}

function updateBlur(event: Event) {
  if (props.disabled) return
  emit('blurChange', clampPercent(Number((event.target as HTMLInputElement).value)))
}

function updateSaturationFromPointer(event: PointerEvent) {
  const element = saturationArea.value
  if (!element || props.disabled) return

  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return

  const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width)
  const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height)
  const saturation = Math.round((x / rect.width) * 100)
  const value = Math.round((1 - y / rect.height) * 100)
  emitColor(hsvToRgb({ h: hsvColor.value.h, s: saturation, v: value }))
}

function stopSaturationDrag() {
  window.removeEventListener('pointermove', updateSaturationFromPointer)
  window.removeEventListener('pointerup', stopSaturationDrag)
}

function startSaturationDrag(event: PointerEvent) {
  if (props.disabled) return
  event.preventDefault()
  updateSaturationFromPointer(event)
  window.addEventListener('pointermove', updateSaturationFromPointer)
  window.addEventListener('pointerup', stopSaturationDrag)
}

onBeforeUnmount(() => {
  stopSaturationDrag()
})
</script>

<template>
  <div
    class="color-popover"
    role="dialog"
    :aria-label="bigScreenText.colorPicker.colorSettings(label)"
    :data-testid="`color-popover-${name}`"
    @mousedown.stop
    @click.stop
  >
    <button
      class="color-popover__reset"
      type="button"
      :disabled="disabled"
      :data-testid="`color-reset-${name}`"
      @click="restoreDefault"
    >
      {{ bigScreenText.colorPicker.restoreDefault }}
    </button>

    <section class="color-popover__section">
      <header class="color-popover__section-title">{{ bigScreenText.colorPicker.recommended }}</header>
      <div class="color-popover__swatches">
        <button
          v-for="(swatch, index) in uniqueSwatches"
          :key="`${swatch}-${index}`"
          class="color-popover__swatch"
          type="button"
          :class="{ 'is-selected': swatch === value }"
          :style="{ background: swatch }"
          :disabled="disabled"
          :aria-label="`${label}: ${swatch}`"
          :title="swatch"
          :data-testid="`color-popover-swatch-${name}-${index}`"
          @click="selectSwatch(swatch)"
        />
        <button
          class="color-popover__swatch color-popover__swatch--transparent"
          type="button"
          :class="{ 'is-selected': value === 'transparent' }"
          :disabled="disabled"
          :aria-label="`${label}: ${bigScreenText.colorPicker.transparent}`"
          :title="bigScreenText.colorPicker.transparent"
          :data-testid="`color-transparent-${name}`"
          @click="selectSwatch('transparent')"
        />
      </div>
    </section>

    <section class="color-popover__section">
      <header class="color-popover__section-title">{{ bigScreenText.colorPicker.moreColors }}</header>
      <div
        ref="saturationArea"
        class="color-popover__spectrum"
        :style="spectrumStyle"
        :data-testid="`color-spectrum-${name}`"
        @pointerdown="startSaturationDrag"
      >
        <span class="color-popover__spectrum-handle" :style="spectrumHandleStyle" />
      </div>
      <input
        class="color-popover__hue"
        type="range"
        min="0"
        max="359"
        :value="hsvColor.h"
        :disabled="disabled"
        :aria-label="bigScreenText.colorPicker.hue(label)"
        :data-testid="`color-hue-${name}`"
        @input="updateHue"
      />
    </section>

    <section class="color-popover__inputs">
      <span
        class="color-popover__preview"
        :style="{ background: parsedColor.isTransparent ? 'transparent' : parsedColor.cssValue }"
        aria-hidden="true"
      />
      <label class="color-popover__hex">
        <span>HEX</span>
        <input
          type="text"
          :value="parsedColor.hex"
          :disabled="disabled"
          spellcheck="false"
          :data-testid="`color-hex-${name}`"
          @input="updateHex"
        />
      </label>
      <label>
        <span>R</span>
        <input
          type="number"
          min="0"
          max="255"
          :value="parsedColor.rgb.r"
          :disabled="disabled"
          :data-testid="`color-r-${name}`"
          @input="updateChannel('r', $event)"
        />
      </label>
      <label>
        <span>G</span>
        <input
          type="number"
          min="0"
          max="255"
          :value="parsedColor.rgb.g"
          :disabled="disabled"
          :data-testid="`color-g-${name}`"
          @input="updateChannel('g', $event)"
        />
      </label>
      <label>
        <span>B</span>
        <input
          type="number"
          min="0"
          max="255"
          :value="parsedColor.rgb.b"
          :disabled="disabled"
          :data-testid="`color-b-${name}`"
          @input="updateChannel('b', $event)"
        />
      </label>
    </section>

    <section class="color-popover__slider-section">
      <div class="color-popover__slider-label">
        <span>{{ bigScreenText.colorPicker.opacity }}</span>
        <strong>{{ alphaPercent }}%</strong>
      </div>
      <input
        class="color-popover__slider"
        type="range"
        min="0"
        max="100"
        :value="alphaPercent"
        :disabled="disabled"
        :data-testid="`color-alpha-${name}`"
        @input="updateAlpha"
      />
    </section>

    <section v-if="showBackgroundBlur" class="color-popover__slider-section">
      <div class="color-popover__slider-label">
        <span>{{ bigScreenText.colorPicker.backgroundBlur }}</span>
        <strong>{{ blurValue }}%</strong>
      </div>
      <input
        class="color-popover__slider color-popover__slider--neutral"
        type="range"
        min="0"
        max="100"
        :value="blurValue"
        :disabled="disabled"
        :data-testid="`color-blur-${name}`"
        @input="updateBlur"
      />
    </section>
  </div>
</template>

<style scoped>
.color-popover {
  display: grid;
  gap: 12px;
  width: 292px;
  max-width: calc(100vw - 24px);
  padding: 12px;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: white;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
}

.color-popover__reset {
  width: 100%;
  min-height: 32px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: white;
  color: var(--color-text);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.color-popover__reset:hover:not(:disabled),
.color-popover__reset:focus-visible {
  border-color: color-mix(in srgb, var(--color-accent) 52%, var(--color-border));
  background: color-mix(in srgb, var(--color-accent-soft) 38%, white);
}

.color-popover__section {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.color-popover__section-title {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.color-popover__swatches {
  display: grid;
  grid-template-columns: repeat(8, 20px);
  gap: 8px 11px;
  align-items: center;
}

.color-popover__swatch,
.color-popover__preview {
  background-image:
    linear-gradient(45deg, #cbd5e1 25%, transparent 25%),
    linear-gradient(-45deg, #cbd5e1 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #cbd5e1 75%),
    linear-gradient(-45deg, transparent 75%, #cbd5e1 75%);
  background-position:
    0 0,
    0 6px,
    6px -6px,
    -6px 0;
  background-size: 12px 12px;
}

.color-popover__swatch {
  position: relative;
  width: 20px;
  height: 20px;
  border: 1px solid color-mix(in srgb, var(--color-border) 72%, transparent);
  border-radius: 5px;
  cursor: pointer;
}

.color-popover__swatch.is-selected {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 24%, transparent);
}

.color-popover__swatch--transparent::after {
  position: absolute;
  top: 9px;
  left: -2px;
  width: 24px;
  height: 2px;
  background: #ef4444;
  content: '';
  transform: rotate(45deg);
}

.color-popover__spectrum {
  position: relative;
  width: 100%;
  height: 128px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: crosshair;
}

.color-popover__spectrum::before,
.color-popover__spectrum::after {
  position: absolute;
  inset: 0;
  content: '';
  pointer-events: none;
}

.color-popover__spectrum::before {
  background: linear-gradient(90deg, white, transparent);
}

.color-popover__spectrum::after {
  background: linear-gradient(180deg, transparent, black);
}

.color-popover__spectrum-handle {
  position: absolute;
  z-index: 1;
  width: 14px;
  height: 14px;
  border: 2px solid white;
  border-radius: 999px;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.36);
  transform: translate(-50%, -50%);
}

.color-popover__hue,
.color-popover__slider {
  width: 100%;
  height: 14px;
  margin: 0;
  accent-color: var(--color-accent);
}

.color-popover__hue {
  border-radius: 999px;
  background: linear-gradient(90deg, red, yellow, lime, cyan, blue, magenta, red);
}

.color-popover__inputs {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) 44px 44px 44px;
  gap: 6px;
  align-items: end;
  min-width: 0;
}

.color-popover__inputs label {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.color-popover__inputs span {
  color: var(--color-text-muted);
  font-size: 10px;
  font-weight: 800;
  text-align: center;
}

.color-popover__preview {
  width: 24px;
  height: 24px;
  border: 1px solid var(--color-border);
  border-radius: 5px;
}

.color-popover__inputs input {
  width: 100%;
  min-width: 0;
  height: 28px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: white;
  color: var(--color-text);
  font-size: 12px;
  text-align: center;
}

.color-popover__hex input {
  text-align: left;
}

.color-popover__slider-section {
  display: grid;
  gap: 7px;
}

.color-popover__slider-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.color-popover__slider-label strong {
  color: var(--color-text-muted);
  font-size: 12px;
}

.color-popover__slider--neutral {
  accent-color: #94a3b8;
}

.color-popover button:disabled,
.color-popover input:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.color-popover button:focus-visible,
.color-popover input:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--color-accent) 32%, transparent);
  outline-offset: 1px;
}
</style>
