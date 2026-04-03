# Biatec Events Platform Roadmap

## Vision

Biatec Events is building a domain-focused event platform for discovery, submission, moderation, and organizer insight. The product is strongest when it helps users find relevant events quickly, gives organizers a clean workflow for publishing and managing events, and lets communities grow around category-driven hubs such as crypto, AI, or other verticals.

The long-term direction remains the same:

- Make event discovery fast, trustworthy, and relevant
- Give organizers a practical publishing and analytics workflow
- Let category or domain owners curate their own event ecosystem
- Support multilingual audiences and international communities
- Stay privacy-first by exposing aggregate insights rather than attendee identities

### Tags

Events can be tagged. The tag is category and slug of the category name is served as the sub domain name. First user who creates a tag is his administrator. Tags can have multiple administrators assigned. Global administrators can change the tag administrators. Tag administrator approves if the event is displayed under the specific tag. For multilanguage support each slug permission is linked to the english tag permission. Tag administrator has also some limitted ability to modify the design of the website.

On event detail page is showned hyperlink to the domain name including the tag slug, for example crypto.events.biatec.io. Subdomain level event list page is dedicated to the slug so the design and UX is focused on this. Example of the tag may be for example the Prague Blockchain Week, and organizer of these multi event event enables the events at the dedicated website. 

### Community Groups

Users can create a community groups. Community group has community group administrators who can assign roles in the community group and can claim ownership of other event apps such as meetup or luma. Community group event manager can create events for the community. There must be clear view on list of the community event. The community group can be public or private. Users can request membership for private community group or can join directly the public community group.

The events created at other event apps can be synced into the biatec events platform by clicking the button on the frontend in community administration page. Backend app will load all luma or meetup linked group's events and create the events in the biatec events app.

## Product Reality Check

The codebase already implements a meaningful part of the platform. This roadmap reflects the current product instead of an aspirational blank slate.

### What exists today

- Public event discovery with filtering by category, location, date, attendance mode, price, language, and sort order
- Event detail pages with organizer context, location data, map support, and interested counts
- Favorites and saved searches for attendees
- Category landing pages and subdomain-aware domain catalogs
- Event submission and editing workflows for contributors
- Organizer dashboard with aggregate analytics and event-level insights
- Admin moderation workflow for approving, rejecting, and managing events and users
- JWT authentication with contributor and admin roles
- Progressive Web App support with offline-aware GraphQL query caching
- Multilingual frontend foundations with English, Slovak, and German locales
- Push notification subscriptions and event reminder infrastructure
- Add-to-calendar actions on event detail pages: ICS file download, Google Calendar deep-link, and Outlook.com deep-link, with graceful disabled state for events with incomplete scheduling data
- Server-side ICS endpoint (`GET /ics/{slug}`) for bookmarkable, no-JavaScript calendar exports of published events
- Privacy-safe calendar-intent analytics: aggregate add-to-calendar counts (by provider, 7-day and 30-day trends) visible in the organizer dashboard without exposing attendee identity
- Branded domain hub management: domain stewards can configure logos, banners, color accents, taglines, editorial overview content, curator attribution, featured events, and community links via a dedicated hub management UI at `/hub/:slug/manage`
- Category landing pages and subdomain hub pages surface domain branding and administrator-managed metadata, with graceful fallbacks when assets are absent
- Event detail pages show a domain hub context card linking back to the relevant category hub, including logo, description, and curator credit
- Hub management workflow respects current permission model: domain administrators manage only their own hub identity without requiring global admin access
- Community groups with full membership lifecycle: join, request, approve/reject
- Community group role management: OWNER, ADMIN, EVENT_MANAGER, MEMBER with server-side authorization
- Public and private group visibility with appropriate access controls for each
- Community-owned events: event managers can create or associate events on behalf of a community
- External event-source claims: Meetup and Luma source claims with preview-and-import workflow
- Community group management page at `/community/:slug` where administrators manage metadata, visibility, roles, and associated events
- Event submission flow allows event managers to associate a new event with a managed community group
- Event detail pages surface community group context with navigation back to the community page
- Platform-wide community group overview in the admin panel for global administrators
- Organizer dashboard shows community memberships and quick navigation to managed community groups

### What is not implemented yet

- Full sync from external event platforms such as Meetup or Luma (external source claims and preview are implemented; automated background sync is not)
- Comments, discussion forums, or real-time collaboration features
- Ticketing, subscriptions, or other monetization workflows

This roadmap focuses on extending the platform from the working baseline above.

## Current Platform Foundation

### Frontend

- Vue 3 with TypeScript and Vite
- Pinia for state management
- Vue Router for application navigation
- CSS custom properties with scoped component styles
- Playwright end-to-end coverage across discovery, auth, dashboard, admin, favorites, i18n, and PWA scenarios

### Backend

- ASP.NET Core targeting .NET 10
- Hot Chocolate GraphQL API
- Entity Framework Core with SQLite as the default storage engine
- JWT bearer authentication
- Kubernetes deployment manifests and automated test coverage

### Integration model

- Frontend talks to the backend through a lightweight fetch-based GraphQL client
- Public discovery and authenticated organizer/admin workflows share the same GraphQL API
- Domain and event moderation are first-class concepts in the data model
- Analytics are custom platform analytics, not third-party reporting glued on top

## Strategic Product Themes

### 1. Discovery That Feels Curated

The discovery experience is already one of the strongest parts of the product. The next step is to make it feel more intentional, more localized, and more domain-aware.

