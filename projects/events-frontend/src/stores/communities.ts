import { ref } from 'vue'
import { defineStore } from 'pinia'
import { gqlRequest } from '@/lib/graphql'
import type {
  CommunityGroup,
  CommunityGroupDetail,
  CommunityMembership,
  CommunityMemberRole,
  CommunityVisibility,
  ExternalSourceClaim,
  ExternalSourceType,
  ExternalEventPreview,
  SyncResult,
} from '@/types'

const COMMUNITY_GROUP_FIELDS = `
  id name slug summary description visibility isActive createdAtUtc createdByUserId
`

const MEMBERSHIP_FIELDS = `
  id groupId userId role status createdAtUtc reviewedAtUtc
  user { id displayName email }
  group { ${COMMUNITY_GROUP_FIELDS} }
`

const EXTERNAL_SOURCE_CLAIM_FIELDS = `
  id groupId sourceType sourceUrl sourceIdentifier status
  createdByUserId createdAtUtc
  lastSyncAtUtc lastSyncSucceededAtUtc lastSyncOutcome lastSyncError
  lastSyncImportedCount lastSyncSkippedCount isAutoSyncEnabled
  adminNote
`

/**
 * Converts a community group display name into a URL-safe slug.
 * Lowercases, replaces non-alphanumeric runs with hyphens, and trims leading/trailing hyphens.
 *
 * @example
 * generateCommunitySlug('Prague Crypto Circle')  // → 'prague-crypto-circle'
 * generateCommunitySlug('  AI & ML Enthusiasts!') // → 'ai-ml-enthusiasts'
 * generateCommunitySlug('----Blockchain----')     // → 'blockchain'
 */
