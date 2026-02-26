import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { Category } from '@/types'

export const useCategoriesStore = defineStore('categories', () => {
  const categories = ref<Category[]>([])
  const loading = ref(false)

  async function fetchCategories() {
    loading.value = true
    const { data, error } = await supabase.from('categories').select('*').order('name')
    if (error) throw error
    categories.value = data || []
    loading.value = false
  }

  function getCategoryBySlug(slug: string): Category | undefined {
    return categories.value.find((c) => c.slug === slug)
  }

  async function addCategory(category: Omit<Category, 'id'>) {
    const { data, error } = await supabase.from('categories').insert(category).select().single()
    if (error) throw error
    categories.value.push(data)
  }

  async function deleteCategory(id: string) {
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) throw error
    categories.value = categories.value.filter((c) => c.id !== id)
  }

  return { categories, loading, fetchCategories, getCategoryBySlug, addCategory, deleteCategory }
})
