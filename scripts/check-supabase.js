require('dotenv').config();

const { initDatabase, usesSupabase } = require('../database/db');

async function main() {
  if (!usesSupabase) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Supabase mode.');
  }

  await initDatabase();
  console.log('Supabase connection and required tables are ready.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
