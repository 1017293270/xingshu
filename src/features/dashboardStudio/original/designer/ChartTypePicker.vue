<script setup lang="ts">
import type {
  DashboardChartPreviewKind,
  DashboardChartVariantGroup
} from "../../core/dashboardChartPresets";

defineProps<{
  groups: DashboardChartVariantGroup[];
  selectedPresetId: string;
  disabled: boolean;
}>();

const emit = defineEmits<{ select: [presetId: string] }>();

const dataRequirementLabels: Record<DashboardChartVariantGroup["dataRequirement"], string> = {
  "time-series": "时间序列",
  category: "分类数据",
  "time-series-or-category": "时间或分类"
};

function isBarPreview(kind: DashboardChartPreviewKind) {
  return kind === "bar-vertical" || kind === "bar-horizontal" || kind === "bar-compact";
}

function isLinePreview(kind: DashboardChartPreviewKind) {
  return kind === "line-smooth" || kind === "line-stepped" || kind === "line-minimal";
}

function isAreaPreview(kind: DashboardChartPreviewKind) {
  return kind === "area-bold" || kind === "area-soft" || kind === "area-wire";
}

function isPiePreview(kind: DashboardChartPreviewKind) {
  return kind === "pie-donut" || kind === "pie-rose" || kind === "pie-solid";
}

function isRadarPreview(kind: DashboardChartPreviewKind) {
  return kind === "radar-filled" || kind === "radar-outline" || kind === "radar-compact";
}
</script>

<template>
  <div class="chart-type-picker" data-testid="chart-type-picker">
    <section v-for="group in groups" :key="group.type" class="chart-type-picker__group">
      <header class="chart-type-picker__heading">
        <span>{{ group.title }}</span>
        <small>{{ dataRequirementLabels[group.dataRequirement] }}</small>
      </header>

      <div class="chart-type-picker__grid">
        <button
          v-for="preset in group.variants"
          :key="preset.id"
          class="chart-type-picker__option"
          :class="{ 'is-selected': selectedPresetId === preset.id }"
          type="button"
          :disabled="disabled"
          :aria-pressed="selectedPresetId === preset.id"
          :aria-label="`${group.title}: ${preset.title}`"
          :data-testid="`chart-preset-${preset.id}`"
          :title="preset.title"
          @click="emit('select', preset.id)"
        >
          <span class="chart-type-picker__preview" :class="`chart-type-picker__preview--${preset.previewKind}`" aria-hidden="true">
            <template v-if="isBarPreview(preset.previewKind)">
              <span v-for="index in 3" :key="index" class="chart-type-picker__bar" />
            </template>
            <template v-else-if="isLinePreview(preset.previewKind)">
              <span class="chart-type-picker__line" />
            </template>
            <template v-else-if="isAreaPreview(preset.previewKind)">
              <span class="chart-type-picker__area" />
            </template>
            <template v-else-if="isPiePreview(preset.previewKind)">
              <span class="chart-type-picker__pie" />
            </template>
            <template v-else-if="isRadarPreview(preset.previewKind)">
              <span class="chart-type-picker__radar" />
            </template>
            <template v-else>
              <span v-for="index in 3" :key="index" class="chart-type-picker__funnel" />
            </template>
          </span>
          <span class="chart-type-picker__label">{{ preset.title }}</span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.chart-type-picker { display: grid; gap: 12px; min-width: 0; max-height: 380px; padding-right: 2px; overflow: auto; }
