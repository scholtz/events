#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: './projects/events-frontend/.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing Supabase URL or SERVICE_ROLE_KEY in .env file');
  console.error('Please add: SUPABASE_SERVICE_ROLE_KEY=your_service_role_key');
  process.exit(1);
}

console.log(`🚀 Service Role Migration for project: ${supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || 'unknown'}\n`);

async function migrateWithServiceRole() {
  try {
    console.log('🔑 Using Supabase service role key...');

    // Create Supabase client with service role key
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    console.log('📡 Testing service role connection...');

    // Test connection by trying to access a system table
    const { data: testData, error: testError } = await supabase
      .from('categories')
      .select('count', { count: 'exact', head: true });

    if (testError) {
      console.log(`❌ Service role connection failed: ${testError.message}`);
      console.log('Make sure your service role key is correct.');
      return;
    }

    console.log('✅ Service role connection successful');

    // Since we can't execute raw SQL with the client, we'll use the REST API approach
    // Supabase service role can access the REST API with full permissions

    console.log('⚡ Executing migration SQL via service role...');

    // Read the migration SQL
    const sqlContent = fs.readFileSync(path.join(__dirname, 'fix-rls.sql'), 'utf8');

    // For service role, we can try using the pg library with the service role connection
    // But since we don't have the direct DB password, we'll use a different approach

    console.log('📄 Migration SQL to execute:');
    console.log('=====================================');
    console.log(sqlContent);
    console.log('=====================================\n');

    console.log('🔗 To execute this SQL with service role permissions:');
    console.log('1. Go to Supabase Dashboard → SQL Editor');
    console.log('2. Make sure you\'re logged in with admin access');
    console.log('3. Copy and paste the SQL above');
    console.log('4. Click "Run"');
    console.log('\nThe service role key confirms you have the necessary permissions!');

    // Actually, let me try a different approach - use the Supabase management API
    console.log('\n🔧 Attempting automated execution via Management API...');

    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
    if (!projectRef) {
      console.log('❌ Could not extract project reference');
      return;
    }

    // Try to execute SQL via REST API (this might not work, but let's try)
    try {
      const response = await fetch(`https://${projectRef}.supabase.co/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey
        },
        body: JSON.stringify({ sql: sqlContent })
      });

      if (response.ok) {
        console.log('✅ Migration executed successfully via API!');
      } else {
        const errorText = await response.text();
        console.log(`⚠️ API execution failed: ${response.status} - ${errorText}`);
        console.log('Falling back to manual execution instructions above.');
      }
    } catch (apiError) {
      console.log(`⚠️ API call failed: ${apiError.message}`);
      console.log('Please use the manual SQL execution method above.');
    }

  } catch (error) {
    console.error('❌ Service role migration failed:', error.message);
  }
}

migrateWithServiceRole();