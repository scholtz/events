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

console.log(`🚀 Database Migration Setup for project: ${projectRef}\n`);

function showMigrationInstructions() {
  console.log('📋 AUTOMATED MIGRATION INSTRUCTIONS:');
  console.log('=====================================\n');

  console.log('🔗 Step 1: Open Supabase SQL Editor');
  console.log(`   URL: https://supabase.com/dashboard/project/${projectRef}/sql\n`);

  console.log('📄 Step 2: Copy and run this SQL:');
  console.log('=====================================');

  const sqlContent = fs.readFileSync(path.join(__dirname, 'fix-rls.sql'), 'utf8');
  console.log(sqlContent);
  console.log('=====================================\n');

  console.log('▶️  Step 3: Click "Run" in the SQL Editor\n');

  console.log('✅ Step 4: Verify migration worked:');
  console.log('   npm run db:check\n');

  console.log('🎉 Step 5: Start your application:');
  console.log('   cd projects/events-frontend');
  console.log('   npm run dev\n');

  // Try to open browser automatically
  try {
    console.log('🔗 Opening Supabase SQL Editor in browser...');
    execSync(`start https://supabase.com/dashboard/project/${projectRef}/sql`, { stdio: 'pipe' });
    console.log('✅ Browser opened successfully!\n');
  } catch (error) {
    console.log('⚠️ Could not open browser automatically.');
    console.log(`   Please manually open: https://supabase.com/dashboard/project/${projectRef}/sql\n`);
  }
}

showMigrationInstructions();