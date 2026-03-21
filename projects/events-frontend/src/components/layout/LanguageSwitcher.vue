<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import {
  SUPPORTED_LOCALES,
  persistLocale,
  type SupportedLocale,
} from '@/i18n'

const { locale, t } = useI18n()

function setLocale(newLocale: SupportedLocale) {
  locale.value = newLocale
  persistLocale(newLocale)
  document.documentElement.lang = newLocale
}
</script>

<template>
  <div class="language-switcher">
    <label for="language-select" class="sr-only">{{ t('languageSwitcher.label') }}</label>
    <select
      id="language-select"
      :value="locale"
      class="language-select"
      :aria-label="t('languageSwitcher.label')"
      @change="setLocale(($event.target as HTMLSelectElement).value as SupportedLocale)"
    >
      <option v-for="loc in SUPPORTED_LOCALES" :key="loc" :value="loc">
        {{ t(`languages.${loc}`) }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.language-switcher {
  display: flex;
  align-items: center;
}

.language-select {
  background: var(--color-surface-raised);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 0.35rem 0.5rem;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.15s;
  appearance: auto;
}

.language-select:hover {
  border-color: var(--color-primary);
}

.language-select:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
</style>
