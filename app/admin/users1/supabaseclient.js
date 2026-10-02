// app/admin/users/supabaseClient.js
//
// Reads your Supabase project URL + anon key from environment variables.
// Add these to your .env.local (NOT committed to git):
//
//   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
//
// If you already have a shared client elsewhere in your project (e.g. lib/supabaseClient.js),
// delete this file and just import that one instead in page.js / StudentModal.js.

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Don't throw at import time in dev — just warn, so the page can still
  // render an error state instead of crashing the whole app.
  console.warn(
    "Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);