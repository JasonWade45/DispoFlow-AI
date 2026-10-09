import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const db = new PGlite();
const users = {
  ownerA: '11111111-1111-4111-8111-111111111111',
  ownerB: '22222222-2222-4222-8222-222222222222',
  outsider: '33333333-3333-4333-8333-333333333333',
};
let assertions = 0;
async function asRole(role, uid, sql, params = []) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  await db.exec(`set role ${role}`);
  try { return await db.query(sql, params); }
  finally { await db.exec('reset role'); }
}
const as = (uid, sql, params = []) => asRole('authenticated', uid, sql, params);
async function rejectsAsRole(role, uid, sql, params, label) {
  let rejected = false;
  try { await asRole(role, uid, sql, params); }
  catch (error) { rejected = true; console.log(`DENY ${label}: ${String(error.message).split('\n')[0]}`); }
  assert.equal(rejected, true, `Expected denial: ${label}`);
  assertions++;
}
const rejectsAs = (uid, sql, params, label) => rejectsAsRole('authenticated', uid, sql, params, label);

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users (id) values
      ('${users.ownerA}'), ('${users.ownerB}'), ('${users.outsider}');
  `);
  await db.exec(fs.readFileSync(resolve(repoRoot, 'supabase/migrations/0001_disposition_core.sql'), 'utf8'));

  await rejectsAsRole('anon', '', 'select * from public.properties', [], 'anonymous data access');
  await rejectsAsRole('anon', '', "select public.create_workspace('Anonymous Workspace')", [], 'anonymous workspace creation');

  const orgA = (await as(users.ownerA, "select public.create_workspace('Workspace A') as id")).rows[0].id;
  const orgB = (await as(users.ownerB, "select public.create_workspace('Workspace B') as id")).rows[0].id;
  const propertyA = (await as(users.ownerA,
    `insert into public.properties (organization_id,address,city,state) values ($1,'41 Main St','Cleveland','OH') returning id,created_by`, [orgA])).rows[0];
  const buyerA = (await as(users.ownerA,
    `insert into public.buyers (organization_id,full_name,email,phone) values ($1,'Buyer A','buyer-a@example.com','(216) 555-0140') returning id,created_by`, [orgA])).rows[0];
  const propertyB = (await as(users.ownerB,
    `insert into public.properties (organization_id,address,city,state) values ($1,'51 Main St','Akron','OH') returning id`, [orgB])).rows[0];
  const buyerB = (await as(users.ownerB,
    `insert into public.buyers (organization_id,full_name) values ($1,'Buyer B') returning id`, [orgB])).rows[0];
  assert.equal(propertyA.created_by, users.ownerA, 'created_by must be stamped from auth.uid'); assertions++;
  assert.equal((await as(users.ownerA, 'select count(*)::int as n from public.properties')).rows[0].n, 1, 'tenant A sees only its property'); assertions++;
  assert.equal((await as(users.outsider, 'select count(*)::int as n from public.properties')).rows[0].n, 0, 'outsider sees no tenant properties'); assertions++;
  await rejectsAs(users.ownerA,
    'insert into public.properties (organization_id,address,city,state) values ($1,$2,$3,$4)',
    [orgB, '99 Other St', 'Akron', 'OH'], 'cross-tenant RLS insert');
  await rejectsAs(users.ownerA,
    `insert into public.properties (organization_id,address,city,state) values ($1,'41 MAIN ST!','CLEVELAND','OH')`, [orgA], 'normalized duplicate property');
  await rejectsAs(users.ownerA,
    `insert into public.properties (organization_id,address,city,state) values ($1,'52 Extra St','Cleveland ','OH')`, [orgA], 'trimmed city validation');
  await rejectsAs(users.ownerA,
    `insert into public.properties (organization_id,address,city,state,zip_code) values ($1,'53 Extra St','Cleveland','OH','44113 ')`, [orgA], 'trimmed ZIP validation');
  await rejectsAs(users.ownerA,
    'insert into public.buyer_property_interests (organization_id,buyer_id,property_id) values ($1,$2,$3)',
    [orgA, buyerB.id, propertyA.id], 'cross-tenant relationship foreign key');
  await rejectsAs(users.ownerA,
    'insert into public.buyer_property_interests (organization_id,buyer_id,property_id,assigned_user_id) values ($1,$2,$3,$4)',
    [orgA, buyerA.id, propertyA.id, users.ownerB], 'non-member assignee foreign key');
  await rejectsAs(users.ownerA,
    'update public.properties set organization_id=$1 where id=$2', [orgB, propertyA.id], 'organization reassignment / no column grant');
  await rejectsAs(users.ownerA,
    'update public.properties set created_at=now() where id=$1', [propertyA.id], 'metadata column tampering');
  await rejectsAs(users.ownerA,
    `insert into public.buyers (organization_id,full_name,email) values ($1,'Invalid Email','not-an-email')`, [orgA], 'email validation');
  await rejectsAs(users.ownerA,
    `insert into public.buyers (organization_id,full_name,preferred_markets) values ($1,'Too Many Markets',array_fill('x'::text,array[51]))`, [orgA], 'array cardinality validation');
  await rejectsAs(users.ownerA,
    `insert into public.buyers (organization_id,full_name,general_notes) values ($1,'Oversized Notes',repeat('x',10001))`, [orgA], 'note length validation');

  const interaction = (await as(users.ownerA,
    `insert into public.interactions (organization_id,buyer_id,property_id,interaction_type,direction,occurred_at,original_content)
     values ($1,$2,$3,'internal_note','internal',now(),'Original note') returning id,recorded_at,created_by`, [orgA, buyerA.id, propertyA.id])).rows[0];
  assert.equal(interaction.created_by, users.ownerA, 'interaction actor is stamped'); assertions++;
  assert.ok(interaction.recorded_at, 'interaction has database recording time'); assertions++;
  await rejectsAs(users.ownerA, 'update public.interactions set original_content=\'tampered\' where id=$1', [interaction.id], 'interaction update');
  await rejectsAs(users.ownerA, 'delete from public.interactions where id=$1', [interaction.id], 'interaction delete');
  const task = (await as(users.ownerA,
    `insert into public.follow_up_tasks (organization_id,buyer_id,property_id,related_interaction_id,task_description,due_at,status)
     values ($1,$2,$3,$4,'Call buyer',now(),'scheduled') returning id,created_by,completed_at`, [orgA,buyerA.id,propertyA.id,interaction.id])).rows[0];
  assert.equal(task.created_by, users.ownerA, 'task actor is stamped'); assertions++;
  await rejectsAs(users.ownerA, 'update public.follow_up_tasks set buyer_id=$1 where id=$2', [buyerB.id, task.id], 'task relationship reassignment');
  await as(users.ownerA, `update public.follow_up_tasks set status='completed' where id=$1`, [task.id]);
  assert.ok((await as(users.ownerA, 'select completed_at from public.follow_up_tasks where id=$1', [task.id])).rows[0].completed_at, 'completion timestamp is database-stamped'); assertions++;
  await rejectsAs(users.ownerA,
    `insert into public.follow_up_tasks (organization_id,buyer_id,task_description,status) values ($1,$2,'Unscheduled but marked scheduled','scheduled')`,
    [orgA,buyerA.id], 'scheduled task requires a due date');

  const relation = (await as(users.ownerA,
    `insert into public.buyer_property_interests (organization_id,buyer_id,property_id) values ($1,$2,$3) returning id`,
    [orgA, buyerA.id, propertyA.id])).rows[0];
  await as(users.ownerA, "update public.buyer_property_interests set interest_status='interested' where id=$1", [relation.id]);
  const statusHistory = (await as(users.ownerA, 'select changed_by from public.buyer_property_interest_history where buyer_property_interest_id=$1', [relation.id])).rows[0];
  assert.equal(statusHistory.changed_by, users.ownerA, 'status history is trigger-generated with the authenticated actor'); assertions++;
  await rejectsAs(users.ownerA, 'delete from public.buyer_property_interest_history where buyer_property_interest_id=$1', [relation.id], 'status-history delete');
  await as(users.ownerA, 'delete from public.buyer_property_interests where id=$1', [relation.id]);
  assert.equal((await as(users.ownerA, 'select count(*)::int as n from public.buyer_property_interest_history where buyer_id=$1 and property_id=$2 and buyer_property_interest_id is null', [buyerA.id, propertyA.id])).rows[0].n, 1, 'status history survives relationship deletion'); assertions++;

  const auditRow = (await as(users.ownerA, "select actor_user_id from public.audit_events where entity_type='properties' and entity_id=$1 and action='insert' order by occurred_at desc limit 1", [propertyA.id])).rows[0];
  assert.equal(auditRow.actor_user_id, users.ownerA, 'audit trigger records the authenticated actor'); assertions++;
  await rejectsAs(users.ownerA,
    "insert into public.audit_events (organization_id,entity_type,action) values ($1,'properties','fake')", [orgA], 'audit-event insert');
  await rejectsAs(users.ownerA, 'update public.audit_events set action=\'tampered\' where organization_id=$1', [orgA], 'audit-event update');
  await rejectsAs(users.ownerA, 'delete from public.audit_events where organization_id=$1', [orgA], 'audit-event delete');
  await rejectsAs(users.ownerA,
    "update public.organization_members set role='admin' where organization_id=$1 and user_id=$2", [orgA, users.ownerA], 'last active owner demotion');
  await rejectsAs(users.outsider,
    'select public.create_workspace($1)', ['   '], 'workspace-name validation');

  const adminTestProperty = (await as(users.ownerA,
    `insert into public.properties (organization_id,address,city,state) values ($1,'77 Admin Test Ave','Cleveland','OH') returning id`, [orgA])).rows[0];
  const newMember = (await as(users.ownerA,
    `insert into public.organization_members (organization_id,user_id,role) values ($1,$2,'team_member') returning joined_at`, [orgA, users.outsider])).rows[0];
  assert.ok(newMember.joined_at, 'membership join timestamp is set by trigger'); assertions++;
  assert.equal((await as(users.outsider, 'select count(*)::int as n from public.properties')).rows[0].n, 2, 'active member sees tenant properties'); assertions++;
  const blockedDelete = await as(users.outsider, 'delete from public.properties where id=$1 returning id', [adminTestProperty.id]);
  assert.equal(blockedDelete.rows.length, 0, 'team member cannot delete tenant property'); assertions++;
  await as(users.outsider, `update public.buyers set status='do_not_contact' where id=$1`, [buyerA.id]);
  await rejectsAs(users.outsider, `update public.buyers set status='active' where id=$1`, [buyerA.id], 'team member cannot clear DNC');
  const dncAudit = (await as(users.outsider,
    `select actor_user_id,details->'status_change' as status_change from public.audit_events
     where entity_type='buyers' and entity_id=$1 and action='update' and details->'status_change'->>'to'='do_not_contact'
     order by occurred_at desc limit 1`, [buyerA.id])).rows[0];
  assert.equal(dncAudit.actor_user_id, users.outsider, 'DNC status change is attributed'); assertions++;
  assert.equal(dncAudit.status_change.from, 'active', 'DNC transition is recorded in audit details'); assertions++;
  await as(users.ownerA, `update public.buyers set status='active' where id=$1`, [buyerA.id]);
  await as(users.ownerA, `update public.organization_members set role='admin' where organization_id=$1 and user_id=$2`, [orgA, users.outsider]);
  await rejectsAs(users.outsider,
    `update public.organization_members set role='owner' where organization_id=$1 and user_id=$2`, [orgA, users.outsider], 'admin cannot promote self to owner');
  const allowedDelete = await as(users.outsider, 'delete from public.properties where id=$1 returning id', [adminTestProperty.id]);
  assert.equal(allowedDelete.rows.length, 1, 'admin can delete tenant property'); assertions++;
  assert.ok((await as(users.outsider, "select count(*)::int as n from public.audit_events where entity_type='properties' and entity_id=$1 and action='delete'", [adminTestProperty.id])).rows[0].n >= 1, 'admin delete is audited'); assertions++;

  console.log(`PASS: migration applied in PGlite with Supabase auth stubs; ${assertions} denial/behavior assertions passed.`);
} catch (error) {
  console.error('FAIL:', error.stack ?? error);
  process.exitCode = 1;
} finally {
  await db.close();
}
