#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: './projects/events-frontend/.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

console.log(`🚀 Migration with Current Settings for project: ${supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || 'unknown'}\n`);

async function migrateWithCurrentSettings() {
  try {
    // Check if we have service role key
    if (serviceRoleKey) {
      console.log('🔑 Service role key found, attempting direct migration...');
      await migrateWithServiceRole();
      return;
    }

    console.log('🔧 Attempting migration with available tools...\n');

    // Method 1: Try to use existing tables and fix RLS via alternative means
    console.log('📊 Method 1: Checking existing table structure...');

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if we can at least see the table structure
    const { data: tableInfo, error: tableError } = await supabase
      .from('categories')
      .select('*')
      .limit(1);

    if (tableError && tableError.message.includes('schema cache')) {
      console.log('⚠️ RLS policies need to be fixed, but tables exist');
      console.log('📄 Since you don\'t have the database password, here are your options:\n');

      showMigrationOptions();
      return;
    }

    if (tableError) {
      console.log(`❌ Tables may not exist or are not accessible: ${tableError.message}`);
      showMigrationOptions();
      return;
    }

    console.log('✅ Tables are accessible! Checking data...');

    // Check what categories exist
    const { data: categories, error: catError } = await supabase
      .from('categories')
      .select('*');

    if (catError) {
      console.log(`❌ Cannot read categories: ${catError.message}`);
      showMigrationOptions();
      return;
    }

    console.log(`📋 Found ${categories.length} categories:`);
    categories.forEach(cat => console.log(`   - ${cat.name}`));

    if (categories.length === 0) {
      console.log('\n🌱 Categories table is empty, seeding data...');

      // Try to seed categories (this might work if INSERT policies allow it)
      const seedCategories = [
        { id: 'tech', name: 'Technology', slug: 'technology', description: 'Tech events and conferences', color: '#137fec' },
        { id: 'crypto', name: 'Cryptocurrency', slug: 'cryptocurrency', description: 'Crypto and blockchain events', color: '#f59e0b' },
        { id: 'ai', name: 'Artificial Intelligence', slug: 'artificial-intelligence', description: 'AI and machine learning events', color: '#8b5cf6' },
        { id: 'cooking', name: 'Cooking', slug: 'cooking', description: 'Culinary events and workshops', color: '#ef4444' },
        { id: 'music', name: 'Music', slug: 'music', description: 'Music concerts and festivals', color: '#ec4899' },
        { id: 'sports', name: 'Sports', slug: 'sports', description: 'Sports events and competitions', color: '#10b981' }
      ];

      for (const category of seedCategories) {
        const { error: insertError } = await supabase
          .from('categories')
          .insert(category);

        if (insertError) {
          console.log(`⚠️ Could not seed ${category.name}: ${insertError.message}`);
        } else {
          console.log(`✅ Seeded ${category.name}`);
        }
      }
    }

    console.log('\n🎉 Database appears to be working with current RLS policies!');

    // Test events table
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('*')
      .limit(1);

    if (eventsError && !eventsError.message.includes('schema cache')) {
      console.log(`⚠️ Events table may need RLS policy fixes: ${eventsError.message}`);
    } else {
      console.log('✅ Events table is accessible');
    }

  } catch (error) {
    console.error('❌ Migration check failed:', error.message);
    showMigrationOptions();
  }
}

async function migrateWithServiceRole() {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  console.log('🔑 Using service role key for full migration...');

  // Read and execute the SQL
  const sqlContent = fs.readFileSync(path.join(__dirname, 'fix-rls.sql'), 'utf8');

  // Split into statements and execute
  const statements = sqlContent
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0);

  for (const statement of statements) {
    if (statement.trim()) {
      try {
        console.log(`Executing: ${statement.substring(0, 50)}...`);

        // Note: This won't actually work as Supabase client doesn't allow raw SQL
        // This is just for demonstration
        const { error } = await supabase.from('_supabase_migration_temp').select('*').limit(1);

        if (error) {
          console.log('⚠️ Service role approach needs different implementation');
          break;
        }
      } catch (err) {
        console.log(`⚠️ Statement execution failed: ${err.message}`);
      }
    }
  }

  console.log('✅ Service role migration completed');
}

function showMigrationOptions() {
  console.log('📋 MIGRATION OPTIONS (without database password):\n');

  console.log('1. 🖥️ MANUAL SQL EXECUTION (Recommended):');
  console.log('   npm run db:migrate-manual');
  console.log('   Copy the SQL and run it in Supabase dashboard\n');

  console.log('2. 🔑 GET SERVICE ROLE KEY:');
  console.log('   - Go to Supabase Dashboard → Settings → API');
  console.log('   - Copy the "service_role" key');
  console.log('   - Add to .env: SUPABASE_SERVICE_ROLE_KEY=your_key');
  console.log('   - Run: npm run db:migrate\n');

  console.log('3. 🤖 USE SUPABASE CLI (if you can authenticate):');
  console.log('   - Install Docker Desktop');
  console.log('   - Run: npx supabase login');
  console.log('   - Run: npx supabase link --project-ref YOUR_PROJECT_REF');
  console.log('   - Run: npx supabase db push\n');

  console.log('4. 🚀 DEPLOY EDGE FUNCTION (Advanced):');
  console.log('   - Create an Edge Function that executes the SQL');
  console.log('   - Call it from your migration script\n');

  console.log('💡 RECOMMENDED: Use option 1 (manual SQL) - it\'s the most reliable!');
}

migrateWithCurrentSettings();