#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: './projects/events-frontend/.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

// Extract project reference from URL
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!projectRef) {
  console.error('❌ Could not extract project reference from URL');
  process.exit(1);
}

console.log(`🚀 Fully Automated Database Migration for project: ${projectRef}\n`);

async function runAutomatedMigration() {
  try {
    // Method 1: Try Supabase CLI
    console.log('🔧 Method 1: Attempting Supabase CLI...');

    try {
      // Check if linked
      execSync('npx supabase status --output json', { stdio: 'pipe' });
      console.log('✅ Project linked, pushing migrations...');

      execSync('npx supabase db push --yes', { stdio: 'pipe' });
      console.log('✅ CLI migration successful!');

      // Verify
      await verifyMigration();
      return;

    } catch (cliError) {
      console.log(`⚠️ CLI failed: ${cliError.message}`);
      console.log('Falling back to direct database connection...\n');
    }

    // Method 2: Direct database connection (requires password)
    console.log('🗄️  Method 2: Direct database connection...');

    // For this to work, we need the database password
    // We can try to get it from environment or prompt for it
    const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.DB_PASSWORD;

    if (!dbPassword) {
      console.log('❌ Database password not found in environment variables.');
      console.log('Please set SUPABASE_DB_PASSWORD or DB_PASSWORD environment variable.');
      console.log('\n📋 MANUAL FALLBACK:');
      console.log('Run: npm run db:migrate-manual');
      console.log('Then: npm run db:check');
      return;
    }

    // Construct database URL
    const dbUrl = `postgresql://postgres:${dbPassword}@db.${projectRef}.supabase.co:5432/postgres`;

    console.log('📡 Connecting to database...');

    const { Client } = require('pg');
    const client = new Client({ connectionString: dbUrl });

    await client.connect();
    console.log('✅ Database connected');

    // Read and execute SQL
    const sqlContent = fs.readFileSync(path.join(__dirname, 'fix-rls.sql'), 'utf8');

    console.log('⚡ Executing migration SQL...');
    await client.query(sqlContent);

    console.log('✅ Migration SQL executed successfully');

    await client.end();

    // Verify
    await verifyMigration();

  } catch (error) {
    console.error('❌ Automated migration failed:', error.message);
    console.log('\n📋 FALLBACK OPTIONS:');
    console.log('1. Set database password: set SUPABASE_DB_PASSWORD=your_password');
    console.log('2. Run manual migration: npm run db:migrate-manual');
    console.log('3. Check status: npm run db:check');
  }
}

async function verifyMigration() {
  console.log('\n🔍 Verifying migration...');

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: categories, error } = await supabase
    .from('categories')
    .select('*');

  if (error) {
    console.log(`❌ Verification failed: ${error.message}`);
    throw new Error('Migration verification failed');
  }

  console.log(`✅ Migration successful! Found ${categories.length} categories:`);
  categories.forEach(cat => console.log(`   - ${cat.name} (${cat.slug})`));

  console.log('\n🎉 Database is fully configured and ready!');
  console.log('\n🚀 Start your application:');
  console.log('   cd projects/events-frontend && npm run dev');
}

runAutomatedMigration();