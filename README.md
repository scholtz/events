# Events Catalog

Seb app for event catalog. For example i want to see all crypto events in the prague in next month with the links to the events and some event name and description and location on the map. Allow people to submit the events by them selves with dashboard overview and event manager, and admin page to manage the data or other users. The domains specific events like crypto or ai or cooking will be set by the administrator and will be in specific subdomain.

## Project Structure

- `projects/events-frontend/` - Vue.js frontend application
- `supabase/` - Database configuration and migrations

## Database Setup

This project uses Supabase for the backend. Multiple migration approaches are available!

### Quick Migration Options

```bash
# Check current database status
npm run db:check

# Option 1: Manual SQL (most reliable, no special setup needed)
npm run db:migrate-manual

# Option 2: Check what options are available with current settings
npm run db:migrate-current

# Option 3: Automated with database password (if you have it)
npm run db:migrate

# Option 4: Automated with service role key (if you add it)
npm run db:migrate-service
```

```
npx supabase login
npx supabase link --project-ref pvcjtuajoistxpzpwsih
npx supabase db push
```

### Environment Variables

```bash
# Required (already set)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Optional for full automation
SUPABASE_DB_PASSWORD=your-database-password    # Direct DB access
SUPABASE_SERVICE_ROLE_KEY=your-service-key     # Admin API access
```

### Migration Methods Explained

| Method | Requirements | Automation Level | Reliability |
|--------|-------------|------------------|-------------|
| Manual SQL | None | Manual (copy-paste) | ⭐⭐⭐⭐⭐ |
| Service Role | Service role key | Semi-automated | ⭐⭐⭐⭐⭐ |
| Database Password | DB password | Fully automated | ⭐⭐⭐⭐⭐ |
| Supabase CLI | Docker + auth | Fully automated | ⭐⭐⭐⭐ |

### Getting Service Role Key

1. Go to: **Supabase Dashboard → Settings → API**
2. Copy the **`service_role`** key (not the anon key!)
3. Add to your `.env` file:
   ```
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   ```
4. Run: `npm run db:migrate-service`

### What the Migration Does

- ✅ Creates tables: `users`, `categories`, `events`
- 🔒 Enables Row Level Security (RLS) policies
- 🌱 Seeds initial categories (Tech, Crypto, AI, Cooking, Music, Sports)
- 👥 Sets up proper user permissions

### Current Status

Your tables exist but may need RLS policy fixes. Run `npm run db:migrate-current` to see available options.
2. Copy the displayed SQL
3. Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql
4. Paste and run the SQL
5. Verify: `npm run db:check`