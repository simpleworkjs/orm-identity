'use strict';

const test = require('node:test');
const assert = require('node:assert');
const orm = require('..');
const {init, Model} = orm;
const {login, resolvePermissions, issueAuthToken, requireModelPermission} = orm.auth;

function makeConf() {
  return {
    orm: {
      dialect: 'sqlite',
      storage: ':memory:',
      logging: false,
    },
  };
}

class Task extends Model {
  static fields = {
    id: {type: 'uuid', primaryKey: true},
    title: {type: 'string', isRequired: true},
  };

  static permissions = {
    read: ['user'],
    create: ['admin'],
  };
}

async function setup() {
  const models = await init({conf: makeConf(), models: [Task]});

  const user = await models.User.create({
    userName: 'alice',
    email: 'alice@example.com',
    password: 'Wonderland1!',
  });

  const group = await models.Group.create({name: 'Editors'});
  const role = await models.Role.create({name: 'Editor'});
  const perm = await models.Permission.create({name: 'Task.create'});

  await models.UserGroup.create({userId: user.id, groupId: group.id});
  await models.GroupRole.create({groupId: group.id, roleId: role.id});
  await models.RolePermission.create({roleId: role.id, permissionId: perm.id});

  return {models, user};
}

test('login succeeds with valid credentials', async function() {
  const {models} = await setup();
  const user = await login(models, 'alice', 'Wonderland1!');
  assert.ok(user, 'user returned');
  assert.strictEqual(user.userName, 'alice');
});

test('login fails with invalid credentials', async function() {
  const {models} = await setup();
  const user = await login(models, 'alice', 'wrong');
  assert.strictEqual(user, null);
});

test('resolvePermissions collects role permissions through groups', async function() {
  const {models, user} = await setup();
  const perms = await resolvePermissions(user, models);
  assert.ok(perms.has('Task.create'), 'has Task.create from role');
  assert.strictEqual(perms.has('admin'), false, 'not admin');
});

test('issueAuthToken creates a usable token', async function() {
  const {models, user} = await setup();
  const token = await issueAuthToken(user, models, 'test');
  assert.ok(token.token, 'token has value');
  assert.ok(token.userId, 'token linked to user');

  const fetched = await models.AuthToken.get(token.id);
  assert.ok(fetched, 'token persisted');
});

test('requireModelPermission rejects anonymous and allows permitted user', async function() {
  const {models} = await setup();
  const middleware = requireModelPermission(models.Task, 'create');

  function run(req) {
    let status = null;
    let calledNext = false;
    const res = {
      status: function(s) { status = s; return this; },
      json: function() { return this; },
    };
    return new Promise(function(resolve) {
      middleware(req, res, function() { calledNext = true; resolve(); });
      setImmediate(function() {
        if (!calledNext) resolve();
      });
    }).then(function() {
      return status;
    });
  }

  const anonStatus = await run({user: null, permissions: new Set()});
  assert.strictEqual(anonStatus, 401, 'anonymous rejected');

  const adminStatus = await run({user: {id: 'a', permissions: new Set(['admin'])}, permissions: new Set(['admin'])});
  assert.strictEqual(adminStatus, null, 'admin allowed');
});
