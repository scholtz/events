import { createClient } from '@supabase/supabase-js'

// Fallback to localhost so the app initialises in test/dev environments that
// don't have real Supabase credentials set.  All network requests are still
// intercepted by Playwright's page.route() during e2e tests.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
