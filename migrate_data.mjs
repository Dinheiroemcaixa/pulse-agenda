import { createClient } from '@supabase/supabase-js';

const oldSb = createClient('https://zjysxpmfsazqsgwbpppy.supabase.co', 'sb_publishable_q2eJPIFzTgngLuh9EOTfiQ_yBS7k7xk');
const newSb = createClient('https://evfsuochjqneytogwjca.supabase.co', 'sb_publishable_6U8CVH_JWBL0uD7Ig6q2wg_sx5SS3JB');

async function migrate() {
  console.log("Migrando Users...");
  const { data: users } = await oldSb.from('users').select('*');
  if (users && users.length > 0) {
    const { error } = await newSb.from('users').insert(users);
    if (error) console.error("Erro em users:", error.message);
    else console.log(`✓ ${users.length} usuários migrados.`);
  }

  console.log("Migrando Team...");
  const { data: team } = await oldSb.from('team').select('*');
  if (team && team.length > 0) {
    const { error } = await newSb.from('team').insert(team);
    if (error) console.error("Erro em team:", error.message);
    else console.log(`✓ ${team.length} membros da equipe migrados.`);
  }

  console.log("Migrando Tags...");
  const { data: tags } = await oldSb.from('tags').select('*');
  if (tags && tags.length > 0) {
    const { error } = await newSb.from('tags').insert(tags);
    if (error) console.error("Erro em tags:", error.message);
    else console.log(`✓ ${tags.length} tags migradas.`);
  }
}

migrate();
