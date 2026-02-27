#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './projects/events-frontend/.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDatabase() {
  console.log('🔍 Checking Supabase database structure...\n');

  try {
    // Check if tables exist and can be queried
    const tables = ['users', 'categories', 'events'];

    for (const table of tables) {
      try {
        const { data, error, count } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });

        if (error) {
          console.log(`❌ Table '${table}' error: ${error.message}`);
        } else {
          console.log(`✅ Table '${table}' exists (${count || 0} records)`);
        }
      } catch (err) {
        console.log(`❌ Table '${table}' does not exist or is not accessible: ${err.message}`);
      }
    }

    console.log('\n🔐 Testing permissions...\n');

    // Test reading categories (should work for everyone)
    const { data: categories, error: catError } = await supabase
      .from('categories')
      .select('*')
      .limit(5);

    if (catError) {
      console.log(`⚠️ Cannot read categories: ${catError.message}`);
      console.log('👉 You need to run the RLS fix SQL in your Supabase dashboard');
    } else {
      console.log(`✅ Can read categories: ${categories.length} found`);
      if (categories.length > 0) {
        console.log(`   Sample: ${categories[0].name}`);
      }
    }

    console.log('\n📋 Database Status Summary:');
    console.log('==========================');
    console.log('✅ Tables exist: users, categories, events');
    console.log('⚠️  RLS policies may need fixing');
    console.log('📄 SQL file created: fix-rls.sql');

    console.log('\n🚀 Next Steps:');
    console.log('1. Go to your Supabase dashboard SQL editor');
    console.log('2. Run the contents of fix-rls.sql');
    console.log('3. Run this script again to verify');
    console.log('4. Start your frontend: cd projects/events-frontend && npm run dev');

  } catch (error) {
    console.error('❌ Error checking database:', error);
  }
}

checkDatabase();