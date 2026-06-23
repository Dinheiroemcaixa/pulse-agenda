import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zjysxpmfsazqsgwbpppy.supabase.co'
const SUPABASE_KEY = 'sb_publishable_q2eJPIFzTgngLuh9EOTfiQ_yBS7k7xk'

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY)
