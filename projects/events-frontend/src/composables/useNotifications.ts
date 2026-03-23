/**
 * useNotifications – composable for browser push notification permission
 * and subscription management.
 *
 * Responsibilities:
 *  - Detect whether push notifications are supported in the current environment.
 *  - Track the current Notification.permission state.
 *  - Request notification permission only after explicit user intent.
 *  - Subscribe to / unsubscribe from the server push endpoint.
 *  - Fetch the VAPID public key from the backend.
 */

import { ref, readonly, onMounted } from 'vue'
import { gqlRequest } from '@/lib/graphql'

export type NotificationPermission = 'default' | 'granted' | 'denied' | 'unsupported'

/** GraphQL field name for the VAPID public key query */
const VAPID_KEY_QUERY = `
  query VapidPublicKey {
    vapidPublicKey
  }
`

const REGISTER_SUBSCRIPTION_MUTATION = `
  mutation RegisterPushSubscription($input: RegisterPushSubscriptionInput!) {
    registerPushSubscription(input: $input) {
      isSubscribed
      endpoint
      createdAtUtc
    }
  }
`

const REMOVE_SUBSCRIPTION_MUTATION = `
  mutation RemovePushSubscription {
    removePushSubscription
  }
`

const MY_SUBSCRIPTION_QUERY = `
  query MyPushSubscription {
    myPushSubscription {
      isSubscribed
      endpoint
      createdAtUtc
    }
  }
`

/**
 * Converts a base64url string to a Uint8Array for use with
 * PushManager.subscribe({ applicationServerKey }).
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

export function useNotifications() {
  const isSupported = ref(false)
  const permissionState = ref<NotificationPermission>('default')
  const isSubscribed = ref(false)
  const isLoading = ref(false)
  const error = ref('')

  function updatePermissionState() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      permissionState.value = 'unsupported'
      return
    }
    permissionState.value = Notification.permission as NotificationPermission
  }

  onMounted(async () => {
    if (
      typeof window === 'undefined' ||
      !('Notification' in window) ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) {
      isSupported.value = false
      permissionState.value = 'unsupported'
      return
    }

    isSupported.value = true
    updatePermissionState()

    // Check if there is already a server-side subscription record
    try {
      const data = await gqlRequest<{
        myPushSubscription: { isSubscribed: boolean } | null
      }>(MY_SUBSCRIPTION_QUERY)
      isSubscribed.value = data.myPushSubscription?.isSubscribed ?? false
    } catch {
      // Not authenticated or network error — silently ignore
    }
  })

  /**
   * Request notification permission from the user.
   * Returns the resulting permission state.
   * Call this only after showing an explanatory in-product UI.
   */
  async function requestPermission(): Promise<NotificationPermission> {
    if (!isSupported.value) return 'unsupported'

    try {
      const result = await Notification.requestPermission()
      permissionState.value = result as NotificationPermission
      return permissionState.value
    } catch {
      return permissionState.value
    }
  }

  /**
   * Subscribe to push notifications.
   * Requests permission if not already granted, then registers with the server.
   */
  async function subscribe(): Promise<boolean> {
    if (!isSupported.value) return false

    isLoading.value = true
    error.value = ''

    try {
      // Ensure permission is granted
      if (permissionState.value !== 'granted') {
        const result = await requestPermission()
        if (result !== 'granted') {
          error.value = result === 'denied'
            ? 'Notifications are blocked. Please enable them in your browser settings.'
            : 'Notification permission is required to enable reminders.'
          return false
        }
      }

      // Fetch VAPID public key from the server
      const keyData = await gqlRequest<{ vapidPublicKey: string }>(VAPID_KEY_QUERY)
      const vapidKey = keyData.vapidPublicKey

      if (!vapidKey) {
        // Server has no VAPID key configured — store subscription anyway for future use
        error.value = 'Push notifications are not yet configured on this server.'
        return false
      }

      // Get the service worker registration
      const registration = await navigator.serviceWorker.ready

      // Subscribe via the PushManager
      const pushSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
      })

      const json = pushSubscription.toJSON()
      const p256dh = btoa(
        String.fromCharCode(...new Uint8Array(pushSubscription.getKey('p256dh')!)),
      )
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '')
      const auth = btoa(
        String.fromCharCode(...new Uint8Array(pushSubscription.getKey('auth')!)),
      )
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '')

      // Register with the backend
      await gqlRequest(REGISTER_SUBSCRIPTION_MUTATION, {
        input: {
          endpoint: json.endpoint,
          p256dh,
          auth,
        },
      })

      isSubscribed.value = true
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to enable push notifications.'
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Unsubscribe from push notifications and remove the subscription from the server.
   */
  async function unsubscribe(): Promise<boolean> {
    isLoading.value = true
    error.value = ''

    try {
      // Remove browser-side subscription
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready
        const existing = await registration.pushManager.getSubscription()
        if (existing) {
          await existing.unsubscribe()
        }
      }

      // Remove from server
      await gqlRequest(REMOVE_SUBSCRIPTION_MUTATION)
      isSubscribed.value = false
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to disable push notifications.'
      return false
    } finally {
      isLoading.value = false
    }
  }

  return {
    /** Whether push notifications are supported in this browser/environment. */
    isSupported: readonly(isSupported),
    /** Current Notification.permission state. */
    permissionState: readonly(permissionState),
    /** Whether the user has an active push subscription registered with the server. */
    isSubscribed: readonly(isSubscribed),
    /** True while a subscribe/unsubscribe operation is in progress. */
    isLoading: readonly(isLoading),
    /** Error message from the last failed operation, if any. */
    error: readonly(error),
    requestPermission,
    subscribe,
    unsubscribe,
  }
}
