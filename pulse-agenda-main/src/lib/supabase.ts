import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zjysxpmfsazqsgwbpppy.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqeXN4cG1mc2F6cXNnd2JwcHB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzA5MjUsImV4cCI6MjA4OTYwNjkyNX0.tnn3Cmgzs-oYSiWPv8Pe5cPv9ATpbIjLL5eIyNK1JAE'

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY)
