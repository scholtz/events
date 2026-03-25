import { ref } from 'vue';
import { defineStore } from 'pinia';
import { gqlRequest } from '@/lib/graphql';
const DOMAIN_FIELDS = `id name slug subdomain description isActive createdAtUtc
  createdByUserId primaryColor accentColor logoUrl bannerUrl
  overviewContent whatBelongsHere submitEventCta curatorCredit`;
export const useDomainsStore = defineStore('domains', () => {
    const domains = ref([]);
    const loading = ref(false);
    const myManagedDomains = ref([]);
    const myManagedDomainsLoading = ref(false);
    async function fetchDomains() {
        loading.value = true;
        try {
            const data = await gqlRequest(`query Domains {
          domains { ${DOMAIN_FIELDS} }
        }`);
            domains.value = data.domains;
        }
        finally {
            loading.value = false;
        }
    }
    async function fetchMyManagedDomains() {
        myManagedDomainsLoading.value = true;
        try {
            const data = await gqlRequest(`query MyManagedDomains {
          myManagedDomains { ${DOMAIN_FIELDS} }
        }`);
            myManagedDomains.value = data.myManagedDomains;
        }
        catch {
            myManagedDomains.value = [];
        }
        finally {
            myManagedDomainsLoading.value = false;
        }
    }
    function getDomainBySlug(slug) {
        return domains.value.find((d) => d.slug === slug);
    }
    async function upsertDomain(input) {
        const data = await gqlRequest(`mutation UpsertDomain($input: DomainInput!) {
        upsertDomain(input: $input) { ${DOMAIN_FIELDS} }
      }`, { input });
        const idx = domains.value.findIndex((d) => d.id === data.upsertDomain.id);
        if (idx >= 0) {
            domains.value[idx] = data.upsertDomain;
        }
        else {
            domains.value.push(data.upsertDomain);
        }
        return data.upsertDomain;
    }
    async function fetchDomainAdministrators(domainId) {
        const data = await gqlRequest(`query DomainAdmins($domainId: UUID!) {
        domainAdministrators(domainId: $domainId) {
          id domainId userId
          user { displayName email }
          createdAtUtc
        }
      }`, { domainId });
        return data.domainAdministrators;
    }
    async function addDomainAdministrator(domainId, userId) {
        const data = await gqlRequest(`mutation AddDomainAdmin($input: DomainAdministratorInput!) {
        addDomainAdministrator(input: $input) {
          id domainId userId
          user { displayName email }
          createdAtUtc
        }
      }`, { input: { domainId, userId } });
        return data.addDomainAdministrator;
    }
    async function removeDomainAdministrator(domainId, userId) {
        await gqlRequest(`mutation RemoveDomainAdmin($input: DomainAdministratorInput!) {
        removeDomainAdministrator(input: $input)
      }`, { input: { domainId, userId } });
    }
    async function updateDomainStyle(input) {
        const data = await gqlRequest(`mutation UpdateDomainStyle($input: UpdateDomainStyleInput!) {
        updateDomainStyle(input: $input) { ${DOMAIN_FIELDS} }
      }`, { input });
        const idx = domains.value.findIndex((d) => d.id === data.updateDomainStyle.id);
        if (idx >= 0) {
            domains.value[idx] = data.updateDomainStyle;
        }
        // Also update myManagedDomains if present there
        const mIdx = myManagedDomains.value.findIndex((d) => d.id === data.updateDomainStyle.id);
        if (mIdx >= 0) {
            myManagedDomains.value[mIdx] = data.updateDomainStyle;
        }
        return data.updateDomainStyle;
    }
    async function updateDomainOverview(input) {
        const data = await gqlRequest(`mutation UpdateDomainOverview($input: UpdateDomainOverviewInput!) {
        updateDomainOverview(input: $input) { ${DOMAIN_FIELDS} }
      }`, { input });
        const idx = domains.value.findIndex((d) => d.id === data.updateDomainOverview.id);
        if (idx >= 0) {
            domains.value[idx] = data.updateDomainOverview;
        }
        // Also update myManagedDomains if present there
        const mIdx = myManagedDomains.value.findIndex((d) => d.id === data.updateDomainOverview.id);
        if (mIdx >= 0) {
            myManagedDomains.value[mIdx] = data.updateDomainOverview;
        }
        return data.updateDomainOverview;
    }
    async function setDomainFeaturedEvents(domainId, eventIds) {
        await gqlRequest(`mutation SetDomainFeaturedEvents($input: SetDomainFeaturedEventsInput!) {
        setDomainFeaturedEvents(input: $input) { id }
      }`, { input: { domainId, eventIds } });
    }
    return {
        domains,
        loading,
        myManagedDomains,
        myManagedDomainsLoading,
        fetchDomains,
        fetchMyManagedDomains,
        getDomainBySlug,
        upsertDomain,
        fetchDomainAdministrators,
        addDomainAdministrator,
        removeDomainAdministrator,
        updateDomainStyle,
        updateDomainOverview,
        setDomainFeaturedEvents,
    };
});
