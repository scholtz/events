<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useCommunitiesStore, generateCommunitySlug } from '@/stores/communities'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const communitiesStore = useCommunitiesStore()
const auth = useAuthStore()

const showCreateForm = ref(false)
const createForm = ref({
  name: '',
  slug: '',
  summary: '',
  description: '',
  visibility: 'PUBLIC' as 'PUBLIC' | 'PRIVATE',
})
const creating = ref(false)
const createError = ref<string | null>(null)

onMounted(() => {
  communitiesStore.fetchGroups()
})

function autoSlug() {
  if (!createForm.value.slug) {
    createForm.value.slug = generateCommunitySlug(createForm.value.name)
  }
}

async function submitCreate() {
  createError.value = null
  creating.value = true
  try {
    await communitiesStore.createGroup({
      name: createForm.value.name,
      slug: createForm.value.slug,
      summary: createForm.value.summary || undefined,
      description: createForm.value.description || undefined,
      visibility: createForm.value.visibility,
    })
    showCreateForm.value = false
    createForm.value = { name: '', slug: '', summary: '', description: '', visibility: 'PUBLIC' }
    await communitiesStore.fetchGroups()
  } catch (err) {
    createError.value = err instanceof Error ? err.message : t('community.errorAdmin')
  } finally {
    creating.value = false
  }
}

const hasGroups = computed(() => communitiesStore.groups.length > 0)

// SEO: set page title
const pageTitle = computed(() => t('community.pageTitle'))
watch(
  pageTitle,
  (title) => {
    if (typeof document !== 'undefined') document.title = title
  },
  { immediate: true },
)
</script>

<template>
  <div class="communities-page">
    <div class="container">
      <div class="page-header">
        <div>
          <h1 class="page-title">{{ t('community.heading') }}</h1>
          <p class="page-subtitle">{{ t('community.subheading') }}</p>
        </div>
        <button
          v-if="auth.isAuthenticated"
          class="btn btn-primary"
          @click="showCreateForm = !showCreateForm"
        >
          {{ t('community.createGroup') }}
        </button>
      </div>

      <!-- Create form -->
      <div v-if="showCreateForm" class="create-form card">
        <h2 class="form-heading">{{ t('community.createHeading') }}</h2>

        <div v-if="createError" class="error-banner">{{ createError }}</div>

        <form @submit.prevent="submitCreate" class="form-fields">
          <div class="form-group">
            <label for="cg-name">{{ t('community.nameLabel') }}</label>
            <input
              id="cg-name"
              v-model="createForm.name"
              @blur="autoSlug"
              type="text"
              required
              :placeholder="t('community.namePlaceholder')"
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label for="cg-slug">{{ t('community.slugLabel') }}</label>
            <input
              id="cg-slug"
              v-model="createForm.slug"
              type="text"
              required
              :placeholder="t('community.slugPlaceholder')"
              class="form-input"
            />
            <span class="form-hint">{{ t('community.slugHint') }}</span>
          </div>

          <div class="form-group">
            <label for="cg-summary">{{ t('community.summaryLabel') }}</label>
            <input
              id="cg-summary"
              v-model="createForm.summary"
              type="text"
              :placeholder="t('community.summaryPlaceholder')"
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label for="cg-visibility">{{ t('community.visibilityLabel') }}</label>
            <select id="cg-visibility" v-model="createForm.visibility" class="form-select">
              <option value="PUBLIC">{{ t('community.public') }}</option>
              <option value="PRIVATE">{{ t('community.private') }}</option>
            </select>
            <span class="form-hint">
              {{
                createForm.visibility === 'PUBLIC'
                  ? t('community.visibilityPublicHint')
                  : t('community.visibilityPrivateHint')
              }}
            </span>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary" :disabled="creating">
              {{ creating ? t('community.creating') : t('community.createButton') }}
            </button>
            <button
              type="button"
              class="btn btn-ghost"
              @click="showCreateForm = false"
              :disabled="creating"
            >
              {{ t('common.cancel') }}
            </button>
          </div>
        </form>
      </div>

      <!-- Loading -->
      <div v-if="communitiesStore.loading" class="loading-state">
        <span>{{ t('common.loading') }}</span>
      </div>

      <!-- Error -->
      <div v-else-if="communitiesStore.error" class="error-state">
        <p class="error-message">{{ t('community.errorLoad') }}</p>
        <button class="btn btn-primary" @click="communitiesStore.fetchGroups()">
          {{ t('common.tryAgain') }}
        </button>
      </div>

      <!-- Empty -->
      <div v-else-if="!hasGroups" class="empty-state">
        <p class="empty-title">{{ t('community.noGroups') }}</p>
        <p class="empty-desc">{{ t('community.noGroupsDescription') }}</p>
      </div>

      <!-- Groups grid -->
      <div v-else class="groups-grid">
        <RouterLink
          v-for="group in communitiesStore.groups"
          :key="group.id"
          :to="`/community/${group.slug}`"
          class="group-card"
        >
          <div class="group-card-header">
            <h2 class="group-name">{{ group.name }}</h2>
            <span class="visibility-badge" :class="group.visibility.toLowerCase()">
              {{ group.visibility === 'PUBLIC' ? t('community.public') : t('community.private') }}
            </span>
          </div>
          <p v-if="group.summary" class="group-summary">{{ group.summary }}</p>
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.communities-page {
  padding: 2rem 0;
}

.container {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 1rem;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 2rem;
}

.page-title {
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-text);
  margin: 0 0 0.25rem;
}

.page-subtitle {
  color: var(--color-text-secondary);
  margin: 0;
}

.create-form {
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  margin-bottom: 2rem;
}

.form-heading {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0 0 1.25rem;
}

.form-fields {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.form-group label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.form-input,
.form-select {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.9375rem;
}

.form-hint {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.form-actions {
  display: flex;
  gap: 0.75rem;
  padding-top: 0.5rem;
}

.error-banner {
  background: var(--color-error-bg, #fff0f0);
  color: var(--color-error, #c0392b);
  border: 1px solid var(--color-error-border, #f5c6cb);
  border-radius: var(--radius-sm);
  padding: 0.625rem 0.875rem;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}

.loading-state {
  text-align: center;
  padding: 3rem;
  color: var(--color-text-secondary);
}

.error-state {
  text-align: center;
  padding: 3rem;
}

.error-message {
  color: var(--color-text-secondary);
  margin-bottom: 1rem;
}

.empty-state {
  text-align: center;
  padding: 3rem;
}

.empty-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 0.5rem;
}

.empty-desc {
  color: var(--color-text-secondary);
}

.groups-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.group-card {
  display: block;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
  text-decoration: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.group-card:hover {
  border-color: var(--color-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.group-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.group-name {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
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

.group-summary {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

@media (max-width: 640px) {
  .page-header {
    flex-direction: column;
  }

  .groups-grid {
    grid-template-columns: 1fr;
  }
}
</style>
