<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { bigScreenText } from '../i18n/zh-CN'
import ColorPickerPopover from './ColorPickerPopover.vue'
import { parseColorValue } from './colorUtils'

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

const root = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const popoverStyle = ref<Record<string, string>>({})
const parsedColor = computed(() => parseColorValue(props.value || props.defaultValue, props.defaultValue || '#2563eb'))
const previewStyle = computed(() => ({
  background: parsedColor.value.isTransparent ? 'transparent' : parsedColor.value.cssValue,
}))

function emitColor(value: string) {
  if (props.disabled) return
  emit('change', value.trim())
}

function emitBlur(value: number) {
  if (props.disabled) return
  emit('blurChange', value)
}

function getInputValue(event: Event): string {
  return (event.target as HTMLInputElement).value
}

function updateFromText(event: Event) {
  emitColor(getInputValue(event))
}

async function openPopover() {
  if (props.disabled) return
  isOpen.value = true
  await nextTick()

  const rect = root.value?.getBoundingClientRect()
  if (!rect) return

  const panelRect = root.value?.closest('aside')?.getBoundingClientRect()
  const popoverWidth = 292
  const estimatedPopoverHeight = props.showBackgroundBlur ? 488 : 430
  const spaceBelow = window.innerHeight - rect.bottom
  const spaceAbove = rect.top - 72
  const shouldOpenUp = spaceBelow < estimatedPopoverHeight + 12 && spaceAbove > spaceBelow
  const availableHeight = shouldOpenUp ? spaceAbove - 7 : spaceBelow - 12
  const maxHeight = Math.max(280, Math.min(estimatedPopoverHeight, availableHeight))
  const top = shouldOpenUp ? Math.max(72, rect.top - maxHeight - 7) : rect.bottom + 7
  const horizontalFrame =
    panelRect && panelRect.width >= popoverWidth + 24
      ? { left: panelRect.left + 12, right: panelRect.right - 12 }
      : { left: 8, right: window.innerWidth - 8 }
  const left = Math.max(
    horizontalFrame.left,
    Math.min(horizontalFrame.right - popoverWidth, rect.right - popoverWidth),
  )

  popoverStyle.value = {
    left: `${left}px`,
    maxHeight: `${maxHeight}px`,
    top: `${top}px`,
  }
}

function togglePopover() {
  if (isOpen.value) {
    closePopover()
    return
  }

  void openPopover()
}

function closePopover() {
  isOpen.value = false
}

function handleDocumentMouseDown(event: MouseEvent) {
  if (!isOpen.value) return
  if (root.value?.contains(event.target as Node)) return
  closePopover()
}

function handleDocumentKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') closePopover()
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentMouseDown)
  document.addEventListener('keydown', handleDocumentKeyDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentMouseDown)
  document.removeEventListener('keydown', handleDocumentKeyDown)
})
</script>

<template>
  <div ref="root" class="color-field" :data-testid="`color-field-${name}`">
    <span class="color-field__label">{{ label }}</span>
    <button
      class="color-field__trigger"
      type="button"
      :disabled="disabled"
      :aria-expanded="isOpen"
      :aria-label="bigScreenText.colorPicker.colorSettings(label)"
      :data-testid="`color-trigger-${name}`"
      @click="togglePopover"
    >
      <span class="color-field__preview" :style="previewStyle" aria-hidden="true" />
    </button>
    <input
      class="color-field__input"
      type="text"
      :value="value"
      :placeholder="defaultValue"
      :disabled="disabled"
      spellcheck="false"
      :data-testid="`color-input-${name}`"
      @change="updateFromText"
    />
    <ColorPickerPopover
      v-if="isOpen"
      class="color-field__popover"
      :style="popoverStyle"
      :name="name"
      :label="label"
      :value="value"
      :default-value="defaultValue"
      :swatches="swatches"
      :disabled="disabled"
      :show-background-blur="showBackgroundBlur"
      :background-blur="backgroundBlur"
      :default-blur="defaultBlur"
      @change="emitColor"
      @blur-change="emitBlur"
    />
  </div>
</template>

<style scoped>
.color-field {
  position: relative;
  display: grid;
  grid-template-columns: 76px 34px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.color-field__label {
  min-width: 0;
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 900;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.color-field__trigger {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 3px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: white;
  cursor: pointer;
}

.color-field__preview {
  width: 100%;
  height: 100%;
  border-radius: 5px;
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

.color-field__input {
  width: 100%;
  min-width: 0;
  height: 34px;
  padding: 0 9px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: white;
  color: var(--color-text);
}

.color-field__trigger:focus-visible,
.color-field__input:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--color-accent) 32%, transparent);
  outline-offset: 1px;
}

.color-field__trigger:disabled,
.color-field__input:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.color-field__popover {
  position: fixed;
  z-index: 30;
}
</style>
