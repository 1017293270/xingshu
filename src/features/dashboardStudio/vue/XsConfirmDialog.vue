<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";

const props = withDefaults(defineProps<{
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: "default" | "danger";
}>(), {
  confirmLabel: "确认",
  tone: "default"
});

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const panel = ref<HTMLElement | null>(null);
const confirmButton = ref<HTMLButtonElement | null>(null);
const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

function cancel() {
  emit("cancel");
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    cancel();
    return;
  }
  if (event.key !== "Tab" || !panel.value) return;

  const focusable = Array.from(
    panel.value.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex='-1'])")
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(() => void nextTick(() => confirmButton.value?.focus()));
onBeforeUnmount(() => previouslyFocused?.focus({ preventScroll: true }));
</script>

<template>
  <Teleport to="body">
    <div class="xs-confirm-backdrop" role="presentation" @click.self="cancel">
      <section
        ref="panel"
        class="xs-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="xs-confirm-dialog-title"
        aria-describedby="xs-confirm-dialog-message"
        @keydown="handleKeydown"
      >
        <h2 id="xs-confirm-dialog-title">{{ props.title }}</h2>
        <p id="xs-confirm-dialog-message">{{ props.message }}</p>
        <div class="xs-confirm-dialog__actions">
          <button type="button" @click="cancel">取消</button>
          <button
            ref="confirmButton"
            type="button"
            class="xs-confirm-dialog__confirm"
            :data-tone="props.tone"
            @click="emit('confirm')"
          >{{ props.confirmLabel }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.xs-confirm-backdrop {
  position: fixed;
  z-index: 2200;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(15, 36, 68, .28);
  backdrop-filter: blur(3px);
}

.xs-confirm-dialog {
  width: min(420px, 100%);
  padding: 24px;
  border: 1px solid #d9e5f5;
  border-radius: 14px;
  color: #102a4c;
  background: #fff;
  box-shadow: 0 24px 64px rgba(15, 52, 96, .2);
}

.xs-confirm-dialog h2 {
  margin: 0;
  font-size: 20px;
}

.xs-confirm-dialog p {
  margin: 12px 0 0;
  color: #526985;
  line-height: 1.7;
}

.xs-confirm-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}

.xs-confirm-dialog__actions button {
  min-height: 40px;
  padding: 0 18px;
  border: 1px solid #cddbef;
  border-radius: 10px;
  color: #294b74;
  background: #fff;
  font-weight: 700;
  cursor: pointer;
}

.xs-confirm-dialog__actions button:focus-visible {
  outline: 3px solid rgba(20, 104, 232, .25);
  outline-offset: 2px;
}

.xs-confirm-dialog__confirm {
  border-color: #1468e8 !important;
  color: #fff !important;
  background: #1468e8 !important;
}

.xs-confirm-dialog__confirm[data-tone="danger"] {
  border-color: #c9343f !important;
  background: #c9343f !important;
}
</style>
