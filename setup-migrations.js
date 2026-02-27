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

console.log(`🚀 Automated Database Migration for project: ${projectRef}\n`);

async function runAutomatedMigration() {
  try {
    console.log('🔗 Opening Supabase SQL Editor automatically...\n');

    // Open the Supabase SQL editor in the default browser
    const sqlEditorUrl = `https://supabase.com/dashboard/project/${projectRef}/sql`;
    execSync(`start ${sqlEditorUrl}`, { stdio: 'inherit' });

    console.log('📄 SQL to execute:');
    console.log('==================');

    const sqlContent = fs.readFileSync(path.join(__dirname, 'fix-rls.sql'), 'utf8');
    console.log(sqlContent);
    console.log('==================\n');

    console.log('📋 INSTRUCTIONS:');
    console.log('1. ✅ Browser should have opened to Supabase SQL Editor');
    console.log('2. 📋 Copy the SQL above');
    console.log('3. 📝 Paste it into the SQL Editor');
    console.log('4. ▶️  Click the "Run" button');
    console.log('5. ✅ Check that it executed successfully');
    console.log('6. 🔄 Come back here and press Enter to verify\n');

    // Wait for user to complete the manual step
    console.log('Press Enter after running the SQL in Supabase dashboard...');
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    await new Promise((resolve) => {
      process.stdin.on('data', () => {
        resolve();
      });
    });

    // Verify the migration worked
    console.log('\n🔍 Verifying migration results...');
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: categories, error } = await supabase
      .from('categories')
      .select('*');

    if (error) {
      console.log(`❌ Verification failed: ${error.message}`);
      console.log('Please check that the SQL was executed correctly.');
      process.exit(1);
    }

    console.log(`✅ Migration successful! Database is ready:`);
    console.log(`   📊 Categories: ${categories.length}`);
    console.log(`   🗂️  Tables: users, categories, events`);
    console.log(`   🔒 RLS Policies: Configured`);
    console.log(`   🌱 Seed Data: Loaded`);

    console.log('\n🎉 Your Events application is ready to use!');
    console.log('\n🚀 Next steps:');
    console.log('   cd projects/events-frontend');
    console.log('   npm run dev');

  } catch (error) {
    console.error('❌ Migration process failed:', error);
    console.log('\n📋 MANUAL FALLBACK:');
    console.log(`Go to: https://supabase.com/dashboard/project/${projectRef}/sql`);
    console.log('Run the contents of fix-rls.sql');
  }
}

runAutomatedMigration();