export function generateCommunitySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export const useCommunitiesStore = defineStore('communities', () => {
  const groups = ref<CommunityGroup[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchGroups() {
    loading.value = true
    error.value = null
    try {
      const data = await gqlRequest<{ communityGroups: CommunityGroup[] }>(
        `query CommunityGroups {
          communityGroups { ${COMMUNITY_GROUP_FIELDS} }
        }`,
      )
      groups.value = data.communityGroups
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load community groups'
    } finally {
      loading.value = false
    }
  }

  async function fetchGroupBySlug(slug: string): Promise<CommunityGroupDetail | null> {
    const data = await gqlRequest<{ communityGroupBySlug: CommunityGroupDetail | null }>(
      `query CommunityGroupBySlug($slug: String!) {
        communityGroupBySlug(slug: $slug) {
          group { ${COMMUNITY_GROUP_FIELDS} }
          memberCount
          myMembership { ${MEMBERSHIP_FIELDS} }
          events {
            id name slug description city startsAtUtc endsAtUtc status isFree priceAmount
            currencyCode attendanceMode venueName addressLine1 countryCode publishedAtUtc
            mapUrl interestedCount
            domain { id name slug subdomain description logoUrl primaryColor }
            submittedBy { displayName }
          }
        }
      }`,
      { slug },
    )
    return data.communityGroupBySlug
  }

  async function fetchMyMemberships(): Promise<CommunityMembership[]> {
    const data = await gqlRequest<{ myCommunityMemberships: CommunityMembership[] }>(
      `query MyCommunityMemberships {
        myCommunityMemberships { ${MEMBERSHIP_FIELDS} }
      }`,
    )
    return data.myCommunityMemberships
  }

  async function createGroup(input: {
    name: string
    slug: string
    summary?: string
    description?: string
    visibility: CommunityVisibility
  }): Promise<CommunityGroup> {
    const data = await gqlRequest<{ createCommunityGroup: CommunityGroup }>(
      `mutation CreateCommunityGroup($input: CreateCommunityGroupInput!) {
        createCommunityGroup(input: $input) { ${COMMUNITY_GROUP_FIELDS} }
      }`,
      { input },
    )
    return data.createCommunityGroup
  }

  async function updateGroup(
    groupId: string,
    input: {
      name?: string
      summary?: string
      description?: string
      visibility?: CommunityVisibility
      isActive?: boolean
    },
  ): Promise<CommunityGroup> {
    const data = await gqlRequest<{ updateCommunityGroup: CommunityGroup }>(
      `mutation UpdateCommunityGroup($groupId: UUID!, $input: UpdateCommunityGroupInput!) {
        updateCommunityGroup(groupId: $groupId, input: $input) { ${COMMUNITY_GROUP_FIELDS} }
      }`,
      { groupId, input },
    )
    return data.updateCommunityGroup
  }

  async function joinGroup(groupId: string): Promise<CommunityMembership> {
    const data = await gqlRequest<{ joinCommunityGroup: CommunityMembership }>(
      `mutation JoinCommunityGroup($groupId: UUID!) {
        joinCommunityGroup(groupId: $groupId) { ${MEMBERSHIP_FIELDS} }
      }`,
      { groupId },
    )
    return data.joinCommunityGroup
  }

  async function requestMembership(groupId: string): Promise<CommunityMembership> {
    const data = await gqlRequest<{ requestCommunityMembership: CommunityMembership }>(
      `mutation RequestCommunityMembership($groupId: UUID!) {
        requestCommunityMembership(groupId: $groupId) { ${MEMBERSHIP_FIELDS} }
      }`,
      { groupId },
    )
    return data.requestCommunityMembership
  }

  async function reviewMembership(
    membershipId: string,
    approve: boolean,
  ): Promise<CommunityMembership> {
    const data = await gqlRequest<{ reviewMembershipRequest: CommunityMembership }>(
      `mutation ReviewMembershipRequest($membershipId: UUID!, $input: ReviewMembershipRequestInput!) {
        reviewMembershipRequest(membershipId: $membershipId, input: $input) { ${MEMBERSHIP_FIELDS} }
      }`,
      { membershipId, input: { approve } },
    )
    return data.reviewMembershipRequest
  }

  async function assignRole(
    membershipId: string,
    role: CommunityMemberRole,
  ): Promise<CommunityMembership> {
    const data = await gqlRequest<{ assignMemberRole: CommunityMembership }>(
      `mutation AssignMemberRole($membershipId: UUID!, $role: CommunityMemberRole!) {
        assignMemberRole(membershipId: $membershipId, role: $role) { ${MEMBERSHIP_FIELDS} }
      }`,
      { membershipId, role },
    )
    return data.assignMemberRole
  }

  async function revokeMembership(membershipId: string): Promise<boolean> {
    const data = await gqlRequest<{ revokeMembership: boolean }>(
      `mutation RevokeMembership($membershipId: UUID!) {
        revokeMembership(membershipId: $membershipId)
      }`,
      { membershipId },
    )
    return data.revokeMembership
  }

  async function leaveGroup(groupId: string): Promise<boolean> {
    const data = await gqlRequest<{ leaveCommunityGroup: boolean }>(
      `mutation LeaveCommunityGroup($groupId: UUID!) {
        leaveCommunityGroup(groupId: $groupId)
      }`,
      { groupId },
    )
    return data.leaveCommunityGroup
  }

  async function associateEvent(groupId: string, eventId: string) {
    await gqlRequest(
      `mutation AssociateEventWithGroup($input: CommunityGroupEventInput!) {
        associateEventWithGroup(input: $input) { id }
      }`,
      { input: { groupId, eventId } },
    )
  }

  async function disassociateEvent(groupId: string, eventId: string) {
    await gqlRequest(
      `mutation DisassociateEventFromGroup($input: CommunityGroupEventInput!) {
        disassociateEventFromGroup(input: $input)
      }`,
      { input: { groupId, eventId } },
    )
  }

  async function fetchPendingRequests(groupId: string): Promise<CommunityMembership[]> {
    const data = await gqlRequest<{ pendingMembershipRequests: CommunityMembership[] }>(
      `query PendingMembershipRequests($groupId: UUID!) {
        pendingMembershipRequests(groupId: $groupId) { ${MEMBERSHIP_FIELDS} }
      }`,
      { groupId },
    )
    return data.pendingMembershipRequests
  }

  async function fetchGroupMembers(groupId: string): Promise<CommunityMembership[]> {
    const data = await gqlRequest<{ groupMembers: CommunityMembership[] }>(
      `query GroupMembers($groupId: UUID!) {
        groupMembers(groupId: $groupId) { ${MEMBERSHIP_FIELDS} }
      }`,
      { groupId },
    )
    return data.groupMembers
  }

  async function fetchExternalSources(groupId: string): Promise<ExternalSourceClaim[]> {
    const data = await gqlRequest<{ groupExternalSources: ExternalSourceClaim[] }>(
      `query GroupExternalSources($groupId: UUID!) {
        groupExternalSources(groupId: $groupId) { ${EXTERNAL_SOURCE_CLAIM_FIELDS} }
      }`,
      { groupId },
    )
    return data.groupExternalSources
  }

  async function addExternalSource(
    groupId: string,
    input: { sourceType: ExternalSourceType; sourceUrl: string },
  ): Promise<ExternalSourceClaim> {
    const data = await gqlRequest<{ addExternalSourceClaim: ExternalSourceClaim }>(
      `mutation AddExternalSourceClaim($groupId: UUID!, $input: AddExternalSourceClaimInput!) {
        addExternalSourceClaim(groupId: $groupId, input: $input) { ${EXTERNAL_SOURCE_CLAIM_FIELDS} }
      }`,
      { groupId, input },
    )
    return data.addExternalSourceClaim
  }

  async function removeExternalSource(claimId: string): Promise<boolean> {
    const data = await gqlRequest<{ removeExternalSourceClaim: boolean }>(
      `mutation RemoveExternalSourceClaim($claimId: UUID!) {
        removeExternalSourceClaim(claimId: $claimId)
      }`,
      { claimId },
    )
    return data.removeExternalSourceClaim
  }

  async function triggerSync(claimId: string): Promise<SyncResult> {
    const data = await gqlRequest<{ triggerExternalSync: SyncResult }>(
      `mutation TriggerExternalSync($claimId: UUID!) {
        triggerExternalSync(claimId: $claimId) {
          importedCount updatedCount skippedCount errorCount summary
        }
      }`,
      { claimId },
    )
    return data.triggerExternalSync
  }

  async function setAutoSyncEnabled(claimId: string, enabled: boolean): Promise<ExternalSourceClaim> {
    const data = await gqlRequest<{ setAutoSyncEnabled: ExternalSourceClaim }>(
      `mutation SetAutoSyncEnabled($claimId: UUID!, $enabled: Boolean!) {
        setAutoSyncEnabled(claimId: $claimId, enabled: $enabled) { ${EXTERNAL_SOURCE_CLAIM_FIELDS} }
      }`,
      { claimId, enabled },
    )
    return data.setAutoSyncEnabled
  }

  const EXTERNAL_EVENT_PREVIEW_FIELDS = `
    externalId name description eventUrl
    startsAtUtc endsAtUtc city venueName
    isFree priceAmount currencyCode
    alreadyImported isImportable importBlockReason
  `

  async function previewExternalEvents(claimId: string): Promise<ExternalEventPreview[]> {
    const data = await gqlRequest<{ previewExternalEvents: ExternalEventPreview[] }>(
      `query PreviewExternalEvents($claimId: UUID!) {
        previewExternalEvents(claimId: $claimId) { ${EXTERNAL_EVENT_PREVIEW_FIELDS} }
      }`,
      { claimId },
    )
    return data.previewExternalEvents
  }

  async function importExternalEvents(
    claimId: string,
    externalIds: string[],
  ): Promise<SyncResult> {
    const data = await gqlRequest<{ importExternalEvents: SyncResult }>(
      `mutation ImportExternalEvents($claimId: UUID!, $input: ImportExternalEventsInput!) {
        importExternalEvents(claimId: $claimId, input: $input) {
          importedCount updatedCount skippedCount errorCount summary
        }
      }`,
      { claimId, input: { externalIds } },
    )
    return data.importExternalEvents
  }

  return {
    groups,
    loading,
    error,
    fetchGroups,
    fetchGroupBySlug,
    fetchMyMemberships,
    fetchPendingRequests,
    fetchGroupMembers,
    createGroup,
    updateGroup,
    joinGroup,
    requestMembership,
    reviewMembership,
    assignRole,
    revokeMembership,
    leaveGroup,
    associateEvent,
    disassociateEvent,
    fetchExternalSources,
    addExternalSource,
    removeExternalSource,
    triggerSync,
    setAutoSyncEnabled,
    previewExternalEvents,
    importExternalEvents,
  }
})


