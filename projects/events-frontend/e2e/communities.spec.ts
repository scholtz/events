import { test, expect } from '@playwright/test'
import {
  setupMockApi,
  makeAdminUser,
  makeContributorUser,
  makePublicGroup,
  makePrivateGroup,
  makeActiveMembership,
  makePendingMembership,
  makeApprovedEvent,
  makePendingReviewClaim,
  makeVerifiedClaim,
  makeExternalEventPreview,
  makeTechDomain,
  loginAs,
} from './helpers/mock-api'

// ── Communities list page ─────────────────────────────────────────────────────

test.describe('Communities list page', () => {
  test('shows public groups without authentication', async ({ page }) => {
    const state = setupMockApi(page)
    state.communityGroups.push(makePublicGroup())
    state.communityGroups.push(makePrivateGroup())

    await page.goto('/communities')
    await expect(page.getByRole('heading', { name: 'Community Groups', exact: true })).toBeVisible()
    // Public group is shown
    await expect(page.getByText('Prague Crypto Circle')).toBeVisible()
    // Private group NOT shown to unauthenticated user
    await expect(page.getByText('Secret Builders Guild')).toBeHidden()
  })

  test('shows empty state when no groups exist', async ({ page }) => {
    setupMockApi(page)
    await page.goto('/communities')
    await expect(page.getByText('No community groups yet')).toBeVisible()
  })

  test('group card links to detail page', async ({ page }) => {
    const state = setupMockApi(page)
    state.communityGroups.push(makePublicGroup())

    await page.goto('/communities')
    await page.getByText('Prague Crypto Circle').click()
    await expect(page).toHaveURL(/\/community\/prague-crypto-circle/)
  })

  test('shows Create Community button for authenticated user', async ({ page }) => {
    const admin = makeAdminUser()
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(makePublicGroup())

    await loginAs(page, admin)
    await page.goto('/communities')
    await expect(page.getByRole('button', { name: 'Create Community' })).toBeVisible()
  })

  test('authenticated user can create a public community group', async ({ page }) => {
    const admin = makeAdminUser()
    const state = setupMockApi(page)
    state.users.push(admin)

    await loginAs(page, admin)
    await page.goto('/communities')

    await page.getByRole('button', { name: 'Create Community' }).click()
    await page.getByLabel('Community name').fill('My New Community')
    // Trigger auto-slug via blur
    await page.getByLabel('Community name').blur()
    await page.getByLabel('URL slug').fill('my-new-community')
    await page.getByLabel('Short summary').fill('A brand new community')
    await page.getByLabel('Visibility').selectOption('PUBLIC')
    // Scope to form-actions to avoid strict-mode conflict with the toggle button
    await page.locator('.form-actions').getByRole('button', { name: 'Create Community' }).click()

    // The group appears in the list
    await expect(page.getByText('My New Community')).toBeVisible()
  })

  test('shows error when slug is already taken', async ({ page }) => {
    const admin = makeAdminUser()
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(makePublicGroup({ slug: 'taken-slug' }))

    await loginAs(page, admin)
    await page.goto('/communities')

    await page.getByRole('button', { name: 'Create Community' }).click()
    await page.getByLabel('Community name').fill('Another Group')
    // clear() ensures autoSlug-generated value is removed before fill() sets the slug
    await page.getByLabel('URL slug').clear()
    await page.getByLabel('URL slug').fill('taken-slug')
    // Scope to form-actions to avoid strict-mode conflict with the toggle button
    await page.locator('.form-actions').getByRole('button', { name: 'Create Community' }).click()

    await expect(page.locator('.error-banner')).toContainText(/already taken/i)
  })
})

// ── Community detail page ─────────────────────────────────────────────────────

