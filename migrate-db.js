#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: './projects/events-frontend/.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigrations() {
  console.log('🚀 Running database migrations...\n');

  try {
    // Read the RLS fix SQL
    const rlsSql = fs.readFileSync(path.join(__dirname, 'fix-rls.sql'), 'utf8');

    console.log('📄 Executing RLS policies and seeding data...\n');

    // Split SQL into individual statements (basic approach)
    const statements = rlsSql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    for (const statement of statements) {
      if (statement.trim()) {
        try {
          console.log(`Executing: ${statement.substring(0, 50)}...`);

          // For DDL statements, we need to use a different approach
          // Since Supabase doesn't allow DDL via RPC, we'll try to execute each statement
          const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' });

          if (error) {
            console.log(`⚠️ RPC failed for statement, this is expected for DDL. Please run manually if needed.`);
          } else {
            console.log(`✅ Executed successfully`);
          }
        } catch (err) {
          console.log(`⚠️ Statement execution failed (expected for DDL): ${err.message}`);
        }
      }
    }

    console.log('\n🔍 Verifying migration results...\n');

    // Test that categories can be read
    const { data: categories, error: catError } = await supabase
      .from('categories')
      .select('*');

    if (catError) {
      console.log(`❌ Categories still not accessible: ${catError.message}`);
      console.log('\n📋 MANUAL STEP REQUIRED:');
      console.log('Please go to your Supabase dashboard SQL editor and run:');
      console.log('https://supabase.com/dashboard/project/pvcjtuajoistxpzpwsih/sql');
      console.log('Then paste the contents of fix-rls.sql and click Run');
    } else {
      console.log(`✅ Migration successful! Found ${categories.length} categories:`);
      categories.forEach(cat => console.log(`   - ${cat.name} (${cat.slug})`));
    }

    console.log('\n🎉 Migration process complete!');
    console.log('\nIf categories are not showing above, please run the SQL manually in Supabase dashboard.');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.log('\n📋 FALLBACK: Run SQL manually in Supabase dashboard:');
    console.log('1. Go to: https://supabase.com/dashboard/project/pvcjtuajoistxpzpwsih/sql');
    console.log('2. Copy contents of fix-rls.sql');
    console.log('3. Click Run');
  }
}

runMigrations();