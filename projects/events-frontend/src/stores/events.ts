import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { EventItem, EventFilters } from '@/types'

const DEMO_EVENTS: EventItem[] = [
  {
    id: '1',
    title: 'Prague Crypto Summit 2026',
    description:
      'The largest crypto conference in Central Europe featuring talks from industry leaders, workshops, and networking opportunities.',
    category: 'crypto',
    date: '2026-03-15',
    endDate: '2026-03-17',
    location: {
      name: 'Prague Congress Centre',
      address: 'Prague 4, Czech Republic',
      lat: 50.0614,
      lng: 14.4283,
    },
    link: 'https://example.com/prague-crypto-summit',
    imageUrl: '',
    organizer: 'CryptoEvents EU',
    status: 'approved',
    createdAt: '2026-01-10',
  },
  {
    id: '2',
    title: 'AI & Machine Learning Meetup',
    description:
      'Monthly meetup for AI enthusiasts. This month we discuss large language models and their practical applications.',
    category: 'ai',
    date: '2026-03-20',
    location: {
      name: 'Node5 Coworking',
      address: 'Radlická 50, Prague 5',
      lat: 50.0706,
      lng: 14.4028,
    },
    link: 'https://example.com/ai-meetup',
    imageUrl: '',
    organizer: 'Prague AI Community',
    status: 'approved',
    createdAt: '2026-02-01',
  },
  {
    id: '3',
    title: 'DeFi Workshop Prague',
    description:
      'Hands-on workshop exploring decentralized finance protocols, yield farming strategies, and smart contract development.',
    category: 'crypto',
    date: '2026-04-05',
    location: {
      name: 'Paralelní Polis',
      address: 'Dělnická 43, Prague 7',
      lat: 50.1015,
      lng: 14.4478,
    },
    link: 'https://example.com/defi-workshop',
    imageUrl: '',
    organizer: 'DeFi Prague',
    status: 'approved',
    createdAt: '2026-02-10',
  },
  {
    id: '4',
    title: 'Cooking Masterclass: Czech Cuisine',
    description:
      'Learn traditional Czech recipes from a professional chef. Includes svíčková, trdelník, and more.',
    category: 'cooking',
    date: '2026-03-25',
    location: {
      name: 'Culinary Institute Prague',
      address: 'Vodičkova 30, Prague 1',
      lat: 50.0818,
      lng: 14.4235,
    },
    link: 'https://example.com/czech-cooking',
    imageUrl: '',
    organizer: 'Prague Foodies',
    status: 'approved',
    createdAt: '2026-02-05',
  },
  {
    id: '5',
    title: 'Blockchain Developer Conference',
    description:
      'Technical conference for blockchain developers. Deep dives into Solidity, Rust smart contracts, and cross-chain interoperability.',
    category: 'crypto',
    date: '2026-04-12',
    endDate: '2026-04-13',
    location: {
      name: 'MeetFactory',
      address: 'Ke Sklárně 15, Prague 5',
      lat: 50.0527,
      lng: 14.4087,
    },
    link: 'https://example.com/blockchain-dev-conf',
    imageUrl: '',
    organizer: 'Web3 Builders',
    status: 'approved',
    createdAt: '2026-01-20',
  },
  {
    id: '6',
    title: 'Startup Pitch Night',
    description:
      'Watch emerging startups pitch their ideas to investors. Networking reception follows.',
    category: 'business',
    date: '2026-03-28',
    location: {
      name: 'Impact Hub Prague',
      address: 'Drtinova 10, Prague 5',
      lat: 50.0749,
      lng: 14.4002,
    },
    link: 'https://example.com/pitch-night',
    imageUrl: '',
    organizer: 'Prague Startup Hub',
    status: 'pending',
    createdAt: '2026-02-15',
  },
]

export const useEventsStore = defineStore('events', () => {
  const events = ref<EventItem[]>(DEMO_EVENTS)

  const filters = ref<EventFilters>({
    search: '',
    category: '',
    dateFrom: '',
    dateTo: '',
    location: '',
  })

  const filteredEvents = computed(() => {
    return events.value.filter((event) => {
      if (event.status !== 'approved') return false

      if (
        filters.value.search &&
        !event.title.toLowerCase().includes(filters.value.search.toLowerCase()) &&
        !event.description.toLowerCase().includes(filters.value.search.toLowerCase())
      ) {
        return false
      }

      if (filters.value.category && event.category !== filters.value.category) {
        return false
      }

      if (filters.value.dateFrom && event.date < filters.value.dateFrom) {
        return false
      }

      if (filters.value.dateTo && event.date > filters.value.dateTo) {
        return false
      }

      if (
        filters.value.location &&
        !event.location.name.toLowerCase().includes(filters.value.location.toLowerCase()) &&
        !event.location.address.toLowerCase().includes(filters.value.location.toLowerCase())
      ) {
        return false
      }

      return true
    })
  })

  const allEvents = computed(() => events.value)

  const pendingEvents = computed(() => events.value.filter((e) => e.status === 'pending'))

  function getEventById(id: string): EventItem | undefined {
    return events.value.find((e) => e.id === id)
  }

  function addEvent(event: Omit<EventItem, 'id' | 'createdAt' | 'status'>) {
    const newEvent: EventItem = {
      ...event,
      id: String(Date.now()),
      status: 'pending',
      createdAt: new Date().toISOString().slice(0, 10),
    }
    events.value.push(newEvent)
    return newEvent
  }

  function updateEventStatus(id: string, status: EventItem['status']) {
    const event = events.value.find((e) => e.id === id)
    if (event) {
      event.status = status
    }
  }

  function deleteEvent(id: string) {
    events.value = events.value.filter((e) => e.id !== id)
  }

  function setFilters(newFilters: Partial<EventFilters>) {
    filters.value = { ...filters.value, ...newFilters }
  }

  function clearFilters() {
    filters.value = { search: '', category: '', dateFrom: '', dateTo: '', location: '' }
  }

  return {
    events,
    filters,
    filteredEvents,
    allEvents,
    pendingEvents,
    getEventById,
    addEvent,
    updateEventStatus,
    deleteEvent,
    setFilters,
    clearFilters,
  }
})
