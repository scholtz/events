-- Fix RLS policies for Events application
-- Run this SQL in your Supabase SQL Editor

-- First, ensure RLS is enabled on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Admins can manage users" ON users;
DROP POLICY IF EXISTS "Categories are viewable by everyone" ON categories;
DROP POLICY IF EXISTS "Admins can manage categories" ON categories;
DROP POLICY IF EXISTS "Approved events are viewable by everyone" ON events;
DROP POLICY IF EXISTS "Authenticated users can create events" ON events;
DROP POLICY IF EXISTS "Users can view own events" ON events;
DROP POLICY IF EXISTS "Admins can manage events" ON events;

-- Users table policies
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can manage users" ON users
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Allow user registration (insert into users table)
CREATE POLICY "Users can insert their own profile" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Categories table policies
CREATE POLICY "Categories are viewable by everyone" ON categories
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage categories" ON categories
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Events table policies
CREATE POLICY "Approved events are viewable by everyone" ON events
  FOR SELECT USING (status = 'approved');

CREATE POLICY "Authenticated users can create events" ON events
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can view own events" ON events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage events" ON events
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Seed initial categories
INSERT INTO categories (id, name, slug, description, color) VALUES
  ('tech', 'Technology', 'technology', 'Tech events and conferences', '#137fec'),
  ('crypto', 'Cryptocurrency', 'cryptocurrency', 'Crypto and blockchain events', '#f59e0b'),
  ('ai', 'Artificial Intelligence', 'artificial-intelligence', 'AI and machine learning events', '#8b5cf6'),
  ('cooking', 'Cooking', 'cooking', 'Culinary events and workshops', '#ef4444'),
  ('music', 'Music', 'music', 'Music concerts and festivals', '#ec4899'),
  ('sports', 'Sports', 'sports', 'Sports events and competitions', '#10b981')
ON CONFLICT (id) DO NOTHING;