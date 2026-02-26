<template>
  <footer class="app-footer">
    <div class="container footer-inner">
      <p>&copy; {{ new Date().getFullYear() }} Events Platform. All rights reserved.</p>
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
