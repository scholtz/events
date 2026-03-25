import { ref } from 'vue';
import { defineStore } from 'pinia';
import { gqlRequest } from '@/lib/graphql';
const COMMUNITY_GROUP_FIELDS = `
  id name slug summary description visibility isActive createdAtUtc createdByUserId
`;
const MEMBERSHIP_FIELDS = `
  id groupId userId role status createdAtUtc reviewedAtUtc
  user { id displayName email }
  group { ${COMMUNITY_GROUP_FIELDS} }
`;
const EXTERNAL_SOURCE_CLAIM_FIELDS = `
  id groupId sourceType sourceUrl sourceIdentifier status
  createdByUserId createdAtUtc
  lastSyncAtUtc lastSyncOutcome lastSyncImportedCount lastSyncSkippedCount
`;
export const useCommunitiesStore = defineStore('communities', () => {
    const groups = ref([]);
    const loading = ref(false);
    const error = ref(null);
    async function fetchGroups() {
        loading.value = true;
        error.value = null;
        try {
            const data = await gqlRequest(`query CommunityGroups {
          communityGroups { ${COMMUNITY_GROUP_FIELDS} }
        }`);
            groups.value = data.communityGroups;
        }
        catch (err) {
            error.value = err instanceof Error ? err.message : 'Failed to load community groups';
        }
        finally {
            loading.value = false;
        }
    }
    async function fetchGroupBySlug(slug) {
        const data = await gqlRequest(`query CommunityGroupBySlug($slug: String!) {
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
      }`, { slug });
        return data.communityGroupBySlug;
    }
    async function fetchMyMemberships() {
        const data = await gqlRequest(`query MyCommunityMemberships {
        myCommunityMemberships { ${MEMBERSHIP_FIELDS} }
      }`);
        return data.myCommunityMemberships;
    }
    async function createGroup(input) {
        const data = await gqlRequest(`mutation CreateCommunityGroup($input: CreateCommunityGroupInput!) {
        createCommunityGroup(input: $input) { ${COMMUNITY_GROUP_FIELDS} }
      }`, { input });
        return data.createCommunityGroup;
    }
    async function updateGroup(groupId, input) {
        const data = await gqlRequest(`mutation UpdateCommunityGroup($groupId: UUID!, $input: UpdateCommunityGroupInput!) {
        updateCommunityGroup(groupId: $groupId, input: $input) { ${COMMUNITY_GROUP_FIELDS} }
      }`, { groupId, input });
        return data.updateCommunityGroup;
    }
    async function joinGroup(groupId) {
        const data = await gqlRequest(`mutation JoinCommunityGroup($groupId: UUID!) {
        joinCommunityGroup(groupId: $groupId) { ${MEMBERSHIP_FIELDS} }
      }`, { groupId });
        return data.joinCommunityGroup;
    }
    async function requestMembership(groupId) {
        const data = await gqlRequest(`mutation RequestCommunityMembership($groupId: UUID!) {
        requestCommunityMembership(groupId: $groupId) { ${MEMBERSHIP_FIELDS} }
      }`, { groupId });
        return data.requestCommunityMembership;
    }
    async function reviewMembership(membershipId, approve) {
        const data = await gqlRequest(`mutation ReviewMembershipRequest($membershipId: UUID!, $input: ReviewMembershipRequestInput!) {
        reviewMembershipRequest(membershipId: $membershipId, input: $input) { ${MEMBERSHIP_FIELDS} }
      }`, { membershipId, input: { approve } });
        return data.reviewMembershipRequest;
    }
    async function assignRole(membershipId, role) {
        const data = await gqlRequest(`mutation AssignMemberRole($membershipId: UUID!, $role: CommunityMemberRole!) {
        assignMemberRole(membershipId: $membershipId, role: $role) { ${MEMBERSHIP_FIELDS} }
      }`, { membershipId, role });
        return data.assignMemberRole;
    }
    async function revokeMembership(membershipId) {
        const data = await gqlRequest(`mutation RevokeMembership($membershipId: UUID!) {
        revokeMembership(membershipId: $membershipId)
      }`, { membershipId });
        return data.revokeMembership;
    }
    async function associateEvent(groupId, eventId) {
        await gqlRequest(`mutation AssociateEventWithGroup($input: CommunityGroupEventInput!) {
        associateEventWithGroup(input: $input) { id }
      }`, { input: { groupId, eventId } });
    }
    async function disassociateEvent(groupId, eventId) {
        await gqlRequest(`mutation DisassociateEventFromGroup($input: CommunityGroupEventInput!) {
        disassociateEventFromGroup(input: $input)
      }`, { input: { groupId, eventId } });
    }
    async function fetchPendingRequests(groupId) {
        const data = await gqlRequest(`query PendingMembershipRequests($groupId: UUID!) {
        pendingMembershipRequests(groupId: $groupId) { ${MEMBERSHIP_FIELDS} }
      }`, { groupId });
        return data.pendingMembershipRequests;
    }
    async function fetchGroupMembers(groupId) {
        const data = await gqlRequest(`query GroupMembers($groupId: UUID!) {
        groupMembers(groupId: $groupId) { ${MEMBERSHIP_FIELDS} }
      }`, { groupId });
        return data.groupMembers;
    }
    async function fetchExternalSources(groupId) {
        const data = await gqlRequest(`query GroupExternalSources($groupId: UUID!) {
        groupExternalSources(groupId: $groupId) { ${EXTERNAL_SOURCE_CLAIM_FIELDS} }
      }`, { groupId });
        return data.groupExternalSources;
    }
    async function addExternalSource(groupId, input) {
        const data = await gqlRequest(`mutation AddExternalSourceClaim($groupId: UUID!, $input: AddExternalSourceClaimInput!) {
        addExternalSourceClaim(groupId: $groupId, input: $input) { ${EXTERNAL_SOURCE_CLAIM_FIELDS} }
      }`, { groupId, input });
        return data.addExternalSourceClaim;
    }
    async function removeExternalSource(claimId) {
        const data = await gqlRequest(`mutation RemoveExternalSourceClaim($claimId: UUID!) {
        removeExternalSourceClaim(claimId: $claimId)
      }`, { claimId });
        return data.removeExternalSourceClaim;
    }
    async function triggerSync(claimId) {
        const data = await gqlRequest(`mutation TriggerExternalSync($claimId: UUID!) {
        triggerExternalSync(claimId: $claimId) {
          importedCount skippedCount errorCount summary
        }
      }`, { claimId });
        return data.triggerExternalSync;
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
        associateEvent,
        disassociateEvent,
        fetchExternalSources,
        addExternalSource,
        removeExternalSource,
        triggerSync,
    };
});
