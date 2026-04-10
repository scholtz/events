import { ref } from 'vue'
import { defineStore } from 'pinia'
import { gqlRequest } from '@/lib/graphql'
import type { DiscussionEntry } from '@/types'

const DISCUSSION_FIELDS = `
  id
  eventId
  authorDisplayName
  authorRole
  body
  parentEntryId
  isHidden
  createdAtUtc
  updatedAtUtc
`

export const useDiscussionStore = defineStore('discussion', () => {
  /** Discussion entries keyed by event slug. */
  const entriesBySlug = ref<Record<string, DiscussionEntry[]>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)
  const posting = ref(false)
  const postError = ref<string | null>(null)

  function getEntries(eventSlug: string): DiscussionEntry[] {
    return entriesBySlug.value[eventSlug] ?? []
  }

  async function fetchDiscussion(eventSlug: string) {
    loading.value = true
    error.value = null
    try {
      const data = await gqlRequest<{ eventDiscussion: DiscussionEntry[] }>(
        `query EventDiscussion($slug: String!) {
          eventDiscussion(eventSlug: $slug) { ${DISCUSSION_FIELDS} }
        }`,
        { slug: eventSlug },
      )
      entriesBySlug.value = { ...entriesBySlug.value, [eventSlug]: data.eventDiscussion }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unable to load discussion.'
    } finally {
      loading.value = false
    }
  }

  async function postQuestion(eventId: string, body: string): Promise<DiscussionEntry> {
    posting.value = true
    postError.value = null
    try {
      const data = await gqlRequest<{ postEventQuestion: DiscussionEntry }>(
        `mutation PostEventQuestion($input: PostEventQuestionInput!) {
          postEventQuestion(input: $input) { ${DISCUSSION_FIELDS} }
        }`,
        { input: { eventId, body } },
      )
      return data.postEventQuestion
    } catch (err) {
      postError.value = err instanceof Error ? err.message : 'Unable to post question.'
      throw err
    } finally {
      posting.value = false
    }
  }

  async function replyToEntry(entryId: string, body: string): Promise<DiscussionEntry> {
    posting.value = true
    postError.value = null
    try {
      const data = await gqlRequest<{ replyToDiscussionEntry: DiscussionEntry }>(
        `mutation ReplyToDiscussionEntry($input: ReplyToDiscussionEntryInput!) {
          replyToDiscussionEntry(input: $input) { ${DISCUSSION_FIELDS} }
        }`,
        { input: { entryId, body } },
      )
      return data.replyToDiscussionEntry
    } catch (err) {
      postError.value = err instanceof Error ? err.message : 'Unable to post reply.'
      throw err
    } finally {
      posting.value = false
    }
  }

  async function hideEntry(entryId: string): Promise<DiscussionEntry> {
    const data = await gqlRequest<{ hideDiscussionEntry: DiscussionEntry }>(
      `mutation HideDiscussionEntry($entryId: UUID!) {
          hideDiscussionEntry(entryId: $entryId) { ${DISCUSSION_FIELDS} }
        }`,
      { entryId },
    )
    return data.hideDiscussionEntry
  }

  function addEntry(eventSlug: string, entry: DiscussionEntry) {
    const current = entriesBySlug.value[eventSlug] ?? []
    entriesBySlug.value = { ...entriesBySlug.value, [eventSlug]: [...current, entry] }
  }

  function updateEntry(eventSlug: string, updated: DiscussionEntry) {
    const current = entriesBySlug.value[eventSlug] ?? []
    entriesBySlug.value = {
      ...entriesBySlug.value,
      [eventSlug]: current.map((e) => (e.id === updated.id ? updated : e)),
    }
  }

  function clearDiscussion(eventSlug: string) {
    const copy = { ...entriesBySlug.value }
    delete copy[eventSlug]
    entriesBySlug.value = copy
    error.value = null
    postError.value = null
  }

  return {
    entriesBySlug,
    loading,
    error,
    posting,
    postError,
    getEntries,
    fetchDiscussion,
    postQuestion,
    replyToEntry,
    hideEntry,
    addEntry,
    updateEntry,
    clearDiscussion,
  }
})
