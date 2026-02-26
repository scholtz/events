import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { User } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const currentUser = ref<User | null>(null)

  const isAuthenticated = computed(() => currentUser.value !== null)
  const isAdmin = computed(() => currentUser.value?.role === 'admin')

  function loginAsUser() {
    currentUser.value = {
      id: '1',
      name: 'Demo User',
      email: 'user@example.com',
      role: 'user',
      createdAt: '2026-01-01',
    }
  }

  function loginAsAdmin() {
    currentUser.value = {
      id: '0',
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      createdAt: '2026-01-01',
    }
  }

  function logout() {
    currentUser.value = null
  }

  return { currentUser, isAuthenticated, isAdmin, loginAsUser, loginAsAdmin, logout }
})
