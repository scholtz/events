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
    <div class="container">
      <div class="card login-card">
        <h1>{{ isLogin ? 'Login' : 'Sign Up' }}</h1>

        <form @submit.prevent="handleSubmit">
          <div v-if="!isLogin" class="form-group">
            <label for="name">Name</label>
            <input id="name" v-model="name" type="text" required placeholder="Your name" />
          </div>

          <div class="form-group">
            <label for="email">Email</label>
            <input id="email" v-model="email" type="email" required placeholder="your@email.com" />
          </div>

          <div class="form-group">
            <label for="password">Password</label>
            <input
              id="password"
              v-model="password"
              type="password"
              required
              placeholder="Password"
            />
          </div>

          <div v-if="error" class="error-message">
            {{ error }}
          </div>

          <button type="submit" class="btn btn-primary" :disabled="loading">
            {{ loading ? 'Loading...' : isLogin ? 'Login' : 'Sign Up' }}
          </button>
        </form>

        <p class="toggle-mode">
          {{ isLogin ? "Don't have an account?" : 'Already have an account?' }}
          <button type="button" @click="isLogin = !isLogin" class="link-btn">
            {{ isLogin ? 'Sign Up' : 'Login' }}
          </button>
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-view {
  padding: 4rem 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}

.login-card {
  max-width: 400px;
  width: 100%;
}

.form-group {
  margin-bottom: 1rem;
}

label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 1rem;
}

input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.error-message {
  color: var(--color-error);
  margin-bottom: 1rem;
  font-size: 0.9rem;
}

.toggle-mode {
  text-align: center;
  margin-top: 1.5rem;
  font-size: 0.9rem;
}

.link-btn {
  background: none;
  border: none;
  color: var(--color-primary);
  cursor: pointer;
  text-decoration: underline;
}

.link-btn:hover {
  color: var(--color-primary-dark);
}
</style>
