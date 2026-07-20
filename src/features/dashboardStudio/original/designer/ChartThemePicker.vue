<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import type { DashboardChartTheme } from "../../core/dashboardChartThemes";

const props = defineProps<{
  themes: DashboardChartTheme[];
  selectedThemeId: string;
  currentColors: string[];
  disabled: boolean;
}>();

const emit = defineEmits<{ select: [themeId: string] }>();
const root = ref<HTMLElement | null>(null);
const isOpen = ref(false);
const menuStyle = ref<Record<string, string>>({});
const selectedTheme = computed(() => props.themes.find((theme) => theme.id === props.selectedThemeId) ?? null);
const displayTitle = computed(() => selectedTheme.value?.title ?? "自定义");
const displayColors = computed(() => selectedTheme.value?.seriesColors ?? (props.currentColors.length ? props.currentColors : props.themes[0]?.seriesColors ?? []));

async function openMenu() {
  if (props.disabled) return;
  isOpen.value = true;
  await nextTick();
  const rect = root.value?.getBoundingClientRect();
  if (!rect) return;
  const panelRect = root.value?.closest("aside")?.getBoundingClientRect();
  const preferredHeight = 292;
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top - 72;
  const shouldOpenUp = spaceBelow < preferredHeight + 8 && spaceAbove > spaceBelow;
  const availableHeight = shouldOpenUp ? spaceAbove - 8 : spaceBelow - 8;
  const maxHeight = Math.max(180, Math.min(preferredHeight, availableHeight));
  const top = shouldOpenUp ? Math.max(72, rect.top - maxHeight - 6) : rect.bottom + 6;
  const frame = panelRect ? { left: panelRect.left + 12, right: panelRect.right - 12 } : { left: 8, right: window.innerWidth - 8 };
  const width = Math.min(rect.width, frame.right - frame.left);
  const left = Math.max(frame.left, Math.min(frame.right - width, rect.left));
  menuStyle.value = { left: `${left}px`, maxHeight: `${maxHeight}px`, top: `${top}px`, width: `${width}px` };
}

function closeMenu() { isOpen.value = false; }
function toggleMenu() { if (isOpen.value) closeMenu(); else void openMenu(); }
function selectTheme(themeId: string) { if (!props.disabled) { emit("select", themeId); closeMenu(); } }
function handleDocumentMouseDown(event: MouseEvent) { if (isOpen.value && !root.value?.contains(event.target as Node)) closeMenu(); }
function handleDocumentKeyDown(event: KeyboardEvent) { if (event.key === "Escape") closeMenu(); }

onMounted(() => {
  document.addEventListener("mousedown", handleDocumentMouseDown);
  document.addEventListener("keydown", handleDocumentKeyDown);
});
onBeforeUnmount(() => {
  document.removeEventListener("mousedown", handleDocumentMouseDown);
  document.removeEventListener("keydown", handleDocumentKeyDown);
});
</script>

<template>
  <div ref="root" class="chart-theme-picker" data-testid="chart-theme-picker">
    <button class="chart-theme-picker__trigger" type="button" :disabled="disabled" :aria-expanded="isOpen" aria-label="图表配色主题" data-testid="chart-theme-trigger" @click="toggleMenu">
      <span class="chart-theme-picker__strip" aria-hidden="true">
        <span v-for="(color, index) in displayColors" :key="`${color}-${index}`" class="chart-theme-picker__chip" :style="{ background: color }" />
      </span>
      <span class="chart-theme-picker__title">{{ displayTitle }}</span>
      <span class="chart-theme-picker__chevron" aria-hidden="true">⌄</span>
    </button>

    <div v-if="isOpen" class="chart-theme-picker__menu" :style="menuStyle" role="listbox" data-testid="chart-theme-menu">
      <button v-for="theme in themes" :key="theme.id" class="chart-theme-picker__option" :class="{ 'is-selected': theme.id === selectedThemeId }" type="button" role="option" :aria-selected="theme.id === selectedThemeId" :data-testid="`chart-theme-option-${theme.id}`" @click="selectTheme(theme.id)">
        <span class="chart-theme-picker__strip chart-theme-picker__strip--option" aria-hidden="true">
          <span v-for="(color, index) in theme.seriesColors" :key="`${theme.id}-${color}-${index}`" class="chart-theme-picker__chip" :style="{ background: color }" />
        </span>
        <span class="chart-theme-picker__option-title">{{ theme.title }}</span>
        <span v-if="theme.id === selectedThemeId" class="chart-theme-picker__badge">已选</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.chart-theme-picker { position: relative; min-width: 0; }
