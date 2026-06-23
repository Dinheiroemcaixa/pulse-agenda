import { createClient } from '@supabase/supabase-js';

const oldUrl = 'https://zjysxpmfsazqsgwbpppy.supabase.co';
const oldKey = 'sb_publishable_q2eJPIFzTgngLuh9EOTfiQ_yBS7k7xk';
const newUrl = 'https://evfsuochjqneytogwjca.supabase.co';
const newKey = 'sb_publishable_6U8CVH_JWBL0uD7Ig6q2wg_sx5SS3JB';

const oldSb = createClient(oldUrl, oldKey);
const newSb = createClient(newUrl, newKey);

async function check() {
  const { data: usersData, error: errUsers } = await oldSb.from('users').select('*');
  console.log("Old users length: ", usersData?.length, " Error: ", errUsers?.message);

  const { data: teamData, error: errTeam } = await oldSb.from('team').select('*');
  console.log("Old team length: ", teamData?.length, " Error: ", errTeam?.message);

  const { data: newU, error: newUErr } = await newSb.from('users').select('*').limit(1);
  console.log("New users check error: ", newUErr?.message);
}
check();
