import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Parse .env manually
const envPath = resolve(process.cwd(), '.env');
const envFile = readFileSync(envPath, 'utf8');
let supabaseUrl = '';
let supabaseKey = '';

envFile.split('\n').forEach(line => {
  if (line.startsWith('VITE_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim();
  if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) supabaseKey = line.split('=')[1].trim();
});

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log("Connecting to Supabase at:", supabaseUrl);
  const { data, error } = await supabase.from('tasks').select('*').limit(1);
  if (error) {
    console.error("Error accessing table 'tasks':", error.message);
  } else {
    console.log("Successfully connected! Data in tasks:", data);
  }
}

test();
