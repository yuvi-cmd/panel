import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const body = sql.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
fs.writeFileSync(
  new URL('../src/backend/schema.js', import.meta.url),
  '// Generated from schema.sql — keep both in sync.\nexport const SCHEMA = `' + body + '`;\n',
);
console.log('synced src/backend/schema.js');
