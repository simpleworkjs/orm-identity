'use strict';

const test = require('node:test');
const assert = require('node:assert');
const orm = require('..');
const {init, Model} = orm;
const {
  login,
  resolvePermissions,
  issueAuthToken,
  revokeAuthToken,
  revokeAllUserTokens,
  requireModelPermission,
  loadUserByToken,
  extractToken,
} = orm.auth;

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

test('login rejects a disabled (isValid: false) user even with correct password', async function() {
  const {models, user} = await setup();
  await user.update({isValid: false});
  const result = await login(models, 'alice', 'Wonderland1!');
  assert.strictEqual(result, null);
});

test('login takes comparable time for unknown username vs wrong password (no username enumeration)', async function() {
  const {models} = await setup();

  async function timeIt(fn) {
    const start = process.hrtime.bigint();
    await fn();
    return Number(process.hrtime.bigint() - start) / 1e6;
  }

  // Average a few runs since bcrypt timing has natural jitter.
  const runs = 5;
  let unknownTotal = 0;
  let wrongTotal = 0;
  for (let i = 0; i < runs; i++) {
    unknownTotal += await timeIt(() => login(models, 'no-such-user', 'whatever'));
    wrongTotal += await timeIt(() => login(models, 'alice', 'wrong-password'));
  }
  const unknownAvg = unknownTotal / runs;
  const wrongAvg = wrongTotal / runs;

  // Before the fix, the unknown-username path returned immediately without
  // ever calling bcrypt, so it was many times faster than the wrong-password
  // path. Assert they're within the same order of magnitude.
  assert.ok(
    unknownAvg > wrongAvg * 0.4,
    `unknown-username login (${unknownAvg}ms) was suspiciously faster than wrong-password login (${wrongAvg}ms)`
  );
});

test('loadUserByToken rejects a disabled (isValid: false) user', async function() {
  const {models, user} = await setup();
  const token = await issueAuthToken(user, models, 'test');

  await user.update({isValid: false});

  const resolved = await loadUserByToken(models, token.token);
  assert.strictEqual(resolved, null);
});

test('issueAuthToken with ttlHours: 0 expires immediately, not never', async function() {
  const {models, user} = await setup();
  const token = await issueAuthToken(user, models, 'test', 0);

  assert.ok(token.expiresAt, 'expiresAt must be set, not null, for ttlHours: 0');
  assert.ok(new Date(token.expiresAt) <= new Date(), 'token should already be expired');

  const resolved = await loadUserByToken(models, token.token);
  assert.strictEqual(resolved, null, 'an immediately-expired token must not resolve a user');
});

test('revokeAuthToken invalidates a token so it no longer resolves a user', async function() {
  const {models, user} = await setup();
  const token = await issueAuthToken(user, models, 'test');

  assert.ok(await loadUserByToken(models, token.token), 'token works before revocation');

  const revoked = await revokeAuthToken(models, token.token);
  assert.strictEqual(revoked, true);
  assert.strictEqual(await loadUserByToken(models, token.token), null, 'token stops working after revocation');
});

test('revokeAllUserTokens invalidates every active token for a user', async function() {
  const {models, user} = await setup();
  const t1 = await issueAuthToken(user, models, 'a');
  const t2 = await issueAuthToken(user, models, 'b');

  const count = await revokeAllUserTokens(models, user.id);
  assert.strictEqual(count, 2);

  assert.strictEqual(await loadUserByToken(models, t1.token), null);
  assert.strictEqual(await loadUserByToken(models, t2.token), null);
});

test('extractToken parses a well-formed Bearer header', function() {
  const req = {headers: {authorization: 'Bearer abc123'}};
  assert.strictEqual(extractToken(req), 'abc123');
});

test('extractToken rejects a malformed Authorization header instead of trusting it as a raw token', function() {
  // Previously a header without a valid "Bearer <token>" shape fell through
  // to `return header`, treating the whole header value as a token.
  assert.strictEqual(extractToken({headers: {authorization: 'abc123'}}), null);
  assert.strictEqual(extractToken({headers: {authorization: 'Bearer'}}), null);
  assert.strictEqual(extractToken({headers: {authorization: 'Bearer a b'}}), null);
  assert.strictEqual(extractToken({headers: {authorization: 'Basic dXNlcjpwYXNz'}}), null);
});

test('extractToken falls back to the session cookie when no header is present', function() {
  const req = {headers: {}, cookies: {swjs_token: 'cookie-token'}};
  assert.strictEqual(extractToken(req), 'cookie-token');
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
