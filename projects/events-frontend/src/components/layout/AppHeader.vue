<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
</script>

<template>
  <header class="app-header">
    <div class="container header-inner">
      <RouterLink to="/" class="logo">
        <span class="logo-icon">📅</span>
        <span class="logo-text">Events</span>
      </RouterLink>
      <nav class="nav-links">
        <RouterLink to="/">Browse</RouterLink>
        <RouterLink to="/submit">Submit Event</RouterLink>
        <RouterLink v-if="auth.isAuthenticated" to="/dashboard">Dashboard</RouterLink>
        <RouterLink v-if="auth.isAdmin" to="/admin">Admin</RouterLink>
      </nav>
      <div class="header-actions">
        <template v-if="auth.isAuthenticated">
          <span class="user-name">{{ auth.currentUser?.name }}</span>
          <button class="btn btn-secondary" @click="auth.logout()">Logout</button>
        </template>
        <template v-else>
          <button class="btn btn-secondary" @click="auth.loginAsUser()">Login</button>
          <button class="btn btn-primary" @click="auth.loginAsAdmin()">Admin Login</button>
        </template>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-inner {
  display: flex;
  align-items: center;
  gap: 2rem;
  height: 60px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
  font-size: 1.25rem;
  color: var(--color-text);
  text-decoration: none;
}

.logo-icon {
  font-size: 1.5rem;
}

.nav-links {
  display: flex;
  gap: 1.5rem;
  flex: 1;
}

.nav-links a {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  text-decoration: none;
  transition: color 0.15s;
}

.nav-links a:hover,
.nav-links a.router-link-active {
  color: var(--color-primary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.user-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}

@media (max-width: 640px) {
  .header-inner {
    gap: 1rem;
  }

  .nav-links {
    gap: 0.75rem;
  }

  .logo-text {
    display: none;
  }
}
</style>
