import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { gqlRequest } from '@/lib/graphql'
import type { AuthPayload, User } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const currentUser = ref<User | null>(null)

  const isAuthenticated = computed(() => currentUser.value !== null)
  const isAdmin = computed(() => currentUser.value?.role === 'ADMIN')

  async function login(email: string, password: string) {
    const data = await gqlRequest<{ login: AuthPayload }>(
      `mutation Login($input: LoginInput!) {
        login(input: $input) {
          token
          expiresAtUtc
          user { id displayName email role createdAtUtc }
        }
      }`,
      { input: { email, password } },
    )
    localStorage.setItem('auth_token', data.login.token)
    localStorage.setItem('auth_expires', data.login.expiresAtUtc)
    currentUser.value = data.login.user
  }

  async function signup(email: string, password: string, displayName: string) {
    const data = await gqlRequest<{ registerUser: AuthPayload }>(
      `mutation Register($input: RegisterUserInput!) {
        registerUser(input: $input) {
          token
          expiresAtUtc
          user { id displayName email role createdAtUtc }
        }
      }`,
      { input: { email, displayName, password } },
    )
    localStorage.setItem('auth_token', data.registerUser.token)
    localStorage.setItem('auth_expires', data.registerUser.expiresAtUtc)
    currentUser.value = data.registerUser.user
  }

  async function logout() {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_expires')
    currentUser.value = null
  }

  async function checkAuth() {
    const token = localStorage.getItem('auth_token')
    const expires = localStorage.getItem('auth_expires')
    if (!token || !expires) return

    if (new Date(expires) <= new Date()) {
      await logout()
      return
    }

    try {
      const data = await gqlRequest<{ me: User }>(
        `query Me {
          me { id displayName email role createdAtUtc }
        }`,
      )
      currentUser.value = data.me
    } catch {
      await logout()
    }
  }

  return { currentUser, isAuthenticated, isAdmin, login, signup, logout, checkAuth }
})

