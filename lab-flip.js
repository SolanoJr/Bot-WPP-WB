require('dotenv').config();
const { setGroupModField, getGroupMod } = require('/home/solanojr/bot-wpp/dist/services/databaseService.js');
const GROUP = '120363410094452673@g.us';
const field = process.argv[2];
const raw = process.argv[3];
if (!field || !['0','1'].includes(raw)) { console.log('USO: node lab-flip.js <field> <0|1>'); process.exit(1); }
(async () => {
  await setGroupModField(GROUP, field, raw === '1');
  const cfg = await getGroupMod(GROUP);
  console.log('OK ' + field + '=' + (cfg[field] ? 1 : 0));
})().catch(e => { console.log('FAIL ' + e.message); process.exit(1); });
