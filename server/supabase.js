const { createClient } = require('@supabase/supabase-js');
let cached = null;

function getSupabase(){
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

module.exports = { getSupabase };
