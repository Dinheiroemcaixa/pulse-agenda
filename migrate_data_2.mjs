import { createClient } from '@supabase/supabase-js';

const oldSb = createClient('https://zjysxpmfsazqsgwbpppy.supabase.co', 'sb_publishable_q2eJPIFzTgngLuh9EOTfiQ_yBS7k7xk');
const newSb = createClient('https://evfsuochjqneytogwjca.supabase.co', 'sb_publishable_6U8CVH_JWBL0uD7Ig6q2wg_sx5SS3JB');

async function migrate() {
  console.log("Tentando Team novamente...");
  let { data: team } = await oldSb.from('team').select('*');
  if (team && team.length > 0) {
    team = team.map(t => {
      delete t.created_at; 
      return t;
    });
    const { error } = await newSb.from('team').insert(team);
    if (!error) console.log(`✓ ${team.length} membros da equipe migrados.`);
    else console.error("Erro Team:", error.message);
  }

  console.log("Tentando Tags novamente...");
  let { data: tags } = await oldSb.from('tags').select('*');
  if (tags && tags.length > 0) {
    tags = tags.map(t => {
      delete t.created_at; 
      return t;
    });
    const { error } = await newSb.from('tags').insert(tags);
    if (!error) console.log(`✓ ${tags.length} tags migradas.`);
    else console.error("Erro Tags:", error.message);
  }
}

migrate();
