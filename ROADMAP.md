# Biatec Events Platform Roadmap

## Vision

The Events Platform is a comprehensive event management and discovery system designed to connect event organizers, attendees, and communities. Our vision is to become the leading platform for domain-specific event management, enabling seamless event creation, promotion, and participation across various industries and communities. We aim to foster vibrant communities through intelligent event recommendations, real-time collaboration tools, and integrated analytics, ultimately creating a world where discovering and attending meaningful events is effortless and engaging.

### Tags

Events can be tagged. The tag is category and slug of the category name is served as the sub domain name. First user who creates a tag is his administrator. Tags can have multiple administrators assigned. Global administrators can change the tag administrators. Tag administrator approves if the event is displayed under the specific tag. For multilanguage support each slug permission is linked to the english tag permission. Tag administrator has also some limitted ability to modify the design of the website.

On event detail page is showned hyperlink to the domain name including the tag slug, for example crypto.events.biatec.io. Subdomain level event list page is dedicated to the slug so the design and UX is focused on this. Example of the tag may be for example the Prague Blockchain Week, and organizer of these multi event event enables the events at the dedicated website. 

### Community Groups

Users can create a community groups. Community group has community group administrators who can assign roles in the community group and can claim ownership of other event apps such as meetup or luma. Community group event manager can create events for the community. There must be clear view on list of the community event. The community group can be public or private. Users can request membership for private community group or can join directly the public community group.

The events created at other event apps can be synced into the biatec events platform by clicking the button on the frontend in community administration page. Backend app will load all luma or meetup linked group's events and create the events in the biatec events app.

### Key pillars of our vision

- **Accessibility**: Democratize event management for all users, from individual organizers to large enterprises
- **Community Building**: Strengthen connections between event organizers and attendees through interactive features
- **Innovation**: Leverage cutting-edge technology to enhance the event experience
- **Sustainability**: Promote eco-friendly event practices and virtual attendance options
- **Multilanguage**: App provides localized environment for event organizers or event attendees, for example English, Slovak, German, Chinesse or Italian.

## Current Tech Stack

### Frontend
- **Framework**: Vue 3 with Composition API
- **Language**: TypeScript
- **Build Tool**: Vite
- **State Management**: Pinia
- **Routing**: Vue Router 5
- **Styling**: CSS Custom Properties with scoped styles
- **Testing**: Playwright for E2E tests
- **Deployment**: Vercel

### Backend
- **Framework**: ASP.NET Core 10
- **API**: GraphQL with Hot Chocolate
- **Database ORM**: Entity Framework Core
- **Authentication**: JWT Bearer tokens
- **Deployment**: Kubernetes (K8s)

### Database & Infrastructure
- **Database**: Supabase (PostgreSQL-based)
- **GraphQL Client**: Typescript safe generated graphql client
- **CORS**: Configured for multiple origins including localhost and production domains

### Development & Quality Assurance
- **Linting**: ESLint
- **Code Formatting**: Prettier
- **Version Control**: Git with GitHub
- **CI/CD**: GitHub Actions with Playwright tests

## 3-Year Strategic Roadmap

### Year 1: Foundation & Core Enhancement (2026)
**Focus**: Solidify core functionality, improve user experience, and establish market presence.

- **Q1-Q2**: Enhanced event discovery with advanced filtering and search capabilities
- **Q3-Q4**: Mobile-responsive design improvements and PWA features for offline access

### Year 2: Expansion & Integration (2027)
**Focus**: Scale the platform, integrate with third-party services, and expand user base.

- **Q1-Q2**: API integrations with popular calendar services (Google Calendar, Outlook)
- **Q3-Q4**: Multi-language support and internationalization

### Year 3: Innovation & Ecosystem (2028)
**Focus**: Leverage AI/ML, build a comprehensive ecosystem, and explore new revenue streams.

- **Q1-Q2**: AI-powered event recommendations and automated marketing tools
- **Q3-Q4**: Partner ecosystem with ticketing platforms and venue management systems

## 1-Year Delivery Plan (2026)

### Q1: User Experience Enhancements
- **Deliverables**:
  - Implement advanced search with filters (date, location, category, price)
  - Add event favoriting and personal event lists
  - Improve event detail pages with interactive maps and attendee lists
- **Technical Tasks**:
  - Update GraphQL queries for enhanced filtering
  - Add new Vue components for search and favorites
  - Implement responsive design improvements
- **Business Impact**: Increase user engagement and time spent on platform

### Q2: Mobile & PWA Features
- **Deliverables**:
  - Progressive Web App (PWA) implementation for offline access
  - Push notifications for event reminders
  - Mobile-optimized event creation flow
- **Technical Tasks**:
  - Configure Vite PWA plugin
  - Implement service workers for caching
  - Add notification permissions and scheduling
- **Business Impact**: Expand reach to mobile users, improve retention

### Q3: Analytics & Insights
- **Deliverables**:
  - Event organizer dashboard with attendance analytics
  - User behavior tracking and reporting
  - Integration with Google Analytics
- **Technical Tasks**:
  - Add analytics endpoints to GraphQL API
  - Implement dashboard components in Vue
  - Set up data collection and privacy compliance
- **Business Impact**: Provide value to organizers, enable data-driven decisions

### Q4: Community Features
- **Deliverables**:
  - Event discussion forums and comments
  - User profiles with event history
  - Social sharing capabilities
- **Technical Tasks**:
  - Extend database schema for comments and user profiles
  - Add real-time features with WebSockets or GraphQL subscriptions
  - Implement social media integration
- **Business Impact**: Increase community engagement and viral growth

## Business Plan

### Revenue Model
- **Freemium**: Basic event creation and discovery free; premium features for organizers
- **Subscriptions**: Tiered plans for individual organizers ($9/month), teams ($29/month), and enterprises ($99/month)
- **Transaction Fees**: 2-5% commission on paid events and ticket sales
- **Premium Integrations**: Charge for advanced API access and custom integrations

### Market Strategy
- **Target Segments**:
  - Individual event organizers (meetups, workshops)
  - Small to medium businesses (conferences, corporate events)
  - Educational institutions (seminars, campus events)
  - Non-profits (fundraisers, community events)
- **Go-to-Market**:
  - Content marketing through event planning blogs and tutorials
  - Partnerships with event-related platforms (Eventbrite, Meetup)
  - Social media campaigns targeting event organizers
  - SEO optimization for event discovery

### Growth Metrics
- **User Acquisition**: 50% quarterly growth in registered users
- **Engagement**: Average 3 events viewed per user session
- **Conversion**: 15% of free users convert to paid plans within 6 months
- **Revenue**: $500K ARR by end of Year 1, $2M by end of Year 3

### Competitive Advantage
- **Domain-Specific Focus**: Tailored features for different industries
- **Open GraphQL API**: Easy integration for third-party developers
- **Community-Driven**: User-generated content and peer recommendations
- **Privacy-First**: Strong data protection and GDPR compliance

### Risks & Mitigation
- **Competition**: Monitor competitors like Eventbrite and Meetup; differentiate through niche features
- **Technical Scalability**: Regular performance audits and infrastructure upgrades
- **Regulatory Compliance**: Stay updated on data privacy laws and event industry regulations
- **Market Adoption**: Continuous user feedback loops and agile feature development

### Funding & Investment
- **Bootstrapping**: Self-funded development for initial launch
- **Seed Round**: $500K target for Year 2 expansion
- **Series A**: $3M target for Year 3 scaling and team growth

This roadmap represents our commitment to building a world-class event management platform that serves both organizers and attendees. We will regularly review and adapt this plan based on user feedback, market conditions, and technological advancements.