import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Category } from '@/types'

const DEFAULT_CATEGORIES: Category[] = [
  { id: '1', name: 'Crypto', slug: 'crypto', description: 'Cryptocurrency & blockchain events', color: '#f59e0b' },
  { id: '2', name: 'AI', slug: 'ai', description: 'Artificial intelligence & ML events', color: '#8b5cf6' },
  { id: '3', name: 'Cooking', slug: 'cooking', description: 'Culinary events & workshops', color: '#ef4444' },
  { id: '4', name: 'Business', slug: 'business', description: 'Business & startup events', color: '#0ea5e9' },
  { id: '5', name: 'Music', slug: 'music', description: 'Concerts & music festivals', color: '#ec4899' },
  { id: '6', name: 'Tech', slug: 'tech', description: 'Technology conferences & meetups', color: '#22c55e' },
]

export const useCategoriesStore = defineStore('categories', () => {
  const categories = ref<Category[]>(DEFAULT_CATEGORIES)

  function getCategoryBySlug(slug: string): Category | undefined {
    return categories.value.find((c) => c.slug === slug)
  }

  function addCategory(category: Omit<Category, 'id'>) {
    categories.value.push({ ...category, id: String(Date.now()) })
  }

  function deleteCategory(id: string) {
    categories.value = categories.value.filter((c) => c.id !== id)
  }

  return { categories, getCategoryBySlug, addCategory, deleteCategory }
})
