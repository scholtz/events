<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useCommunitiesStore } from '@/stores/communities'
import { useAuthStore } from '@/stores/auth'
import EventCard from '@/components/events/EventCard.vue'
import type { CommunityGroupDetail, CommunityMembership, CommunityMemberRole } from '@/types'

const { t } = useI18n()
const route = useRoute()
const communitiesStore = useCommunitiesStore()
const auth = useAuthStore()

const detail = ref<CommunityGroupDetail | null>(null)
const loading = ref(true)
const loadError = ref<string | null>(null)

const actionLoading = ref(false)
const actionError = ref<string | null>(null)
const actionSuccess = ref<string | null>(null)

// Members management
const pendingMembers = ref<CommunityMembership[]>([])
const activeMembers = ref<CommunityMembership[]>([])
const membersLoading = ref(false)

const slug = computed(() => route.params.slug as string)

const group = computed(() => detail.value?.group ?? null)
const myMembership = computed(() => detail.value?.myMembership ?? null)

const isAdmin = computed(
  () =>
    auth.isAdmin ||
    myMembership.value?.role === 'ADMIN',
)

const isMember = computed(() => myMembership.value?.status === 'ACTIVE')
const isPending = computed(() => myMembership.value?.status === 'PENDING')
const isRejected = computed(() => myMembership.value?.status === 'REJECTED')

async function load() {
  loading.value = true
  loadError.value = null
  try {
    detail.value = await communitiesStore.fetchGroupBySlug(slug.value)
    if (detail.value && isAdmin.value) {
      await loadMembers()
    }
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : t('community.errorLoad')
  } finally {
    loading.value = false
  }
}

async function loadMembers() {
  if (!detail.value) return
  membersLoading.value = true
  try {
    // Member lists will be loaded via dedicated admin queries in a future extension.
    // For now the admin panel shows what's available from the detail query.
    pendingMembers.value = []
    activeMembers.value = []
  } finally {
    membersLoading.value = false
  }
}

onMounted(load)

async function handleJoin() {
  if (!detail.value) return
  actionLoading.value = true
  actionError.value = null
  actionSuccess.value = null
  try {
    const membership = await communitiesStore.joinGroup(detail.value.group.id)
    detail.value = { ...detail.value, myMembership: membership }
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : t('community.errorJoin')
  } finally {
    actionLoading.value = false
  }
}

async function handleRequest() {
  if (!detail.value) return
  actionLoading.value = true
  actionError.value = null
  actionSuccess.value = null
  try {
    const membership = await communitiesStore.requestMembership(detail.value.group.id)
    detail.value = { ...detail.value, myMembership: membership }
    actionSuccess.value = t('community.requestSent')
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : t('community.errorRequest')
  } finally {
    actionLoading.value = false
  }
}

async function handleReviewRequest(membershipId: string, approve: boolean) {
  try {
    const updated = await communitiesStore.reviewMembership(membershipId, approve)
    pendingMembers.value = pendingMembers.value.filter((m) => m.id !== membershipId)
    if (approve) {
      activeMembers.value = [updated, ...activeMembers.value]
      if (detail.value) {
        detail.value = { ...detail.value, memberCount: detail.value.memberCount + 1 }
      }
    }
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : t('community.errorAdmin')
  }
}

async function handleAssignRole(membershipId: string, role: CommunityMemberRole) {
  try {
    const updated = await communitiesStore.assignRole(membershipId, role)
    activeMembers.value = activeMembers.value.map((m) => (m.id === membershipId ? updated : m))
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : t('community.errorAdmin')
  }
}

async function handleRevoke(membershipId: string) {
  try {
    await communitiesStore.revokeMembership(membershipId)
    activeMembers.value = activeMembers.value.filter((m) => m.id !== membershipId)
    if (detail.value) {
      detail.value = { ...detail.value, memberCount: Math.max(0, detail.value.memberCount - 1) }
    }
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : t('community.errorAdmin')
  }
}

function roleLabel(role: CommunityMemberRole): string {
  const map: Record<CommunityMemberRole, string> = {
    ADMIN: t('community.adminRole'),
    EVENT_MANAGER: t('community.eventManagerRole'),
    MEMBER: t('community.memberRole'),
  }
  return map[role]
}

function memberCountText(count: number): string {
  return count === 1 ? t('community.oneMember') : t('community.members', { count })
}
</script>

