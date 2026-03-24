import { ref } from 'vue'
import { defineStore } from 'pinia'
import { gqlRequest } from '@/lib/graphql'
import type {
  CommunityGroup,
  CommunityGroupDetail,
  CommunityMembership,
  CommunityMemberRole,
  CommunityVisibility,
} from '@/types'

const COMMUNITY_GROUP_FIELDS = `
  id name slug summary description visibility isActive createdAtUtc createdByUserId
`

const MEMBERSHIP_FIELDS = `
  id groupId userId role status createdAtUtc reviewedAtUtc
  group { ${COMMUNITY_GROUP_FIELDS} }
`

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

  return {
    groups,
    loading,
    error,
    fetchGroups,
    fetchGroupBySlug,
    fetchMyMemberships,
    createGroup,
    updateGroup,
    joinGroup,
    requestMembership,
    reviewMembership,
    assignRole,
    revokeMembership,
    associateEvent,
    disassociateEvent,
  }
})
