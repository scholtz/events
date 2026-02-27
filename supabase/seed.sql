-- Seed data for initial categories
INSERT INTO categories (id, name, slug, description, color) VALUES
  ('tech', 'Technology', 'technology', 'Tech events and conferences', '#137fec'),
  ('crypto', 'Cryptocurrency', 'cryptocurrency', 'Crypto and blockchain events', '#f59e0b'),
  ('ai', 'Artificial Intelligence', 'artificial-intelligence', 'AI and machine learning events', '#8b5cf6'),
  ('cooking', 'Cooking', 'cooking', 'Culinary events and workshops', '#ef4444'),
  ('music', 'Music', 'music', 'Music concerts and festivals', '#ec4899'),
  ('sports', 'Sports', 'sports', 'Sports events and competitions', '#10b981')
ON CONFLICT (id) DO NOTHING;

-- Note: Users and events will be created through the application
-- This seed file focuses on categories that are typically managed by admins