test.describe('Community detail page - public group', () => {
  test('shows group name and member count', async ({ page }) => {
    const admin = makeAdminUser()
    const state = setupMockApi(page)
    state.users.push(admin)
    const group = makePublicGroup()
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))

    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByRole('heading', { name: 'Prague Crypto Circle' })).toBeVisible()
    await expect(page.getByText('1 member')).toBeVisible()
    await expect(page.getByText('Public')).toBeVisible()
  })

  test('shows summary description', async ({ page }) => {
    const state = setupMockApi(page)
    state.communityGroups.push(makePublicGroup())

    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByText('A community for crypto enthusiasts in Prague.')).toBeVisible()
  })

  test('shows sign-in prompt for unauthenticated user', async ({ page }) => {
    const state = setupMockApi(page)
    state.communityGroups.push(makePublicGroup())

    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByText(/sign in to join/i)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
  })

  test('shows Join button for authenticated non-member', async ({ page }) => {
    const contributor = makeContributorUser()
    const state = setupMockApi(page)
    state.users.push(contributor)
    state.communityGroups.push(makePublicGroup())

    await loginAs(page, contributor)
    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByRole('button', { name: 'Join' })).toBeVisible()
  })

  test('authenticated user can join a public group', async ({ page }) => {
    const contributor = makeContributorUser()
    const state = setupMockApi(page)
    state.users.push(contributor)
    state.communityGroups.push(makePublicGroup())

    await loginAs(page, contributor)
    await page.goto('/community/prague-crypto-circle')
    await page.getByRole('button', { name: 'Join' }).click()
    await expect(page.getByText('Joined')).toBeVisible()
  })

  test('shows Joined badge for existing member', async ({ page }) => {
    const contributor = makeContributorUser()
    const state = setupMockApi(page)
    state.users.push(contributor)
    const group = makePublicGroup()
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, contributor.id))

    await loginAs(page, contributor)
    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByText('Joined')).toBeVisible()
  })

  test('shows not-found state for unknown slug', async ({ page }) => {
    setupMockApi(page)
    await page.goto('/community/does-not-exist')
    await expect(page.getByText('Community not found')).toBeVisible()
  })

  test('shows associated published events', async ({ page }) => {
    const state = setupMockApi(page)
    state.communityGroups.push(makePublicGroup())
    state.events.push(makeApprovedEvent({ name: 'Crypto Summit 2026' }))

    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByText('Community Events')).toBeVisible()
    await expect(page.getByText('Crypto Summit 2026')).toBeVisible()
  })

  test('shows empty events state when no events associated', async ({ page }) => {
    const state = setupMockApi(page)
    state.communityGroups.push(makePublicGroup())

    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByText('No events yet')).toBeVisible()
  })
})

// ── Private group access ──────────────────────────────────────────────────────

test.describe('Community detail page - private group', () => {
  test('shows private notice for unauthenticated user', async ({ page }) => {
    const state = setupMockApi(page)
    state.communityGroups.push(makePrivateGroup())

    await page.goto('/community/secret-builders-guild')
    // Use getByRole to avoid strict-mode: "Private Community" appears in summary and description too
    await expect(page.getByRole('heading', { name: 'Private Community' })).toBeVisible()
    // Use .private-notice to scope: description contains "request access" as a substring
    await expect(page.locator('.private-notice')).toContainText(/request access/i)
  })

  test('shows Request Access button for authenticated non-member', async ({ page }) => {
    const contributor = makeContributorUser()
    const state = setupMockApi(page)
    state.users.push(contributor)
    state.communityGroups.push(makePrivateGroup())

    await loginAs(page, contributor)
    await page.goto('/community/secret-builders-guild')
    await expect(page.getByRole('button', { name: 'Request Access' })).toBeVisible()
  })

  test('authenticated user can request membership in private group', async ({ page }) => {
    const contributor = makeContributorUser()
    const state = setupMockApi(page)
    state.users.push(contributor)
    state.communityGroups.push(makePrivateGroup())

    await loginAs(page, contributor)
    await page.goto('/community/secret-builders-guild')
    await page.getByRole('button', { name: 'Request Access' }).click()
    await expect(page.getByText('Your membership request has been sent')).toBeVisible()
    await expect(page.getByText('Pending approval')).toBeVisible()
  })

  test('shows pending state for already-requested membership', async ({ page }) => {
    const contributor = makeContributorUser()
    const state = setupMockApi(page)
    state.users.push(contributor)
    const group = makePrivateGroup()
    state.communityGroups.push(group)
    state.communityMemberships.push(makePendingMembership(group.id, contributor.id))

    await loginAs(page, contributor)
    await page.goto('/community/secret-builders-guild')
    await expect(page.getByText('Pending approval')).toBeVisible()
  })
})

// ── Admin member management ───────────────────────────────────────────────────

