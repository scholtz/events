import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { User } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const currentUser = ref<User | null>(null)

  const isAuthenticated = computed(() => currentUser.value !== null)
  const isAdmin = computed(() => currentUser.value?.role === 'admin')

  async function login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    if (data.user) {
      // Fetch user profile from users table
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .single()
      if (profile) {
        currentUser.value = {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          role: profile.role,
          createdAt: profile.created_at,
        }
      }
    }
  }

  async function signup(email: string, password: string, name: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })
    if (error) throw error
    if (data.user) {
      // Create user profile
      const { error: profileError } = await supabase.from('users').insert({
        id: data.user.id,
        name,
        email,
        role: 'user',
      })
      if (profileError) throw profileError
      currentUser.value = {
        id: data.user.id,
        name,
        email,
        role: 'user',
        createdAt: new Date().toISOString(),
      }
    }
  }

  async function logout() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    currentUser.value = null
  }

  async function checkAuth() {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
      if (profile) {
        currentUser.value = {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          role: profile.role,
          createdAt: profile.created_at,
        }
      }
    }
  }

  return { currentUser, isAuthenticated, isAdmin, login, signup, logout, checkAuth }
})
