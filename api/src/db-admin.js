import { createClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS. Used for Storage uploads/downloads
// and session_replays upserts. Never exposed to the browser.
const adminDb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY // fallback for dev
)

export default adminDb