test.describe('Community detail page - admin member management', () => {
  test('admin sees Pending Requests section', async ({ page }) => {
    const admin = makeAdminUser()
    const contributor = makeContributorUser()
    const state = setupMockApi(page)
    state.users.push(admin, contributor)
    const group = makePrivateGroup()
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.communityMemberships.push(makePendingMembership(group.id, contributor.id))

    await loginAs(page, admin)
    await page.goto('/community/secret-builders-guild')
    await expect(page.getByText('Pending Requests')).toBeVisible()
    await expect(page.getByText('Contributor User')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reject' })).toBeVisible()
  })

  test('admin can approve a pending membership request', async ({ page }) => {
    const admin = makeAdminUser()
    const contributor = makeContributorUser()
    const state = setupMockApi(page)
    state.users.push(admin, contributor)
    const group = makePrivateGroup()
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    const pending = makePendingMembership(group.id, contributor.id)
    state.communityMemberships.push(pending)

    await loginAs(page, admin)
    await page.goto('/community/secret-builders-guild')
    await page.getByRole('button', { name: 'Approve' }).click()

    // After approval, the pending member moves to active members
    await expect(page.getByText('Members')).toBeVisible()
    await expect(page.getByText('Contributor User')).toBeVisible()
  })

  test('admin can reject a pending membership request', async ({ page }) => {
    const admin = makeAdminUser()
    const contributor = makeContributorUser()
    const state = setupMockApi(page)
    state.users.push(admin, contributor)
    const group = makePrivateGroup()
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.communityMemberships.push(makePendingMembership(group.id, contributor.id))

    await loginAs(page, admin)
    await page.goto('/community/secret-builders-guild')
    await page.getByRole('button', { name: 'Reject' }).click()

    // The contributor is no longer in pending list
    await expect(page.getByText('No pending membership requests.')).toBeVisible()
  })

  test('admin sees Members section with active members', async ({ page }) => {
    const admin = makeAdminUser()
    const contributor = makeContributorUser()
    const state = setupMockApi(page)
    state.users.push(admin, contributor)
    const group = makePublicGroup()
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.communityMemberships.push(makeActiveMembership(group.id, contributor.id, 'MEMBER'))

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')
    // Use getByRole heading to avoid matching "members" in "2 members" count and in "membership requests"
    await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible()
    await expect(page.getByText('Contributor User')).toBeVisible()
    // Use role badge locator to avoid matching "Member" in <option> elements
    await expect(page.locator('.member-role-badge', { hasText: 'Member' })).toBeVisible()
  })

  test('admin can change member role to Event Manager', async ({ page }) => {
    const admin = makeAdminUser()
    const contributor = makeContributorUser()
    const state = setupMockApi(page)
    state.users.push(admin, contributor)
    const group = makePublicGroup()
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    const memberMembership = makeActiveMembership(group.id, contributor.id, 'MEMBER')
    state.communityMemberships.push(memberMembership)

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    // Change role using the select dropdown in the member row
    const roleSelect = page.locator('.role-select').first()
    await roleSelect.selectOption('EVENT_MANAGER')

    // The role badge updates — scope to .member-role-badge to avoid matching <option> elements
    await expect(page.locator('.member-role-badge', { hasText: 'Event Manager' })).toBeVisible()
  })

  test('admin can remove a member', async ({ page }) => {
    const admin = makeAdminUser()
    const contributor = makeContributorUser()
    const state = setupMockApi(page)
    state.users.push(admin, contributor)
    const group = makePublicGroup()
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.communityMemberships.push(makeActiveMembership(group.id, contributor.id, 'MEMBER'))

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByText('Contributor User')).toBeVisible()

    // Click the Remove button for the contributor
    await page.locator('.member-row', { hasText: 'Contributor User' }).getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText('Contributor User')).toBeHidden()
  })

  test('non-admin does not see admin panel', async ({ page }) => {
    const contributor = makeContributorUser()
    const state = setupMockApi(page)
    state.users.push(contributor)
    const group = makePublicGroup()
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, contributor.id, 'MEMBER'))

    await loginAs(page, contributor)
    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByText('Pending Requests')).toBeHidden()
    await expect(page.locator('.role-select')).toBeHidden()
  })
})

// ── Nav link ──────────────────────────────────────────────────────────────────

test.describe('Communities nav link', () => {
  test('header contains Communities link', async ({ page }) => {
    setupMockApi(page)
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Communities', exact: true })).toBeVisible()
  })

  test('Communities nav link navigates to /communities', async ({ page }) => {
    setupMockApi(page)
    await page.goto('/')
    await page.getByRole('link', { name: 'Communities', exact: true }).click()
    await expect(page).toHaveURL('/communities')
  })
})

// ── External source claims ────────────────────────────────────────────────────

