import { expect, test } from '@playwright/test'

type MockUser = {
  id: string
  email: string
  password: string
  name: string
  role: 'user' | 'admin'
}

type MockCategory = {
  id: string
  name: string
  slug: string
  description: string
  color: string
}

type MockEvent = {
  id: string
  title: string
  description: string
  category: string
  date: string
  endDate?: string
  location: {
    name: string
    address: string
    lat: number
    lng: number
  }
  link: string
  imageUrl: string
  organizer: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

function parseJsonBody<T>(body: string | null): T {
  return body ? (JSON.parse(body) as T) : ({} as T)
}

test('full flow: signup, submit event, approve, list and filter', async ({ page }) => {
  const users: MockUser[] = [
    {
      id: 'admin-1',
      email: 'admin@example.com',
      password: 'AdminPass123!',
      name: 'Admin User',
      role: 'admin',
    },
  ]
  const categories: MockCategory[] = [
    {
      id: 'cat-tech',
      name: 'Technology',
      slug: 'technology',
      description: 'Tech events',
      color: '#137fec',
    },
  ]
  const events: MockEvent[] = []
  let currentUserId: string | null = null

  await page.route('**/auth/v1/**', async (route) => {
    const request = route.request()
    const method = request.method()
    const url = new URL(request.url())
    const user = users.find((u) => u.id === currentUserId)

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 200, body: '{}' })
      return
    }

    if (url.pathname.endsWith('/auth/v1/signup') && method === 'POST') {
      const payload = parseJsonBody<{ email: string; password: string }>(request.postData())
      const id = `user-${users.length + 1}`
      users.push({
        id,
        email: payload.email,
        password: payload.password,
        name: '',
        role: 'user',
      })
      currentUserId = id
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id, email: payload.email },
          session: null,
        }),
      })
      return
    }

    if (url.pathname.endsWith('/auth/v1/token') && method === 'POST') {
      const payload = parseJsonBody<{ email: string; password: string }>(request.postData())
      const matched = users.find((u) => u.email === payload.email && u.password === payload.password)
      if (!matched) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ msg: 'Invalid login credentials' }),
        })
        return
      }
      currentUserId = matched.id
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: `token-${matched.id}`,
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: `refresh-${matched.id}`,
          user: { id: matched.id, email: matched.email },
        }),
      })
      return
    }

    if (url.pathname.endsWith('/auth/v1/logout') && method === 'POST') {
      currentUserId = null
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
      return
    }

    if (url.pathname.endsWith('/auth/v1/user') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user ? { id: user.id, email: user.email } : { user: null }),
      })
      return
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const method = request.method()
    const url = new URL(request.url())

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 200, body: '{}' })
      return
    }

    if (url.pathname.endsWith('/rest/v1/categories') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(categories),
      })
      return
    }

    if (url.pathname.endsWith('/rest/v1/users') && method === 'POST') {
      const payload = parseJsonBody<{ id: string; name: string; email: string; role: 'user' | 'admin' }>(
        request.postData(),
      )
      const existing = users.find((u) => u.id === payload.id)
      if (existing) {
        existing.name = payload.name
        existing.role = payload.role
      }
      await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' })
      return
    }

    if (url.pathname.endsWith('/rest/v1/users') && method === 'GET') {
      const id = url.searchParams.get('id')?.replace('eq.', '')
      const user = users.find((u) => u.id === id)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          user
            ? {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                created_at: new Date().toISOString(),
              }
            : null,
        ),
      })
      return
    }

    if (url.pathname.endsWith('/rest/v1/events') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(events),
      })
      return
    }

    if (url.pathname.endsWith('/rest/v1/events') && method === 'POST') {
      const payload = parseJsonBody<Omit<MockEvent, 'id' | 'created_at' | 'status'>>(request.postData())
      const newEvent: MockEvent = {
        ...payload,
        id: `event-${events.length + 1}`,
        status: 'pending',
        created_at: new Date().toISOString(),
      }
      events.unshift(newEvent)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(newEvent),
      })
      return
    }

    if (url.pathname.endsWith('/rest/v1/events') && method === 'PATCH') {
      const id = url.searchParams.get('id')?.replace('eq.', '')
      const payload = parseJsonBody<{ status: MockEvent['status'] }>(request.postData())
      const event = events.find((e) => e.id === id)
      if (event) event.status = payload.status
      await route.fulfill({ status: 204, contentType: 'application/json', body: '{}' })
      return
    }

    if (url.pathname.endsWith('/rest/v1/events') && method === 'DELETE') {
      const id = url.searchParams.get('id')?.replace('eq.', '')
      const index = events.findIndex((e) => e.id === id)
      if (index >= 0) events.splice(index, 1)
      await route.fulfill({ status: 204, contentType: 'application/json', body: '{}' })
      return
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  const title = `Playwright Event ${Date.now()}`

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: /Discover Events/i })).toBeVisible()

  await page.getByRole('link', { name: 'Login' }).click()
  await page.getByRole('button', { name: 'Sign Up' }).click()
  await page.getByLabel('Full Name').fill('Flow Tester')
  await page.getByLabel('Email').fill('flow.tester@example.com')
  await page.getByLabel('Password').fill('UserPass123!')
  await page.getByRole('button', { name: 'Create Account' }).click()

  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  await page.getByRole('link', { name: '+ Submit Event' }).click()
  await expect(page.getByRole('heading', { name: 'Submit an Event' })).toBeVisible()

  await page.getByLabel('Event Title *').fill(title)
  await page.getByLabel('Description *').fill('End-to-end submitted event for UI coverage.')
  await page.getByLabel('Category *').selectOption('technology')
  await page.getByLabel('Organizer').fill('Flow Team')
  await page.getByLabel('Start Date *').fill('2026-03-15')
  await page.getByLabel('Venue Name').fill('Stitch Hall')
  await page.getByLabel('Address').fill('Design Street 123')
  await page.getByLabel('Latitude').fill('50.0755')
  await page.getByLabel('Longitude').fill('14.4378')
  await page.getByLabel('Website / Registration URL *').fill('https://example.com/event')
  await page.getByRole('button', { name: 'Submit Event' }).click()

  await expect(page.getByRole('heading', { name: 'Event Submitted!' })).toBeVisible()
  await page.getByRole('link', { name: 'Go to Dashboard' }).click()

  const pendingRow = page.locator('tr', { hasText: title })
  await expect(pendingRow).toContainText('pending')

  await page.getByRole('button', { name: 'Logout' }).click()
  await page.getByRole('link', { name: 'Login' }).click()
  await page.getByLabel('Email').fill('admin@example.com')
  await page.getByLabel('Password').fill('AdminPass123!')
  await page.getByRole('button', { name: 'Sign In' }).click()

  await page.getByRole('link', { name: 'Admin' }).click()
  const adminRow = page.locator('tr', { hasText: title })
  await adminRow.getByRole('button', { name: 'Approve' }).click()
  await expect(adminRow).toContainText('approved')

  await page.getByRole('link', { name: 'Browse' }).click()
  await expect(page.locator('.event-card', { hasText: title })).toBeVisible()

  await page.getByLabel('Search').fill('no-match-value')
  await expect(page.getByRole('heading', { name: 'No events found' })).toBeVisible()
  await page.getByLabel('Search').fill(title)
  await expect(page.locator('.event-card', { hasText: title })).toBeVisible()
})
