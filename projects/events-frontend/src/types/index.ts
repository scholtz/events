export interface EventLocation {
  name: string
  address: string
  lat: number
  lng: number
}

export interface EventItem {
  id: string
  title: string
  description: string
  category: string
  date: string
  endDate?: string
  location: EventLocation
  link: string
  imageUrl?: string
  organizer: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
}

export interface Category {
  id: string
  name: string
  slug: string
  description: string
  color: string
}

export interface User {
  id: string
  name: string
  email: string
  role: 'user' | 'admin'
  createdAt: string
}

export interface EventFilters {
  search: string
  category: string
  dateFrom: string
  dateTo: string
  location: string
}