test.describe('External source claims (admin)', () => {
  test('admin sees Connected External Sources section', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByRole('heading', { name: 'Connected External Sources' })).toBeVisible()
  })

  test('shows empty state when no external sources connected', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')
    await expect(page.locator('.empty-sources')).toBeVisible()
    await expect(page.getByText('No external sources connected yet.')).toBeVisible()
  })

  test('shows existing external source claims with status badge', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makePendingReviewClaim(group.id)
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')
    await expect(page.locator('.source-type-badge', { hasText: 'MEETUP' })).toBeVisible()
    await expect(page.locator('.claim-status-badge', { hasText: 'Pending review' })).toBeVisible()
  })

  test('shows verified claim with Preview & Import button enabled', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makeVerifiedClaim(group.id)
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')
    await expect(page.locator('.claim-status-badge', { hasText: 'Verified' })).toBeVisible()
    const previewBtn = page.getByRole('button', { name: 'Preview & Import' }).first()
    await expect(previewBtn).toBeEnabled()
  })

  test('shows Preview & Import disabled for pending-review claim', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makePendingReviewClaim(group.id)
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')
    const previewBtn = page.getByRole('button', { name: 'Preview & Import' }).first()
    await expect(previewBtn).toBeDisabled()
  })

  test('admin can add a valid Meetup source claim', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await page.locator('#new-source-type').selectOption('MEETUP')
    await page.locator('#new-source-url').fill('https://www.meetup.com/my-test-group')
    await page.getByRole('button', { name: 'Add Source' }).click()

    await expect(page.locator('.source-type-badge', { hasText: 'MEETUP' })).toBeVisible()
    await expect(page.locator('.claim-status-badge', { hasText: 'Pending review' })).toBeVisible()
  })

  test('shows error for invalid Meetup URL format', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await page.locator('#new-source-type').selectOption('MEETUP')
    await page.locator('#new-source-url').fill('https://lu.ma/wrong-platform')
    await page.getByRole('button', { name: 'Add Source' }).click()

    await expect(page.locator('.error-banner')).toBeVisible()
  })

  test('admin can add a valid Luma source claim', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await page.locator('#new-source-type').selectOption('LUMA')
    await page.locator('#new-source-url').fill('https://lu.ma/my-luma-community')
    await page.getByRole('button', { name: 'Add Source' }).click()

    await expect(page.locator('.source-type-badge', { hasText: 'LUMA' })).toBeVisible()
  })

  test('admin can remove an external source claim', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makePendingReviewClaim(group.id)
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await expect(page.locator('.source-row')).toHaveCount(1)
    // First click shows the inline confirmation dialog
    await page.locator('.source-row').getByRole('button', { name: 'Remove' }).click()
    await expect(page.locator('.remove-confirm')).toBeVisible()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    // Confirm the removal
    await page.locator('.remove-confirm').getByRole('button', { name: 'Remove' }).click()
    await expect(page.locator('.source-row')).toHaveCount(0)
    await expect(page.locator('.empty-sources')).toBeVisible()
  })

  test('remove confirmation dialog can be cancelled', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makePendingReviewClaim(group.id)
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await expect(page.locator('.source-row')).toHaveCount(1)
    await page.locator('.source-row').getByRole('button', { name: 'Remove' }).click()
    await expect(page.locator('.remove-confirm')).toBeVisible()
    // Cancel — source should still be there
    await page.locator('.remove-confirm').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.locator('.remove-confirm')).toBeHidden()
    await expect(page.locator('.source-row')).toHaveCount(1)
  })

  test('rejected claim shows rejection note to community admin', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makePendingReviewClaim(group.id, {
      status: 'REJECTED',
      adminNote: 'We could not verify ownership of this Meetup group.',
    })
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await expect(page.locator('.rejection-note')).toBeVisible()
    await expect(page.locator('.rejection-note')).toContainText(
      'We could not verify ownership of this Meetup group.',
    )
  })

  test('rejected claim without note shows generic rejection message', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makePendingReviewClaim(group.id, { status: 'REJECTED', adminNote: null })
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await expect(page.locator('.rejection-note')).toBeVisible()
    await expect(page.locator('.rejection-note')).toContainText(
      'This claim was rejected by the platform administrator.',
    )
  })

  test('admin can trigger sync on a verified claim and sees result', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makeVerifiedClaim(group.id)
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)
    state.externalEventPreviews[claim.id] = []

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await page.getByRole('button', { name: 'Preview & Import' }).first().click()
    // Preview panel opens and shows empty state since no candidates
    await expect(page.locator('.preview-panel')).toBeVisible()
    await expect(page.locator('.preview-empty')).toBeVisible()
  })

  test('preview panel shows candidate events with importable and already-imported flags', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makeVerifiedClaim(group.id)
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)
    state.externalEventPreviews[claim.id] = [
      makeExternalEventPreview({ externalId: 'evt-001', name: 'Eligible Event Alpha' }),
      makeExternalEventPreview({
        externalId: 'evt-002',
        name: 'Already Imported Event',
        alreadyImported: true,
        isImportable: false,
        importBlockReason: 'Already imported.',
      }),
      makeExternalEventPreview({
        externalId: 'evt-003',
        name: 'Non-importable Event',
        startsAtUtc: null,
        isImportable: false,
        importBlockReason: 'Missing start time — cannot import.',
      }),
    ]

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await page.getByRole('button', { name: 'Preview & Import' }).first().click()
    await expect(page.locator('.preview-panel')).toBeVisible()

    // All three candidates are shown
    const rows = page.locator('.preview-candidate-row')
    await expect(rows).toHaveCount(3)

    // Importable event has enabled checkbox
    const importableRow = rows.filter({ hasText: 'Eligible Event Alpha' })
    await expect(importableRow.locator('input[type="checkbox"]')).toBeEnabled()

    // Already-imported event shows badge and disabled checkbox
    const alreadyRow = rows.filter({ hasText: 'Already Imported Event' })
    await expect(alreadyRow.locator('.already-imported-badge')).toBeVisible()
    await expect(alreadyRow.locator('input[type="checkbox"]')).toBeDisabled()

    // Non-importable shows block reason and disabled checkbox
    const blockRow = rows.filter({ hasText: 'Non-importable Event' })
    await expect(blockRow.locator('.not-importable-badge')).toBeVisible()
    await expect(blockRow.locator('input[type="checkbox"]')).toBeDisabled()
  })

  test('admin can select events and import them', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makeVerifiedClaim(group.id)
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)
    state.externalEventPreviews[claim.id] = [
      makeExternalEventPreview({ externalId: 'evt-001', name: 'Event to Import' }),
    ]

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await page.getByRole('button', { name: 'Preview & Import' }).first().click()
    await expect(page.locator('.preview-panel')).toBeVisible()

    // Check the checkbox for the importable event
    const checkbox = page.locator('.preview-candidate-row').locator('input[type="checkbox"]').first()
    await checkbox.check()

    // Import button shows count=1 and is enabled
    const importBtn = page.locator('.preview-footer').getByRole('button', { name: /Import 1/ })
    await expect(importBtn).toBeEnabled()
    await importBtn.click()

    // After import, the event is now marked as already imported
    const rows = page.locator('.preview-candidate-row')
    await expect(rows.filter({ hasText: 'Event to Import' }).locator('.already-imported-badge')).toBeVisible()
  })

  test('preview panel shows moderation notice', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makeVerifiedClaim(group.id)
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)
    state.externalEventPreviews[claim.id] = [makeExternalEventPreview()]

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await page.getByRole('button', { name: 'Preview & Import' }).first().click()
    await expect(page.locator('.preview-moderation-notice')).toBeVisible()
    await expect(page.locator('.preview-moderation-notice')).toContainText('Pending Approval')
  })

  test('preview panel can be closed with Close button', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makeVerifiedClaim(group.id)
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)
    state.externalEventPreviews[claim.id] = []

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await page.getByRole('button', { name: 'Preview & Import' }).first().click()
    await expect(page.locator('.preview-panel')).toBeVisible()

    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.locator('.preview-panel')).toBeHidden()
  })

  test('select all importable selects only eligible events', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makeVerifiedClaim(group.id)
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)
    state.externalEventPreviews[claim.id] = [
      makeExternalEventPreview({ externalId: 'evt-001', name: 'Importable A' }),
      makeExternalEventPreview({ externalId: 'evt-002', name: 'Importable B' }),
      makeExternalEventPreview({
        externalId: 'evt-003',
        name: 'Already Done',
        alreadyImported: true,
        isImportable: false,
        importBlockReason: 'Already imported.',
      }),
    ]

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await page.getByRole('button', { name: 'Preview & Import' }).first().click()
    await expect(page.locator('.preview-panel')).toBeVisible()

    await page.getByRole('button', { name: 'Select all importable' }).click()

    // Import button should say "Import 2 selected"
    await expect(page.locator('.preview-footer').getByRole('button', { name: /Import 2/ })).toBeVisible()
  })

  test('import footer note explains pending approval', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makeVerifiedClaim(group.id)
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)
    state.externalEventPreviews[claim.id] = [makeExternalEventPreview()]

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await page.getByRole('button', { name: 'Preview & Import' }).first().click()
    await expect(page.locator('.import-footer-note')).toBeVisible()
    await expect(page.locator('.import-footer-note')).toContainText('moderation')
  })

  test('non-admin does not see external sources section', async ({ page }) => {
    const admin = makeAdminUser()
    const contributor = makeContributorUser()
    const group = makePublicGroup()
    const state = setupMockApi(page)
    state.users.push(admin, contributor)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, contributor.id, 'MEMBER'))

    await loginAs(page, contributor)
    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByRole('heading', { name: 'Connected External Sources' })).toBeHidden()
  })

  test('unauthenticated user does not see external sources section', async ({ page }) => {
    const group = makePublicGroup()
    const state = setupMockApi(page)
    state.communityGroups.push(group)

    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByRole('heading', { name: 'Connected External Sources' })).toBeHidden()
  })
})

