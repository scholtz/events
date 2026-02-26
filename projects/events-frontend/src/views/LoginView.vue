<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const isLogin = ref(true)
const email = ref('')
const password = ref('')
const name = ref('')
const loading = ref(false)
const error = ref('')

const handleSubmit = async () => {
  loading.value = true
  error.value = ''
  try {
    if (isLogin.value) {
      await auth.login(email.value, password.value)
    } else {
      await auth.signup(email.value, password.value, name.value)
    }
    router.push('/dashboard')
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'An error occurred'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-view">
    <div class="login-container">
      <div class="card login-card">
        <div class="login-brand">
          <span class="brand-icon">📅</span>
          <span class="brand-name">Events</span>
        </div>

        <h1>{{ isLogin ? 'Welcome back' : 'Create account' }}</h1>
        <p class="login-subtitle">
          {{ isLogin ? 'Sign in to manage your events.' : 'Join to discover and submit events.' }}
        </p>

        <form @submit.prevent="handleSubmit">
          <div v-if="!isLogin" class="form-group">
            <label class="form-label" for="name">Full Name</label>
            <input
              id="name"
              v-model="name"
              class="form-input"
              type="text"
              required
              placeholder="Your name"
              autocomplete="name"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="email">Email</label>
            <input
              id="email"
              v-model="email"
              class="form-input"
              type="email"
              required
              placeholder="your@email.com"
              autocomplete="email"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="password">Password</label>
            <input
              id="password"
              v-model="password"
              class="form-input"
              type="password"
              required
              placeholder="••••••••"
              autocomplete="current-password"
            />
          </div>

          <div v-if="error" class="error-message" role="alert">
            {{ error }}
          </div>

          <button type="submit" class="btn btn-primary submit-btn" :disabled="loading">
            {{ loading ? 'Please wait…' : isLogin ? 'Sign In' : 'Create Account' }}
          </button>
        </form>

        <p class="toggle-mode">
          {{ isLogin ? "Don't have an account?" : 'Already have an account?' }}
          <button type="button" class="link-btn" @click="isLogin = !isLogin">
            {{ isLogin ? 'Sign Up' : 'Sign In' }}
          </button>
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-view {
  min-height: calc(100vh - 64px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  background: radial-gradient(ellipse at 50% 0%, rgba(19, 127, 236, 0.08) 0%, transparent 70%);
}

.login-container {
  width: 100%;
  max-width: 420px;
}

.login-card {
  padding: 2.5rem 2rem;
}

.login-brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 2rem;
}

.brand-icon {
  font-size: 1.75rem;
}

.brand-name {
  font-size: 1.25rem;
  font-weight: 700;
  background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

h1 {
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 0.375rem;
}

.login-subtitle {
  color: var(--color-text-secondary);
  font-size: 0.9375rem;
  margin-bottom: 1.75rem;
}

.form-group {
  margin-bottom: 1rem;
}

.submit-btn {
  width: 100%;
  justify-content: center;
  margin-top: 0.5rem;
  padding: 0.75rem;
  font-size: 0.9375rem;
}

.error-message {
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.3);
  color: var(--color-error);
  border-radius: var(--radius-sm);
  padding: 0.625rem 0.875rem;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.toggle-mode {
  text-align: center;
  margin-top: 1.5rem;
  font-size: 0.9rem;
  color: var(--color-text-secondary);
}

.link-btn {
  background: none;
  border: none;
  color: var(--color-primary);
  cursor: pointer;
  font-size: inherit;
  font-weight: 500;
  text-decoration: none;
  padding: 0;
}

.link-btn:hover {
  text-decoration: underline;
}
</style>