<template>
  <div class="community-detail-page">
    <div class="container">
      <!-- Back link -->
      <RouterLink to="/communities" class="back-link">
        {{ t('community.backToCommunities') }}
      </RouterLink>

      <!-- Loading -->
      <div v-if="loading" class="loading-state">{{ t('common.loading') }}</div>

      <!-- Error -->
      <div v-else-if="loadError" class="error-state">
        <h1 class="error-heading">{{ t('community.errorLoad') }}</h1>
        <p class="error-message">{{ loadError }}</p>
        <button class="btn btn-primary" @click="load">{{ t('common.tryAgain') }}</button>
      </div>

      <!-- Not found -->
      <div v-else-if="!detail" class="not-found-state">
        <h1 class="not-found-heading">{{ t('community.notFound') }}</h1>
        <p class="not-found-desc">{{ t('community.notFoundDescription') }}</p>
        <RouterLink to="/communities" class="btn btn-primary">
          {{ t('community.backToCommunities') }}
        </RouterLink>
      </div>

      <!-- Main content -->
      <template v-else>
        <div class="group-header">
          <div class="group-meta">
            <h1 class="group-name">{{ group!.name }}</h1>
            <span class="visibility-badge" :class="group!.visibility.toLowerCase()">
              {{
                group!.visibility === 'PUBLIC' ? t('community.public') : t('community.private')
              }}
            </span>
          </div>
          <p class="member-count">{{ memberCountText(detail.memberCount) }}</p>
          <p v-if="group!.summary" class="group-summary">{{ group!.summary }}</p>
        </div>

        <!-- Membership actions -->
        <div class="membership-section">
          <div v-if="actionError" class="error-banner">{{ actionError }}</div>
          <div v-if="actionSuccess" class="success-banner">{{ actionSuccess }}</div>

          <template v-if="!auth.isAuthenticated">
            <p class="sign-in-prompt">
              {{ t('community.signInToJoin') }}
              <RouterLink to="/login" class="link">{{ t('community.signIn') }}</RouterLink>
            </p>
          </template>

          <template v-else-if="isMember">
            <span class="membership-status active">{{ t('community.joined') }}</span>
          </template>

          <template v-else-if="isPending">
            <span class="membership-status pending">{{ t('community.pendingApproval') }}</span>
          </template>

          <template v-else-if="isRejected">
            <span class="membership-status rejected">{{ t('community.rejected') }}</span>
            <button
              v-if="group!.visibility === 'PRIVATE'"
              class="btn btn-secondary"
              :disabled="actionLoading"
              @click="handleRequest"
            >
              {{ t('community.requestAccess') }}
            </button>
          </template>

          <template v-else>
            <button
              v-if="group!.visibility === 'PUBLIC'"
              class="btn btn-primary"
              :disabled="actionLoading"
              @click="handleJoin"
            >
              {{ actionLoading ? t('common.loading') : t('community.joinGroup') }}
            </button>
            <button
              v-else
              class="btn btn-secondary"
              :disabled="actionLoading"
              @click="handleRequest"
            >
              {{ actionLoading ? t('common.loading') : t('community.requestAccess') }}
            </button>
          </template>
        </div>

        <!-- Private group restriction for non-members -->
        <div v-if="group!.visibility === 'PRIVATE' && !isMember && !isAdmin" class="private-notice">
          <h2>{{ t('community.privateGroupHeading') }}</h2>
          <p>{{ t('community.privateGroupDescription') }}</p>
        </div>

        <!-- Events section (shown for public or members) -->
        <template v-else>
          <section class="events-section">
            <h2 class="section-heading">{{ t('community.eventsHeading') }}</h2>
            <div v-if="detail.events.length === 0" class="empty-events">
              <p class="empty-title">{{ t('community.noEvents') }}</p>
              <p class="empty-desc">{{ t('community.noEventsDescription') }}</p>
            </div>
            <div v-else class="events-grid">
              <EventCard
                v-for="event in detail.events"
                :key="event.id"
                :event="event"
              />
            </div>
          </section>

          <!-- Admin panel -->
          <template v-if="isAdmin">
            <!-- Pending requests -->
            <section v-if="pendingMembers.length > 0" class="admin-section">
              <h2 class="section-heading">{{ t('community.pendingRequestsHeading') }}</h2>
              <div class="members-list">
                <div
                  v-for="member in pendingMembers"
                  :key="member.id"
                  class="member-row"
                >
                  <span class="member-name">{{ member.userId }}</span>
                  <div class="member-actions">
                    <button
                      class="btn btn-sm btn-primary"
                      @click="handleReviewRequest(member.id, true)"
                    >
                      {{ t('community.approve') }}
                    </button>
                    <button
                      class="btn btn-sm btn-danger"
                      @click="handleReviewRequest(member.id, false)"
                    >
                      {{ t('community.reject') }}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <!-- Active members -->
            <section v-if="activeMembers.length > 0" class="admin-section">
              <h2 class="section-heading">{{ t('community.manageMembersHeading') }}</h2>
              <div class="members-list">
                <div
                  v-for="member in activeMembers"
                  :key="member.id"
                  class="member-row"
                >
                  <span class="member-name">{{ member.userId }}</span>
                  <span class="member-role-badge">{{ roleLabel(member.role) }}</span>
                  <div class="member-actions">
                    <select
                      class="role-select"
                      :value="member.role"
                      @change="
                        handleAssignRole(
                          member.id,
                          ($event.target as HTMLSelectElement).value as CommunityMemberRole,
                        )
                      "
                    >
                      <option value="ADMIN">{{ t('community.adminRole') }}</option>
                      <option value="EVENT_MANAGER">{{ t('community.eventManagerRole') }}</option>
                      <option value="MEMBER">{{ t('community.memberRole') }}</option>
                    </select>
                    <button
                      class="btn btn-sm btn-danger"
                      @click="handleRevoke(member.id)"
                    >
                      {{ t('community.removeMember') }}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </template>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.community-detail-page {
  padding: 2rem 0;
}

