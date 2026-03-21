<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <footer class="app-footer">
    <div class="container footer-inner">
      <p>{{ t('common.allRightsReserved', { year: new Date().getFullYear() }) }}</p>
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  margin-top: auto;
}

.footer-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 48px;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}
</style>
