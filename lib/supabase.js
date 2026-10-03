// lib/supabase.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// This app's login (app/login + components/site/LoginClient.js) stores the
// session in the browser only (plain supabase-js, no @supabase/ssr cookie
// integration) -- so server-side API routes can't identify the student
// via cookies. Every protected fetch() call from a client component must
// attach the access token as a Bearer header instead (the routes already
// check for this as their auth path). Use like:
//   const headers = await getAuthHeader();
//   fetch('/api/enroll/coupon', { headers: { 'Content-Type': 'application/json', ...headers }, ... })
export async function getAuthHeader() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}