.container {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 1rem;
}

.back-link {
  display: inline-block;
  color: var(--color-text-secondary);
  text-decoration: none;
  font-size: 0.875rem;
  margin-bottom: 1.5rem;
}

.back-link:hover {
  color: var(--color-text);
}

.loading-state,
.error-state,
.not-found-state {
  text-align: center;
  padding: 3rem;
}

.error-heading,
.not-found-heading {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.error-message,
.not-found-desc {
  color: var(--color-text-secondary);
  margin-bottom: 1.5rem;
}

.group-header {
  margin-bottom: 1.5rem;
}

.group-meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 0.25rem;
}

.group-name {
  font-size: 2rem;
  font-weight: 700;
  margin: 0;
}

.visibility-badge {
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
}

.visibility-badge.public {
  background: var(--color-success-bg, #e8f5e9);
  color: var(--color-success, #27ae60);
}

.visibility-badge.private {
  background: var(--color-warning-bg, #fff8e1);
  color: var(--color-warning, #f39c12);
}

.member-count {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin: 0 0 0.5rem;
}

.group-summary {
  font-size: 1rem;
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.6;
}

.membership-section {
  margin-bottom: 2rem;
}

.error-banner {
  background: var(--color-error-bg, #fff0f0);
  color: var(--color-error, #c0392b);
  border: 1px solid var(--color-error-border, #f5c6cb);
  border-radius: var(--radius-sm);
  padding: 0.625rem 0.875rem;
  margin-bottom: 0.75rem;
  font-size: 0.875rem;
}

.success-banner {
  background: var(--color-success-bg, #e8f5e9);
  color: var(--color-success, #27ae60);
  border: 1px solid var(--color-success-border, #c8e6c9);
  border-radius: var(--radius-sm);
  padding: 0.625rem 0.875rem;
  margin-bottom: 0.75rem;
  font-size: 0.875rem;
}

.membership-status {
  display: inline-block;
  font-size: 0.875rem;
  font-weight: 500;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
}

.membership-status.active {
  background: var(--color-success-bg, #e8f5e9);
  color: var(--color-success, #27ae60);
}

.membership-status.pending {
  background: var(--color-warning-bg, #fff8e1);
  color: var(--color-warning, #f39c12);
}

.membership-status.rejected {
  background: var(--color-error-bg, #fff0f0);
  color: var(--color-error, #c0392b);
}

.sign-in-prompt {
  color: var(--color-text-secondary);
  font-size: 0.9375rem;
}

.link {
  color: var(--color-primary);
  text-decoration: none;
}

.link:hover {
  text-decoration: underline;
}

.private-notice {
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 2rem;
  text-align: center;
}

.private-notice h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.private-notice p {
  color: var(--color-text-secondary);
  margin: 0;
}

.events-section,
.admin-section {
  margin-bottom: 2.5rem;
}

.section-heading {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--color-border);
}

.empty-events {
  text-align: center;
  padding: 2rem;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.empty-title {
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 0.25rem;
}

.empty-desc {
  color: var(--color-text-secondary);
  font-size: 0.875rem;
}

.events-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.members-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.member-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.member-name {
  flex: 1;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-role-badge {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  white-space: nowrap;
}

.member-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.role-select {
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.8125rem;
}

.btn-sm {
  padding: 0.25rem 0.625rem;
  font-size: 0.8125rem;
}

.btn-danger {
  background: var(--color-error, #c0392b);
  color: white;
  border: none;
}

.btn-danger:hover {
  background: #a93226;
}

.btn-secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.btn-secondary:hover {
  background: var(--color-surface-raised);
}

@media (max-width: 640px) {
  .events-grid {
    grid-template-columns: 1fr;
  }

  .member-row {
    flex-wrap: wrap;
  }
}
</style>