// ── Event manager role – manage community events ──────────────────────────────

test.describe('Event manager – manage community events', () => {
  test('event manager sees Manage Community Events section', async ({ page }) => {
    const contributor = makeContributorUser()
    const group = makePublicGroup()
    const state = setupMockApi(page)
    state.users.push(contributor)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, contributor.id, 'EVENT_MANAGER'))

    await loginAs(page, contributor)
    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByRole('heading', { name: 'Manage Community Events' })).toBeVisible()
  })

  test('regular member does not see Manage Community Events section', async ({ page }) => {
    const contributor = makeContributorUser()
    const group = makePublicGroup()
    const state = setupMockApi(page)
    state.users.push(contributor)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, contributor.id, 'MEMBER'))

    await loginAs(page, contributor)
    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByRole('heading', { name: 'Manage Community Events' })).toBeHidden()
  })

  test('unauthenticated user does not see Manage Community Events section', async ({ page }) => {
    const group = makePublicGroup()
    const state = setupMockApi(page)
    state.communityGroups.push(group)

    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByRole('heading', { name: 'Manage Community Events' })).toBeHidden()
  })

  test('admin sees Manage Community Events section', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByRole('heading', { name: 'Manage Community Events' })).toBeVisible()
  })

  test('event manager can associate a published event by slug', async ({ page }) => {
    const contributor = makeContributorUser()
    const group = makePublicGroup()
    const event = makeApprovedEvent({ name: 'Blockchain Summit', slug: 'blockchain-summit' })
    const state = setupMockApi(page)
    state.users.push(contributor)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, contributor.id, 'EVENT_MANAGER'))
    state.events.push(event)

    await loginAs(page, contributor)
    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByRole('heading', { name: 'Manage Community Events' })).toBeVisible()
    await page.getByLabel('Event slug').fill('blockchain-summit')
    await page.getByRole('button', { name: 'Add event to community' }).click()
    await expect(page.locator('.success-msg')).toContainText(/Event added to community/i)
  })

  test('admin can remove an event from the community', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const event = makeApprovedEvent({ name: 'AI Meetup Prague', slug: 'ai-meetup-prague' })
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.events.push(event)
    state.communityGroupEvents.push({ groupId: group.id, eventId: event.id })

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByText('AI Meetup Prague')).toBeVisible()
    await page.getByRole('button', { name: 'Remove from community' }).first().click()
    await expect(page.getByText('AI Meetup Prague')).toBeHidden()
  })
})

