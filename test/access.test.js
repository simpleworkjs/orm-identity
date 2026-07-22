'use strict';

const test = require('node:test');
const assert = require('node:assert');
const identity = require('..');
const {init, Model} = identity;

function makeConf() {
  return {orm: {dialect: 'sqlite', storage: ':memory:', logging: false}};
}

class Note extends Model {
  static fields = {
    id: {type: 'uuid', primaryKey: true},
    title: {type: 'string'},
    createdBy: {type: 'hasOne', model: 'User'},
  };
  static permissions = {read: ['user'], create: ['user'], update: ['owner'], delete: ['owner']};
}

test('installAccessPolicy seeds a default Role per model and builds the tiered policy', async function() {
  const models = await init({conf: makeConf(), models: [Note]});
  const orm = models.Note.orm;

  const roles = await models.Role.list({where: {entityModel: 'Note'}});
  assert.strictEqual(roles.length, 1, 'a default governing Role was seeded for Note');

  const p = orm._accessPolicy.Note;
  assert.strictEqual(p.everyone.read, true);    // read:['user']   -> everyone
  assert.strictEqual(p.everyone.create, true);  // create:['user'] -> everyone
  assert.strictEqual(p.owner.update, true);     // update:['owner'] -> owner
  assert.strictEqual(p.everyone.update, false);
  await orm.close();
});

async function makeUsers(models) {
  const a = await models.User.create({userName: 'alice', email: 'a@e.com', password: 'Wonderland1!'});
  const b = await models.User.create({userName: 'bobby', email: 'b@e.com', password: 'Builder1234!'});
  return {
    alice: {id: a.id, permissions: []},
    bob: {id: b.id, permissions: []},
    admin: {id: a.id, permissions: ['admin']},
    aliceId: a.id,
  };
}

test('enforcement: owner updates, non-owner cannot; everyone reads', async function() {
  const models = await init({conf: makeConf(), models: [Note]});
  const {alice, bob, admin, aliceId} = await makeUsers(models);

  const note = await models.Note.create({title: 'x', createdById: aliceId});
  assert.strictEqual(note.hasPermission(alice, 'update'), true, 'owner updates');
  assert.strictEqual(note.hasPermission(bob, 'update'), false, 'non-owner cannot update');
  assert.strictEqual(note.hasPermission(bob, 'read'), true, 'everyone reads');
  assert.strictEqual(note.hasPermission(admin, 'delete'), true, 'admin bypass');
  await models.Note.orm.close();
});

test('editing a Role and rebuilding changes enforcement (turn off everyone.read)', async function() {
  const {rebuildAccessPolicy} = identity.auth;
  const models = await init({conf: makeConf(), models: [Note]});
  const orm = models.Note.orm;
  const {bob, aliceId} = await makeUsers(models);

  const roles = await models.Role.list({where: {entityModel: 'Note'}});
  const role = roles[0];
  // Clone (not mutate in place) so Sequelize sees a changed JSON value — the
  // real editor PUTs a fresh object, which has the same effect.
  const grants = JSON.parse(JSON.stringify(role.entityPermissions));
  grants.everyone.read = false;
  await role.update({entityPermissions: grants});
  await rebuildAccessPolicy(orm, models);

  assert.strictEqual(orm._accessPolicy.Note.everyone.read, false);
  const note = await models.Note.create({title: 'y', createdById: aliceId});
  assert.strictEqual(note.hasPermission(bob, 'read'), false, 'read now denied to non-owner');
  await orm.close();
});
