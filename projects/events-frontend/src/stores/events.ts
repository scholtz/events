import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { EventItem, EventFilters } from '@/types'

export const useEventsStore = defineStore('events', () => {
  const events = ref<EventItem[]>([])
  const loading = ref(false)

  const filters = ref<EventFilters>({
    search: '',
    category: '',
    dateFrom: '',
    dateTo: '',
    location: '',
  })

  async function fetchEvents() {
    loading.value = true
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    events.value = data || []
    loading.value = false
  }

  const filteredEvents = computed(() => {
    return events.value.filter((event) => {
      if (event.status !== 'approved') return false

      if (
        filters.value.search &&
        !event.title.toLowerCase().includes(filters.value.search.toLowerCase()) &&
        !event.description.toLowerCase().includes(filters.value.search.toLowerCase())
      ) {
        return false
      }

      if (filters.value.category && event.category !== filters.value.category) {
        return false
      }

      if (filters.value.dateFrom && event.date < filters.value.dateFrom) {
        return false
      }

      if (filters.value.dateTo && event.date > filters.value.dateTo) {
        return false
      }

      if (
        filters.value.location &&
        !event.location.name.toLowerCase().includes(filters.value.location.toLowerCase()) &&
        !event.location.address.toLowerCase().includes(filters.value.location.toLowerCase())
      ) {
        return false
      }

      return true
    })
  })

  const allEvents = computed(() => events.value)

  const pendingEvents = computed(() => events.value.filter((e) => e.status === 'pending'))

  function getEventById(id: string): EventItem | undefined {
    return events.value.find((e) => e.id === id)
  }

  async function addEvent(event: Omit<EventItem, 'id' | 'createdAt' | 'status'>) {
    const { data, error } = await supabase
      .from('events')
      .insert({
        ...event,
        status: 'pending',
      })
      .select()
      .single()
    if (error) throw error
    events.value.push(data)
    return data
  }

  async function updateEventStatus(id: string, status: EventItem['status']) {
    const { error } = await supabase.from('events').update({ status }).eq('id', id)
    if (error) throw error
    const event = events.value.find((e) => e.id === id)
    if (event) {
      event.status = status
    }
  }

  async function deleteEvent(id: string) {
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) throw error
    events.value = events.value.filter((e) => e.id !== id)
  }

  function setFilters(newFilters: Partial<EventFilters>) {
    filters.value = { ...filters.value, ...newFilters }
  }

  function clearFilters() {
    filters.value = { search: '', category: '', dateFrom: '', dateTo: '', location: '' }
  }

  return {
    events,
    loading,
    filters,
    filteredEvents,
    allEvents,
    pendingEvents,
    fetchEvents,
    getEventById,
    addEvent,
    updateEventStatus,
    deleteEvent,
    setFilters,
    clearFilters,
  }
})
