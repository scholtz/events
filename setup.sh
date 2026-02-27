#!/bin/bash

echo "🚀 Setting up Events Catalog with Supabase"
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Installing..."
    npm install -g supabase
fi

echo "📦 Installing dependencies..."
npm install

echo "🔗 Linking to remote Supabase project..."
echo "You'll need to provide your project reference ID"
echo "You can find it in your Supabase dashboard URL: https://supabase.com/dashboard/project/[PROJECT_REF]"
supabase login
supabase link

echo "⬆️ Pushing migrations to remote..."
supabase db push

echo "🌱 Seeding initial data..."
supabase seed

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Start the frontend: cd projects/events-frontend && npm run dev"
echo "2. Open your app at http://localhost:5173"
echo "3. Access Supabase Studio at the URL shown above"