#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('📄 Migration SQL for manual execution:\n');
console.log('Copy this SQL and run it in your Supabase dashboard SQL editor:');
console.log('https://supabase.com/dashboard/project/YOUR_PROJECT/sql\n');
console.log('='.repeat(80));

const sqlContent = fs.readFileSync(path.join(__dirname, 'fix-rls.sql'), 'utf8');
console.log(sqlContent);

console.log('='.repeat(80));
console.log('\nAfter running the SQL, verify with: npm run db:check');