// ── Error state ───────────────────────────────────────────────────────────────

test.describe('Community detail – error state', () => {
  test('shows error state when API fails to load community', async ({ page }) => {
    setupMockApi(page)
    await page.route('**/graphql', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}')
      if (body.query?.includes('CommunityGroupBySlug')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'Internal server error' }] }),
        })
      } else {
        await route.fallback()
      }
    })
    await page.goto('/community/prague-crypto-circle')
    await expect(page.locator('.error-state')).toBeVisible()
  })
})

// ── Mobile viewport ───────────────────────────────────────────────────────────

test.describe('Community pages – mobile viewport', () => {
  test('community list page is usable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const state = setupMockApi(page)
    state.communityGroups.push(makePublicGroup())
    await page.goto('/communities')
    await expect(page.getByRole('heading', { name: 'Community Groups', exact: true })).toBeVisible()
    await expect(page.getByText('Prague Crypto Circle')).toBeVisible()
  })

  test('community detail page is usable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const group = makePublicGroup()
    const state = setupMockApi(page)
    state.communityGroups.push(group)
    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByRole('heading', { name: 'Prague Crypto Circle' })).toBeVisible()
    await expect(page.getByText('Community Events')).toBeVisible()
  })

  test('admin panel is accessible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByRole('heading', { name: 'Pending Requests' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible()
  })
})

// ── SEO: page titles ──────────────────────────────────────────────────────────

test.describe('Community pages – SEO page titles', () => {
  test('communities list page sets document title', async ({ page }) => {
    setupMockApi(page)
    await page.goto('/communities')
    await expect(page).toHaveTitle('Community Groups')
  })

  test('community detail page sets document title to group name', async ({ page }) => {
    const group = makePublicGroup({ name: 'Prague Crypto Circle' })
    const state = setupMockApi(page)
    state.communityGroups.push(group)
    await page.goto('/community/prague-crypto-circle')
    await expect(page.getByRole('heading', { name: 'Prague Crypto Circle' })).toBeVisible()
    await expect(page).toHaveTitle('Prague Crypto Circle | Communities')
  })

  test('community detail page falls back to default title when group is not found', async ({
    page,
  }) => {
    setupMockApi(page)
    await page.goto('/community/does-not-exist')
    await expect(page).toHaveTitle('Communities')
  })
})

// ── i18n: community pages ─────────────────────────────────────────────────────

test.describe('Community pages – i18n', () => {
  test('communities list heading is localised in Slovak', async ({ page }) => {
    const state = setupMockApi(page)
    state.communityGroups.push(makePublicGroup())
    await page.goto('/communities')
    await page.locator('#language-select').selectOption('sk')
    await expect(page.getByRole('heading', { name: 'Komunitné skupiny', exact: true })).toBeVisible()
  })

  test('communities list heading is localised in German', async ({ page }) => {
    const state = setupMockApi(page)
    state.communityGroups.push(makePublicGroup())
    await page.goto('/communities')
    await page.locator('#language-select').selectOption('de')
    await expect(page.getByRole('heading', { name: 'Community-Gruppen', exact: true })).toBeVisible()
  })

  test('join button is localised in Slovak', async ({ page }) => {
    const contributor = makeContributorUser()
    const group = makePublicGroup()
    const state = setupMockApi(page)
    state.users.push(contributor)
    state.communityGroups.push(group)
    await loginAs(page, contributor)
    await page.goto('/community/prague-crypto-circle')
    await page.locator('#language-select').selectOption('sk')
    await expect(page.getByRole('button', { name: 'Pripojiť sa' })).toBeVisible()
  })

  test('manage events heading is localised in German for event manager', async ({ page }) => {
    const contributor = makeContributorUser()
    const group = makePublicGroup()
    const state = setupMockApi(page)
    state.users.push(contributor)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, contributor.id, 'EVENT_MANAGER'))
    await loginAs(page, contributor)
    await page.goto('/community/prague-crypto-circle')
    await page.locator('#language-select').selectOption('de')
    await expect(page.getByRole('heading', { name: 'Community-Veranstaltungen verwalten' })).toBeVisible()
  })
})

