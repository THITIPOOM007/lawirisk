import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const manifestArg = args.find((value) => value.startsWith('--manifest='));
const manifestPath = resolve(manifestArg?.slice('--manifest='.length) || 'ops/staging-users.example.json');
const roles = new Set(['ADMIN', 'INVESTIGATOR', 'REVIEWER', 'VIEWER']);

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (!Array.isArray(manifest.users)) throw new Error('Manifest must contain a users array.');

const emails = new Set();
for (const [index, user] of manifest.users.entries()) {
  if (!user || typeof user.email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(user.email)) {
    throw new Error(`users[${index}].email is invalid.`);
  }
  if (emails.has(user.email.toLowerCase())) throw new Error(`Duplicate email: ${user.email}`);
  emails.add(user.email.toLowerCase());
  if (typeof user.name !== 'string' || !user.name.trim()) throw new Error(`users[${index}].name is required.`);
  if (!roles.has(user.role)) throw new Error(`users[${index}].role is invalid.`);
}

const roleCounts = Object.fromEntries([...roles].map((role) => [role, manifest.users.filter((user) => user.role === role).length]));
if (roleCounts.ADMIN < 1 || roleCounts.INVESTIGATOR < 2 || roleCounts.REVIEWER < 1 || roleCounts.VIEWER < 1) {
  throw new Error('Manifest requires at least 1 ADMIN, 2 INVESTIGATOR, 1 REVIEWER, and 1 VIEWER.');
}

console.log(`Validated ${manifest.users.length} staging users from ${manifestPath}.`);
for (const user of manifest.users) console.log(`PLAN  ${user.role.padEnd(12)} ${user.email}`);

if (!apply) {
  console.log('\nDry run only. Use --apply after replacing all example.invalid addresses and configuring staging secrets.');
  process.exit(0);
}

if (manifest.users.some((user) => user.email.endsWith('.invalid'))) {
  throw new Error('Replace all example.invalid addresses before --apply.');
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const appOrigin = process.env.APP_ORIGIN?.trim();
if (!supabaseUrl || !serviceRoleKey || !appOrigin) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and APP_ORIGIN are required.');
}
if (!supabaseUrl.startsWith('https://') || !appOrigin.startsWith('https://')) {
  throw new Error('Supabase URL and APP_ORIGIN must use HTTPS.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: listed, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw listError;

for (const planned of manifest.users) {
  let user = listed.users.find((candidate) => candidate.email?.toLowerCase() === planned.email.toLowerCase());
  let status = 'EXISTING';
  if (!user) {
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(planned.email, {
      data: { name: planned.name },
      redirectTo: `${appOrigin.replace(/\/$/, '')}/login`,
    });
    if (error) throw new Error(`Invite failed for ${planned.email}: ${error.message}`);
    user = data.user;
    status = 'INVITED';
  }
  if (!user) throw new Error(`Supabase did not return a user for ${planned.email}.`);

  const { error: profileError } = await supabase.from('profiles').upsert({
    id: user.id,
    email: planned.email,
    name: planned.name,
    role: planned.role,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (profileError) throw new Error(`Profile upsert failed for ${planned.email}: ${profileError.message}`);
  console.log(`${status.padEnd(8)} ${planned.role.padEnd(12)} ${planned.email}`);
}

console.log('\nStaging invitations and role profiles are ready. No passwords were generated or stored.');