.chart-type-picker__group { display: grid; gap: 8px; min-width: 0; }
.chart-type-picker__heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.chart-type-picker__heading span { min-width: 0; overflow: hidden; color: var(--color-text); font-size: 12px; font-weight: 900; text-overflow: ellipsis; white-space: nowrap; }
.chart-type-picker__heading small { flex: 0 0 auto; color: var(--color-text-muted); font-size: 10px; font-weight: 800; }
.chart-type-picker__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.chart-type-picker__option { display: grid; align-content: start; gap: 6px; min-width: 0; min-height: 78px; padding: 7px; border: 1px solid var(--color-border); border-radius: 8px; background: white; color: var(--color-text); cursor: pointer; transition: border-color var(--motion-fast) var(--ease-enter), background var(--motion-fast) var(--ease-enter), box-shadow var(--motion-fast) var(--ease-enter); }
.chart-type-picker__option:hover:not(:disabled), .chart-type-picker__option:focus-visible { border-color: color-mix(in srgb, var(--color-accent) 58%, var(--color-border)); background: color-mix(in srgb, var(--color-accent-soft) 42%, white); }
.chart-type-picker__option:focus-visible { outline: 3px solid color-mix(in srgb, var(--color-accent) 32%, transparent); outline-offset: 1px; }
.chart-type-picker__option.is-selected { border-color: var(--color-accent); background: color-mix(in srgb, var(--color-accent-soft) 58%, white); box-shadow: inset 0 0 0 1px var(--color-accent); }
.chart-type-picker__option:disabled { cursor: not-allowed; opacity: .58; }
.chart-type-picker__preview { position: relative; display: grid; place-items: center; width: 100%; min-width: 0; height: 34px; overflow: hidden; border-radius: 6px; background: linear-gradient(180deg, rgba(37,99,235,.08), transparent), linear-gradient(90deg, rgba(148,163,184,.2) 1px, transparent 1px), linear-gradient(180deg, rgba(148,163,184,.2) 1px, transparent 1px); background-size: 100% 100%, 18px 18px, 18px 18px; }
.chart-type-picker__label { display: -webkit-box; min-width: 0; overflow: hidden; color: var(--color-text); font-size: 10px; font-weight: 800; line-height: 1.15; text-align: center; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.chart-type-picker__bar { align-self: end; width: 7px; border-radius: 3px 3px 1px 1px; background: #3b82f6; }
.chart-type-picker__preview:has(.chart-type-picker__bar) { grid-auto-flow: column; align-items: end; justify-content: center; gap: 5px; padding: 7px 0; }
.chart-type-picker__bar:nth-child(1) { height: 24px; }
.chart-type-picker__bar:nth-child(2) { height: 15px; background: #93c5fd; }
.chart-type-picker__bar:nth-child(3) { height: 21px; background: #60a5fa; }
.chart-type-picker__preview--bar-horizontal { grid-auto-flow: row; align-content: center; gap: 4px; }
.chart-type-picker__preview--bar-horizontal .chart-type-picker__bar { width: 30px; height: 6px; border-radius: 2px; }
.chart-type-picker__preview--bar-horizontal .chart-type-picker__bar:nth-child(2) { width: 22px; }
.chart-type-picker__preview--bar-compact .chart-type-picker__bar { width: 5px; }
.chart-type-picker__line, .chart-type-picker__area { width: 48px; height: 24px; border-radius: 2px; }
.chart-type-picker__line { background: linear-gradient(135deg, transparent 0 21%, #60a5fa 22% 28%, transparent 29% 42%, #60a5fa 43% 50%, transparent 51% 64%, #60a5fa 65% 72%, transparent 73%), linear-gradient(45deg, transparent 0 34%, #60a5fa 35% 41%, transparent 42%); }
.chart-type-picker__preview--line-stepped .chart-type-picker__line { background: linear-gradient(90deg, transparent 0 14%, #60a5fa 14% 20%, transparent 20% 38%, #60a5fa 38% 44%, transparent 44% 62%, #60a5fa 62% 68%, transparent 68%), linear-gradient(180deg, transparent 0 20%, #60a5fa 20% 26%, transparent 26% 52%, #60a5fa 52% 58%, transparent 58%); }
.chart-type-picker__preview--line-minimal .chart-type-picker__line { background: linear-gradient(135deg, transparent 0 24%, #38bdf8 25% 31%, transparent 32% 48%, #38bdf8 49% 55%, transparent 56%); }
.chart-type-picker__area { background: linear-gradient(135deg, transparent 0 22%, #2dd4bf 23% 29%, transparent 30% 45%, #2dd4bf 46% 52%, transparent 53%), linear-gradient(180deg, rgba(45,212,191,.36), rgba(45,212,191,.05)); clip-path: polygon(0 78%, 22% 34%, 42% 64%, 64% 22%, 100% 48%, 100% 100%, 0 100%); }
.chart-type-picker__preview--area-wire .chart-type-picker__area { background: linear-gradient(135deg, transparent 0 22%, #38bdf8 23% 29%, transparent 30% 45%, #38bdf8 46% 52%, transparent 53%); }
.chart-type-picker__preview--area-soft .chart-type-picker__area { background: linear-gradient(135deg, transparent 0 22%, #22c55e 23% 29%, transparent 30% 45%, #22c55e 46% 52%, transparent 53%), linear-gradient(180deg, rgba(34,197,94,.28), rgba(34,197,94,.05)); }
.chart-type-picker__pie { width: 28px; height: 28px; border-radius: 999px; background: conic-gradient(#3b82f6 0 38%, #93c5fd 38% 64%, #f59e0b 64% 100%); box-shadow: 0 0 0 4px white; }
.chart-type-picker__preview--pie-donut .chart-type-picker__pie, .chart-type-picker__preview--pie-rose .chart-type-picker__pie { box-shadow: inset 0 0 0 8px white, 0 0 0 4px white; }
.chart-type-picker__preview--pie-rose .chart-type-picker__pie { transform: scale(1.08); }
.chart-type-picker__radar { width: 30px; height: 30px; background: rgba(167,139,250,.22); clip-path: polygon(50% 0, 94% 28%, 80% 86%, 20% 86%, 6% 28%); outline: 2px solid #8b5cf6; }
.chart-type-picker__preview--radar-outline .chart-type-picker__radar { background: transparent; }
.chart-type-picker__preview--radar-compact .chart-type-picker__radar { width: 25px; height: 25px; background: rgba(34,197,94,.22); outline-color: #22c55e; }
.chart-type-picker__funnel { height: 7px; border-radius: 2px; background: #fb7185; }
.chart-type-picker__preview:has(.chart-type-picker__funnel) { align-content: center; gap: 4px; padding: 6px 13px; }
.chart-type-picker__funnel:nth-child(1) { width: 44px; }
.chart-type-picker__funnel:nth-child(2) { width: 34px; background: #f59e0b; }
.chart-type-picker__funnel:nth-child(3) { width: 24px; background: #60a5fa; }
.chart-type-picker__preview--funnel-pipeline .chart-type-picker__funnel { justify-self: stretch; width: auto; }
.chart-type-picker__preview--funnel-minimal .chart-type-picker__funnel { height: 5px; }
</style>
