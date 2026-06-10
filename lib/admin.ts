import { createClient } from '@supabase/supabase-js'

export const ADMIN_EMAIL = 'taiki.ujiie.0706@gmail.com'

export async function verifyAdmin(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: { user } } = await supabase.auth.getUser(token)
  return user?.email === ADMIN_EMAIL
}