// ── Submit event with community group ─────────────────────────────────────────

test.describe('Submit event with community group selection', () => {
  test('event manager sees community group selector on submit form', async ({ page }) => {
    const contributor = makeContributorUser()
    const group = makePublicGroup()
    const state = setupMockApi(page)
    state.domains.push(makeTechDomain())
    state.users.push(contributor)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, contributor.id, 'EVENT_MANAGER'))

    await loginAs(page, contributor)
    await page.goto('/submit')

    // The community group selector should be visible because the user manages a group
    await expect(page.getByLabel('Community Group')).toBeVisible()
    // The default is "No community"
    await expect(page.getByLabel('Community Group')).toHaveValue('')
  })

  test('regular user without managed groups does not see community group selector', async ({ page }) => {
    const contributor = makeContributorUser()
    // contributor is a plain MEMBER — no admin/event-manager role
    const group = makePublicGroup()
    const state = setupMockApi(page)
    state.domains.push(makeTechDomain())
    state.users.push(contributor)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, contributor.id, 'MEMBER'))

    await loginAs(page, contributor)
    await page.goto('/submit')

    // Selector must not be shown when user has no admin/event-manager memberships
    await expect(page.locator('#event-community-group')).toBeHidden()
  })

  test('event manager can submit event for their community group', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const domain = makeTechDomain()
    const state = setupMockApi(page)
    state.domains.push(domain)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))

    await loginAs(page, admin)
    await page.goto('/submit')

    // Fill step 1 — Basic Info
    await page.locator('#event-title').fill('Community Test Event')
    await page.locator('#event-description').fill('An event submitted for the community.')
    await page.locator('#event-domain').selectOption(domain.slug)
    // Select the community group
    await page.getByLabel('Community Group').selectOption(group.id)

    // Advance through remaining steps quickly using "Next"
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 2 — Date & Time: fill required start date
    await page.locator('#event-date').fill('2026-12-01')
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 3 — Pricing: free by default, just continue
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 4 — Location: optional, continue
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 5 — Event link: required
    await page.locator('#event-link').fill('https://example.com/community-test-event')
    await page.getByRole('button', { name: 'Submit Event' }).click()

    // After submission, should show success message
    await expect(page.getByRole('heading', { name: 'Event Submitted!' })).toBeVisible()

    // The event must be linked to the community group in mock state
    expect(
      state.communityGroupEvents.some((cge) => cge.groupId === group.id),
    ).toBe(true)
  })
})

// ── Auto-sync and sync health UI ──────────────────────────────────────────────

test.describe('External sources – sync health and auto-sync controls', () => {
  test('shows "Never synced" when claim has no sync history', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makeVerifiedClaim(group.id, { lastSyncAtUtc: null, lastSyncSucceededAtUtc: null })
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await expect(page.locator('.last-sync-text')).toContainText('Never synced')
  })

  test('shows last successful sync date when claim has succeeded', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const successDate = new Date(2025, 2, 15).toISOString()
    const claim = makeVerifiedClaim(group.id, {
      lastSyncAtUtc: successDate,
      lastSyncSucceededAtUtc: successDate,
      lastSyncError: null,
    })
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await expect(page.locator('.last-sync-text')).toContainText('Last successful sync')
  })

  test('shows error text when last sync had errors', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makeVerifiedClaim(group.id, {
      lastSyncAtUtc: new Date().toISOString(),
      lastSyncSucceededAtUtc: null,
      lastSyncError: 'Failed to fetch events from Meetup: 404',
    })
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await expect(page.locator('.sync-error-text')).toContainText('Failed to fetch events from Meetup')
  })

  test('shows auto-sync on badge for verified claim with isAutoSyncEnabled=true', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makeVerifiedClaim(group.id, { isAutoSyncEnabled: true })
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await expect(page.locator('.auto-sync-badge.auto-sync-on')).toBeVisible()
    await expect(page.locator('.auto-sync-badge')).toContainText('Auto-sync on')
  })

  test('shows auto-sync off badge when isAutoSyncEnabled=false', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makeVerifiedClaim(group.id, { isAutoSyncEnabled: false })
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await expect(page.locator('.auto-sync-badge.auto-sync-off')).toBeVisible()
    await expect(page.locator('.auto-sync-badge')).toContainText('Auto-sync off')
  })

  test('admin can toggle auto-sync off via Disable auto-sync button', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makeVerifiedClaim(group.id, { isAutoSyncEnabled: true })
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await expect(page.locator('.auto-sync-badge.auto-sync-on')).toBeVisible()
    await page.getByRole('button', { name: 'Disable auto-sync' }).click()

    await expect(page.locator('.auto-sync-badge.auto-sync-off')).toBeVisible()
    expect(state.externalSourceClaims.find((c) => c.id === claim.id)?.isAutoSyncEnabled).toBe(false)
  })

  test('admin can toggle auto-sync on via Enable auto-sync button', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makeVerifiedClaim(group.id, { isAutoSyncEnabled: false })
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await expect(page.locator('.auto-sync-badge.auto-sync-off')).toBeVisible()
    await page.getByRole('button', { name: 'Enable auto-sync' }).click()

    await expect(page.locator('.auto-sync-badge.auto-sync-on')).toBeVisible()
    expect(state.externalSourceClaims.find((c) => c.id === claim.id)?.isAutoSyncEnabled).toBe(true)
  })

  test('admin can trigger Sync Now and sees result summary', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makeVerifiedClaim(group.id, { lastSyncAtUtc: null })
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await page.getByRole('button', { name: /Sync Now/i }).first().click()

    await expect(page.locator('.sync-result-badge')).toBeVisible()
    await expect(page.locator('.sync-result-badge')).toContainText('Imported 0 events')
  })

  test('Sync Now button is disabled for pending-review claim', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makePendingReviewClaim(group.id)
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    const syncBtn = page.getByRole('button', { name: /Sync Now/i }).first()
    await expect(syncBtn).toBeDisabled()
  })

  test('auto-sync badge not shown for pending-review claim', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makePendingReviewClaim(group.id)
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    await expect(page.locator('.auto-sync-badge')).toBeHidden()
  })
})