.chart-theme-picker__trigger { display: grid; grid-template-columns: minmax(86px, auto) minmax(0, 1fr) 16px; align-items: center; gap: 8px; width: 100%; min-height: 36px; padding: 6px 8px; border: 1px solid var(--color-border); border-radius: 7px; background: white; color: var(--color-text); cursor: pointer; transition: border-color var(--motion-fast) var(--ease-enter), box-shadow var(--motion-fast) var(--ease-enter), background var(--motion-fast) var(--ease-enter); }
.chart-theme-picker__trigger:hover:not(:disabled), .chart-theme-picker__trigger:focus-visible { border-color: color-mix(in srgb, var(--color-accent) 58%, var(--color-border)); background: color-mix(in srgb, var(--color-accent-soft) 34%, white); }
.chart-theme-picker__trigger:focus-visible { outline: 3px solid color-mix(in srgb, var(--color-accent) 32%, transparent); outline-offset: 1px; }
.chart-theme-picker__trigger:disabled { cursor: not-allowed; opacity: .58; }
.chart-theme-picker__strip { display: grid; grid-auto-flow: column; grid-auto-columns: 16px; align-items: center; justify-content: start; max-width: 112px; overflow: hidden; border-radius: 5px; }
.chart-theme-picker__strip--option { max-width: 128px; }
.chart-theme-picker__chip { width: 16px; height: 18px; }
.chart-theme-picker__title, .chart-theme-picker__option-title { min-width: 0; overflow: hidden; font-size: 12px; font-weight: 800; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.chart-theme-picker__chevron { color: var(--color-text-muted); font-size: 15px; font-weight: 900; line-height: 1; transition: transform var(--motion-fast) var(--ease-enter); }
.chart-theme-picker__trigger[aria-expanded="true"] .chart-theme-picker__chevron { transform: rotate(180deg); }
.chart-theme-picker__menu { position: fixed; z-index: 24; display: grid; gap: 4px; padding: 6px; overflow: auto; border: 1px solid var(--color-border); border-radius: 8px; background: white; box-shadow: 0 18px 40px rgba(15,23,42,.16); }
.chart-theme-picker__option { display: grid; grid-template-columns: minmax(96px, auto) minmax(0, 1fr) auto; align-items: center; gap: 8px; min-width: 0; min-height: 34px; padding: 6px 7px; border: 0; border-radius: 7px; background: transparent; color: var(--color-text); cursor: pointer; }
.chart-theme-picker__option:hover, .chart-theme-picker__option:focus-visible, .chart-theme-picker__option.is-selected { background: color-mix(in srgb, var(--color-accent-soft) 46%, white); }
.chart-theme-picker__option:focus-visible { outline: 3px solid color-mix(in srgb, var(--color-accent) 28%, transparent); outline-offset: 1px; }
.chart-theme-picker__badge { min-width: 0; padding: 2px 5px; border: 1px solid color-mix(in srgb, var(--color-accent) 36%, transparent); border-radius: 5px; background: color-mix(in srgb, var(--color-accent-soft) 62%, white); color: var(--color-accent); font-size: 10px; font-weight: 900; white-space: nowrap; }
</style>
