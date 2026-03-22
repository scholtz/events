import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { gqlRequest } from '@/lib/graphql'

export interface EventReminderItem {
  id: string
  eventId: string
  offsetHours: number
  scheduledForUtc: string
  sentAtUtc: string | null
  createdAtUtc: string
}

const MY_EVENT_REMINDERS_QUERY = `
  query MyEventReminders {
    myEventReminders {
      id
      eventId
      offsetHours
      scheduledForUtc
      sentAtUtc
      createdAtUtc
    }
  }
`

const ENABLE_REMINDER_MUTATION = `
  mutation EnableEventReminder($input: EnableEventReminderInput!) {
    enableEventReminder(input: $input) {
      id
      eventId
      offsetHours
      scheduledForUtc
      sentAtUtc
      createdAtUtc
    }
  }
`

const DISABLE_REMINDER_MUTATION = `
  mutation DisableEventReminder($eventId: UUID!) {
    disableEventReminder(eventId: $eventId)
  }
`

export const useRemindersStore = defineStore('reminders', () => {
  const reminders = ref<EventReminderItem[]>([])
  const loading = ref(false)
  const error = ref('')

  /** Set of event IDs that have at least one active (unsent) reminder. */
  const remindedEventIds = computed(
    () =>
      new Set(
        reminders.value.filter((r) => r.sentAtUtc === null).map((r) => r.eventId),
      ),
  )

  function hasReminder(eventId: string): boolean {
    return remindedEventIds.value.has(eventId)
  }

  async function fetchReminders() {
    loading.value = true
    error.value = ''

    try {
      const data = await gqlRequest<{ myEventReminders: EventReminderItem[] }>(
        MY_EVENT_REMINDERS_QUERY,
      )
      reminders.value = data.myEventReminders
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unable to load reminders.'
    } finally {
      loading.value = false
    }
  }

  async function enableReminder(eventId: string, offsetHours = 24): Promise<EventReminderItem> {
    const data = await gqlRequest<{ enableEventReminder: EventReminderItem }>(
      ENABLE_REMINDER_MUTATION,
      { input: { eventId, offsetHours } },
    )
    const reminder = data.enableEventReminder

    // Update local state
    const index = reminders.value.findIndex(
      (r) => r.eventId === eventId && r.offsetHours === offsetHours,
    )
    if (index >= 0) {
      reminders.value[index] = reminder
    } else {
      reminders.value.push(reminder)
    }

    return reminder
  }

  async function disableReminder(eventId: string): Promise<void> {
    await gqlRequest<{ disableEventReminder: boolean }>(DISABLE_REMINDER_MUTATION, { eventId })

    // Remove from local state
    reminders.value = reminders.value.filter((r) => r.eventId !== eventId)
  }

  function clearReminders() {
    reminders.value = []
    error.value = ''
  }

  return {
    reminders,
    loading,
    error,
    remindedEventIds,
    hasReminder,
    fetchReminders,
    enableReminder,
    disableReminder,
    clearReminders,
  }
})