// ── Sync workflow: realistic admin journey ────────────────────────────────────

test.describe('External sources – full admin sync workflow', () => {
  test('admin can view a verified claim sync status and trigger manual sync', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makeVerifiedClaim(group.id, {
      lastSyncAtUtc: null,
      lastSyncSucceededAtUtc: null,
      lastSyncError: null,
    })
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    // Wait for the external sources section to load before scoping into the source row
    await expect(page.locator('.source-row')).toHaveCount(1)

    // Verify initial "Never synced" status renders
    const sourceCard = page.locator('.source-row').first()
    await expect(sourceCard.locator('.last-sync-text')).toContainText('Never synced')

    // Trigger sync via the button scoped to the same source row
    await sourceCard.getByRole('button', { name: /Sync Now/i }).click()
    await expect(sourceCard.locator('.sync-result-badge')).toBeVisible()
    await expect(sourceCard.locator('.sync-result-badge')).toContainText('Imported 0 events')
  })

  test('admin sees error when sync fails and can retry successfully', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makeVerifiedClaim(group.id, {
      lastSyncAtUtc: null,
      lastSyncSucceededAtUtc: null,
      lastSyncError: null,
    })
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)

    // Inject a transient failure for the first sync call
    state.forceSyncError = true

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    // Wait for the external sources section to load before scoping into the source row
    await expect(page.locator('.source-row')).toHaveCount(1)

    const sourceCard = page.locator('.source-row').first()

    // First sync attempt — expect error message to appear scoped to this source
    await sourceCard.getByRole('button', { name: /Sync Now/i }).click()
    await expect(sourceCard.locator('.sync-error-text')).toBeVisible()
    await expect(sourceCard.locator('.sync-error-text')).toContainText('Sync failed')

    // forceSyncError was auto-reset; second attempt succeeds
    await sourceCard.getByRole('button', { name: /Sync Now/i }).click()
    await expect(sourceCard.locator('.sync-result-badge')).toBeVisible()
    await expect(sourceCard.locator('.sync-result-badge')).toContainText('Imported 0 events')
  })

  test('admin can disable auto-sync and then re-enable it in one session', async ({ page }) => {
    const admin = makeAdminUser()
    const group = makePublicGroup()
    const claim = makeVerifiedClaim(group.id, { isAutoSyncEnabled: true })
    const state = setupMockApi(page)
    state.users.push(admin)
    state.communityGroups.push(group)
    state.communityMemberships.push(makeActiveMembership(group.id, admin.id, 'ADMIN'))
    state.externalSourceClaims.push(claim)

    await loginAs(page, admin)
    await page.goto('/community/prague-crypto-circle')

    // Disable auto-sync
    await expect(page.locator('.auto-sync-badge.auto-sync-on')).toBeVisible()
    await page.getByRole('button', { name: 'Disable auto-sync' }).click()
    await expect(page.locator('.auto-sync-badge.auto-sync-off')).toBeVisible()
    expect(state.externalSourceClaims.find((c) => c.id === claim.id)?.isAutoSyncEnabled).toBe(false)

    // Re-enable auto-sync
    await page.getByRole('button', { name: 'Enable auto-sync' }).click()
    await expect(page.locator('.auto-sync-badge.auto-sync-on')).toBeVisible()
    expect(state.externalSourceClaims.find((c) => c.id === claim.id)?.isAutoSyncEnabled).toBe(true)
  })
})
