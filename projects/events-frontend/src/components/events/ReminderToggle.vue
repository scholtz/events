<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNotifications } from '@/composables/useNotifications'
import { useRemindersStore } from '@/stores/reminders'

const props = defineProps<{
  eventId: string
  /** ISO timestamp of the event start, used to determine if the event is in the future */
  startsAtUtc: string
  /** Whether the event is currently saved/favorited (reminder only available after saving) */
  isSaved: boolean
}>()

const { t } = useI18n()
const notifications = useNotifications()
const remindersStore = useRemindersStore()

const toggling = ref(false)
const localError = ref('')
const justEnabled = ref(false)

const isUpcoming = computed(() => new Date(props.startsAtUtc) > new Date())

const hasReminder = computed(() => remindersStore.hasReminder(props.eventId))

async function handleToggle() {
  localError.value = ''
  justEnabled.value = false

  if (!props.isSaved) {
    localError.value = t('reminders.requiresSave')
    return
  }

  if (!isUpcoming.value) {
    localError.value = t('reminders.pastEventNoReminder')
    return
  }

  toggling.value = true

  try {
    if (hasReminder.value) {
      await remindersStore.disableReminder(props.eventId)
    } else {
      // Ensure push is subscribed first
      if (!notifications.isSubscribed.value) {
        const success = await notifications.subscribe()
        if (!success) {
          localError.value =
            notifications.error.value ||
            (notifications.permissionState.value === 'denied'
              ? t('reminders.notificationsBlocked')
              : t('reminders.enableNotificationsDescription'))
          return
        }
      }
      await remindersStore.enableReminder(props.eventId)
      justEnabled.value = true
      setTimeout(() => {
        justEnabled.value = false
      }, 3000)
    }
  } catch (err) {
    localError.value =
      err instanceof Error ? err.message : t('reminders.loading')
  } finally {
    toggling.value = false
  }
}
</script>

<template>
  <div class="reminder-toggle">
    <!-- Unsupported browser -->
    <p v-if="!notifications.isSupported.value" class="reminder-unsupported">
      🔔 {{ t('reminders.notificationsUnsupported') }}
    </p>

    <!-- Past event -->
    <p v-else-if="!isUpcoming" class="reminder-past">
      🔔 {{ t('reminders.pastEventNoReminder') }}
    </p>

    <!-- Normal toggle button -->
    <template v-else>
      <button
        class="btn btn-sm reminder-btn"
        :class="{
          'reminder-btn--active': hasReminder,
          'btn-outline': !hasReminder,
          'btn-ghost': hasReminder,
        }"
        :aria-label="hasReminder ? t('reminders.disableReminder') : t('reminders.enableReminder')"
        :aria-pressed="hasReminder"
        :disabled="toggling || notifications.isLoading.value"
        @click="handleToggle"
      >
        <span aria-hidden="true">{{ hasReminder ? '🔔' : '🔕' }}</span>
        {{ toggling ? t('reminders.loading') : (hasReminder ? t('reminders.disableReminder') : t('reminders.enableReminder')) }}
      </button>

      <!-- Permission blocked explanation -->
      <p
        v-if="notifications.permissionState.value === 'denied'"
        class="reminder-hint reminder-hint--blocked"
        role="alert"
      >
        {{ t('reminders.notificationsBlocked') }}
      </p>

      <!-- Just enabled confirmation -->
      <p v-if="justEnabled" class="reminder-hint reminder-hint--success" aria-live="polite">
        ✓ {{ t('reminders.reminderEnabledDescription') }}
      </p>

      <!-- Error -->
      <p v-if="localError" class="reminder-hint reminder-hint--error" role="alert">
        {{ localError }}
      </p>
    </template>
  </div>
</template>

<style scoped>
.reminder-toggle {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.reminder-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.875rem;
}

.reminder-btn--active {
  color: var(--color-primary);
}

.reminder-unsupported,
.reminder-past {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.reminder-hint {
  font-size: 0.8125rem;
  max-width: 360px;
}

.reminder-hint--success {
  color: var(--color-success, #16a34a);
}

.reminder-hint--error {
  color: var(--color-error, #dc2626);
}

.reminder-hint--blocked {
  color: var(--color-warning, #d97706);
}
</style>
