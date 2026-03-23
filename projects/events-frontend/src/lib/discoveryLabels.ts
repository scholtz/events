import type { EventFilters } from '@/types'

type TranslateFn = (key: string, params?: Record<string, unknown>) => string

type FilterChip = {
  key: string
}

function getLanguageLabel(language: string, t: TranslateFn): string {
  switch (language.toLowerCase()) {
    case 'en':
      return t('filters.langEn')
    case 'cs':
      return t('filters.langCs')
    case 'sk':
      return t('filters.langSk')
    case 'de':
      return t('filters.langDe')
    case 'fr':
      return t('filters.langFr')
    case 'es':
      return t('filters.langEs')
    case 'pl':
      return t('filters.langPl')
    default:
      return language.toUpperCase()
  }
}

export function formatDiscoveryChipLabel(
  chip: FilterChip,
  filters: EventFilters,
  t: TranslateFn,
  resolveDomainName?: (slug: string) => string | undefined,
): string {
  switch (chip.key) {
    case 'search':
      return t('filters.chipKeyword', { value: filters.search.trim() })
    case 'domain': {
      const domainSlug = filters.domain
      const domainName = domainSlug ? resolveDomainName?.(domainSlug) ?? domainSlug : ''
      return t('filters.chipDomain', { value: domainName })
    }
    case 'dateFrom':
      return t('filters.chipFrom', { value: filters.dateFrom })
    case 'dateTo':
      return t('filters.chipTo', { value: filters.dateTo })
    case 'location':
      return t('filters.chipLocation', { value: filters.location.trim() })
    case 'priceType':
      return filters.priceType === 'FREE' ? t('filters.chipPriceFree') : t('filters.chipPricePaid')
    case 'priceMin':
      return t('filters.chipMinPrice', { value: filters.priceMin })
    case 'priceMax':
      return t('filters.chipMaxPrice', { value: filters.priceMax })
    case 'sortBy': {
      const sortLabel =
        filters.sortBy === 'NEWEST'
          ? t('filters.newest')
          : filters.sortBy === 'RELEVANCE'
            ? t('filters.relevance')
            : t('filters.upcoming')
      return t('filters.chipSort', { value: sortLabel })
    }
    case 'attendanceMode':
      if (filters.attendanceMode === 'IN_PERSON') return t('filters.chipModeInPerson')
      if (filters.attendanceMode === 'ONLINE') return t('filters.chipModeOnline')
      return t('filters.chipModeHybrid')
    case 'language':
      return t('filters.chipLanguage', { value: getLanguageLabel(filters.language.trim(), t) })
    case 'timezone':
      return t('filters.chipTimezone', { value: filters.timezone.trim() })
    default:
      return ''
  }
}