### Priorities

- Improve ranking and relevance so the best events surface first within a domain, city, or date window
- Strengthen category and subdomain landing pages so they feel like dedicated community hubs, not just filtered lists
- Expand filter quality where the data model already supports it, especially language, timezone, and richer venue context
- Improve empty, low-signal, and edge-case states so users always understand why results appear or do not appear
- Continue improving mobile discovery and event detail usability

### Why this matters

The platform vision depends on trust in discovery. If users can consistently find the right events for their city, language, category, and attendance mode, the platform becomes useful even before social or ecosystem features exist.

### 2. Organizer Workflow As A Core Product

The organizer journey is already more advanced than the original roadmap suggested. The platform now needs to deepen that workflow instead of treating it as a side feature.

### Priorities

- Keep event submission and editing fast, resilient, and mobile-friendly
- Improve draft handling, validation, and organizer guidance for incomplete or low-quality submissions
- Expand dashboard insights with clearer trend explanations and practical next actions for organizers
- Strengthen organizer-facing states for new users, low-data events, and multi-event contributors
- Make event lifecycle management clearer across draft, pending, published, and rejected states

### Why this matters

Better organizer tooling improves catalog quality. Strong discovery depends on strong submissions, good moderation, and useful feedback loops for contributors.

### 3. Domain-Centric Community Hubs

The roadmap should align more closely with the product's differentiator: domain and category ownership. Categories are not just tags. They are the beginning of community-specific event surfaces.

### Delivered

- Category landing pages and subdomain hub pages now render domain logos, banners, primary and accent colors, taglines, curator credits, editorial overviews, featured events, and community links.
- The hub management UI (`/hub/:slug/manage`) lets domain stewards configure all branding and metadata fields within validated, bounded controls.
- Event detail pages show a hub context card linking back to the relevant category hub.
- Domain administrators manage only their own hub without global admin permissions.

### Next priorities

- Deepen community-group ownership and event curation within hubs
- Support programmatic featured-event scheduling (e.g. time-windowed highlights)
- Keep event-to-domain linking consistent as new discovery surfaces are added

### Why this matters

This is the clearest path from a generic events catalog to a network of focused event ecosystems. It also aligns directly with the product vision around subdomain-driven experiences.

### 4. Analytics That Help People Act

Organizer analytics already exist and should now become more actionable and more trustworthy, not just more extensive.

### Priorities

- Keep all analytics aggregate-only and privacy-safe
- Improve metric clarity so organizers understand what each number represents and what period it covers
- Add more guidance for low-volume and empty states so analytics remain useful when events are new or niche
- Expand discovery and engagement analytics only where they lead to practical organizer decisions
- Reminder, save, and calendar-intent signals are now connected into a clearer event-performance narrative in the organizer dashboard

### Why this matters

Organizers do not need vanity metrics. They need signals that help them improve timing, distribution, and category fit without exposing personal attendee data.

### 5. Reliability, Offline Support, And Trust

The platform already includes meaningful PWA and offline-aware behavior. This should remain a product strength rather than a side experiment.

### Priorities

- Harden offline behavior for discovery flows and cached event content
- Improve clarity around cached versus fresh data so users know what they are seeing
- Keep service-worker and cache behavior bounded, predictable, and testable
- Maintain strong error handling across network, auth, and GraphQL failure states
- Continue end-to-end coverage for critical public and organizer journeys

### Why this matters

Discovery products lose trust quickly when they feel fragile. Reliability, graceful offline behavior, and predictable error states are part of the user experience, not just infrastructure concerns.

### 6. International And Cross-Community Reach

Multilingual support exists in the frontend and should continue growing as part of the core experience rather than being treated as a later add-on.

### Priorities

- Extend translation coverage across the full product surface
- Improve localized discovery, category content, and organizer workflows
- Ensure language filtering and event-language presentation are consistent end to end
- Keep English as the reference copy while maintaining parity across supported locales
- Prepare the product structure for additional languages without fragmenting quality

### Why this matters

Domain communities are frequently international. Better language support expands both event reach and organizer adoption.

### 7. Community And Ecosystem Expansion

Community groups are now a first-class feature on the platform. The next expansion areas focus on deeper integration, automation, and ecosystem growth.

### Expansion areas

- Automated background sync from Meetup and Luma (external source claim infrastructure is in place; background job scheduling is not)
- Social and collaborative features such as comments, discussion, or shared curation
- Partner integrations for ticketing, venues, or distribution

### Product principle

These features should be added only when they strengthen the core loop of discovery, submission, curation, and organizer insight. They should not dilute the platform into a generic community app.

## Delivery Principles

- Build complete vertical slices across backend, frontend, and tests
- Prefer trustworthy and well-explained metrics over broad but ambiguous reporting
- Keep domain ownership and moderation explicit in both the data model and the user experience
- Preserve privacy by exposing aggregate engagement data only
- Favor focused, high-quality features over broad speculative surface area
- Keep the roadmap anchored to implemented platform strengths, not generic event-tech ambition

## Summary

The platform is no longer in an idea stage. It already has a solid foundation in event discovery, submission, moderation, domain categorization, analytics, favorites, reminders, PWA support, and multilingual groundwork.

The most important next moves are:

- Deepen discovery quality
- Strengthen organizer workflows and analytics
- Turn category domains into stronger community hubs
- Improve reliability and multilingual coverage
- Add community and integration features only when they extend the existing product core in a coherent way