# Supabase Setup

This directory contains the Supabase configuration and migrations for the Events application.

## Directory Structure

```
supabase/
├── config.toml          # Supabase configuration
├── migrations/          # Database migrations
│   └── 20240227100000_initial_schema.sql
└── seed.sql            # Initial seed data
```

## Setup Instructions

### Prerequisites

1. Install Supabase CLI globally:
   ```bash
   npm install -g supabase
   ```

### Local Development

1. **Start Supabase locally:**
   ```bash
   npm run supabase:start
   ```

2. **Reset database (if needed):**
   ```bash
   npm run supabase:reset
   ```

3. **Open Supabase Studio:**
   ```bash
   npm run supabase:studio
   ```

### Production Deployment

For production, you'll need to link your local project to your remote Supabase instance:

1. **Login to Supabase:**
   ```bash
   npm run supabase:login
   ```

2. **Link to your project:**
   ```bash
   npm run supabase:link
   ```
   You'll be prompted for your project reference ID (found in your Supabase dashboard URL).

3. **Push migrations to production:**
   ```bash
   npm run supabase:migration:up
   ```

## Migration Strategy

Since you have existing data in your remote Supabase instance, the initial migration uses `CREATE TABLE IF NOT EXISTS` and `ON CONFLICT DO NOTHING` to avoid dropping existing data.

### Creating New Migrations

When you need to make schema changes:

1. **Create a new migration:**
   ```bash
   npm run supabase:migration:new your_migration_name
   ```

2. **Edit the generated SQL file** in `supabase/migrations/`

3. **Test locally:**
   ```bash
   npm run supabase:reset
   ```

4. **Push to production:**
   ```bash
   npm run supabase:migration:up
   ```

## Important Notes

- **Data Preservation:** The initial migration is designed to work with existing data
- **RLS Policies:** Row Level Security is enabled with appropriate policies for users, categories, and events
- **Auth Integration:** The `users` table extends Supabase's built-in `auth.users` table
- **Seed Data:** Initial categories are seeded, but users and events are created through the application

## Automated Setup

You can use the automated setup scripts:

- **Linux/Mac:** `./setup.sh`
- **Windows:** `setup.bat`

These scripts will:
1. Install Supabase CLI if needed
2. Install dependencies
3. Link to your remote project
4. Push migrations
5. Seed initial data

## Troubleshooting

- If you encounter migration conflicts, check your remote database schema
- Use `supabase db diff` to see differences between local and remote
- Always test migrations locally before pushing to production
- If you have existing data conflicts, you may need to modify the migration SQL