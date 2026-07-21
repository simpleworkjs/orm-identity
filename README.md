# @simpleworkjs/orm-identity

Identity and RBAC layer on top of [`@simpleworkjs/orm`](https://github.com/simpleworkjs/orm). Adds built-in `User`, `Group`, `Role`, `Permission`, and `AuthToken` models, a permission DSL, and a token/session auth toolkit. Designed for internal apps, homelab tools, and devops dashboards.

## Features

- Everything in `@simpleworkjs/orm` — the same `static fields = {}` DSL, the same multi-backend adapters (Sequelize/SQL, Redis, LDAP). It re-exports the base ORM, so you only need to depend on this package.
- Built-in identity models: `User`, `AuthToken`, `Group`, `Role`, `Permission`, plus the `UserGroup`, `GroupRole`, `RolePermission` join tables — loaded automatically.
- RBAC permission resolution following the chain **User → Group → Role → Permission** (plus the `isAdmin` shortcut).
- Password hashing (bcrypt) and a token/session auth toolkit (`auth.*`) with Express middleware.

## Install

```bash
npm install @simpleworkjs/orm-identity
```

LDAP support additionally requires `ldapts`:

```bash
npm install ldapts
```

## Quick start

```js
const {init, Model} = require('@simpleworkjs/orm-identity');

class Task extends Model {
  static fields = {
    id: {type: 'uuid', primaryKey: true},
    title: {type: 'string', isRequired: true},
    done: {type: 'boolean', default: false},
    createdBy: {type: 'hasOne', model: 'User'},
  };

  static permissions = {
    read: ['user'],
    create: ['admin'],
    update: ['admin', 'owner'],
    delete: ['admin'],
  };
}

(async function() {
  const models = await init({
    conf: {
      orm: {dialect: 'sqlite', storage: 'data.sqlite', logging: false},
    },
    models: [Task],
  });

  const user = await models.User.create({
    userName: 'admin',
    email: 'admin@example.com',
    password: 'Changeme1!',
    isAdmin: true,
  });

  const task = await models.Task.create({title: 'My first task', createdById: user.id});
  console.log(task.toJSON());
})();
```

> **Configuration lives under a single `conf.orm` block.** There is no separate
> `database`, `redis`, or `enabled` key — the base ORM reads everything from
> `conf.orm`, and per-model backends are selected with `static adapterName`.
> See [Multi-backend adapters](#multi-backend-adapters).

## `init(options)`

Loads the built-in identity models first (so app models can reference `User`, etc.), then your app models, and returns the resolved `models` map.

| Option | Description |
|--------|-------------|
| `conf` | Configuration object. The ORM reads its `orm` section (`conf.orm`). |
| `models` | Array **or** object of app-specific `Model` classes. |
| `pubsub` | Optional pub/sub instance passed through to the ORM. |

## Package exports

```js
const {ORM, Model, fields, adapters, identity, auth, init} = require('@simpleworkjs/orm-identity');
```

- `ORM`, `Model`, `fields`, `adapters` — re-exported from `@simpleworkjs/orm`.
- `identity` — the built-in model classes (`{User, AuthToken, Group, Role, Permission, UserGroup, GroupRole, RolePermission}`).
- `auth` — the auth/RBAC toolkit (see [Auth toolkit](#auth-toolkit)).
- `init` — the factory above.

## Built-in identity models

Loaded automatically by `init()`:

| Model | Purpose |
|-------|---------|
| `User` | `id`, `userName`, `email`, `password` (bcrypt, private), `isAdmin`, `isValid`. Instances expose `passwordCompare(plaintext)`. |
| `AuthToken` | Bearer tokens: `token`, `name`, `userId`, `isValid`, `expiresAt`. |
| `Group` | Named collection of users. |
| `Role` | Named collection of permissions. |
| `Permission` | Action strings like `Task.create` or `admin`. |
| `UserGroup`, `GroupRole`, `RolePermission` | Join tables wiring the RBAC chain. |

Setting `user.isValid = false` disables the account: it can no longer log in, and any existing token stops resolving to a user.

## Model API

`orm-identity`'s `Model` is the base ORM's `Model`, so every model — built-in and app-defined — has the same surface. After `init()` resolves:

```js
const task = await models.Task.create({title: 'New task'});
const list = await models.Task.list({where: {done: false}});
const one  = await models.Task.get(task.id);
await one.update({done: true});
await one.delete();

task.toJSON();                    // plain object, private fields omitted
Task.hasPermission(user, 'read'); // static, model-level check
one.hasPermission(user, 'update'); // instance-level (evaluates 'owner')
```

For the full field-type table and relationship semantics, see the
[`@simpleworkjs/orm` README](https://github.com/simpleworkjs/orm#field-types).

## Permission DSL

Declare `static permissions` per model with an array of tokens per action:

```js
static permissions = {
  read: ['user'],             // any authenticated user
  create: ['admin'],          // users with the admin permission
  update: ['admin', 'owner'], // admin, or the record's creator
  delete: ['admin'],
};
```

Special tokens:

- `public` — no authentication required.
- `user` — any authenticated user.
- `admin` — user has the `admin` permission (granted directly via `isAdmin` or through the RBAC chain).
- `owner` — the acting user's id matches the record's `createdById` / `ownerId`. Only meaningful for instance-level checks.

Any other token is treated as a named permission and matched against the user's resolved permission set.

## Auth toolkit

`require('@simpleworkjs/orm-identity').auth` is a set of framework-agnostic
helpers. Every function takes the resolved `models` map so it stays decoupled
from any particular ORM instance.

### Authenticating a login

```js
const {auth} = require('@simpleworkjs/orm-identity');

const user = await auth.login(models, userName, password);
// -> User instance on success, or null on bad credentials / disabled account.
```

`login` runs bcrypt on every call (even on an unknown username) so it does not
leak, via timing, whether a username exists.

### Issuing and revoking tokens

```js
const token = await auth.issueAuthToken(user, models, 'cli', 24); // ttlHours optional
console.log(token.token);          // the bearer value to hand to the client

await auth.revokeAuthToken(models, token.token);   // -> true if it existed
await auth.revokeAllUserTokens(models, user.id);   // -> count revoked
```

Omitting `ttlHours` creates a non-expiring token; `0` means "already expired".

### Express middleware

`authMiddleware` resolves the incoming request's bearer token (`Authorization: Bearer <token>`) or `swjs_token` cookie into `req.user` and `req.permissions` (a `Set`). It never rejects — it just populates the request.

```js
const express = require('express');
const {auth} = require('@simpleworkjs/orm-identity');

const app = express();
app.use(auth.authMiddleware(models));

// Coarse, permission-name gate:
app.post('/admin/rebuild', auth.requirePermission('admin'), handler);

// Model-level gate (uses the model's static permissions):
app.get('/api/Task', auth.requireModelPermission(models.Task, 'read'), handler);

// Instance-level gate — loads the record into req.instance and evaluates
// 'owner' against it (404 if not found):
app.put('/api/Task/:id',
  auth.requireInstancePermission(models.Task, 'update'),
  (req, res) => res.json(req.instance));
```

### Full `auth.*` reference

| Function | Returns | Notes |
|----------|---------|-------|
| `login(models, userName, password)` | `User` \| `null` | Constant-time; rejects disabled users. |
| `issueAuthToken(user, models, name?, ttlHours?)` | `AuthToken` | `name` defaults to `'api'`. |
| `revokeAuthToken(models, token)` | `boolean` | Marks the token `isValid: false`. |
| `revokeAllUserTokens(models, userId)` | `number` | Count of tokens revoked. |
| `loadUserByToken(models, token)` | `User` \| `null` | Honours expiry and `isValid`. |
| `resolvePermissions(user, models)` | `Set<string>` | Walks the User → Group → Role → Permission chain. |
| `authMiddleware(models)` | middleware | Populates `req.user` / `req.permissions`. |
| `requirePermission(action)` | middleware | 401 if unauthenticated, 403 if lacking the permission. |
| `requireModelPermission(Model, action)` | middleware | Static model-level check. |
| `requireInstancePermission(Model, action)` | middleware | Loads `req.instance`, evaluates `owner`. |
| `permissionUser(req)` | `{id, permissions}` \| `null` | Adapts a request into the shape `hasPermission` expects. |
| `extractToken(req)` | `string` \| `null` | Bearer header or `swjs_token` cookie. |
| `attachPermissions(user, permissions)` | `user` | Attaches a non-enumerable `permissions` set. |
| `COOKIE_NAME` | `'swjs_token'` | The session cookie name. |

Most apps never call these directly — [`@simpleworkjs/backend`](https://github.com/simpleworkjs/backend) wires `authMiddleware` and the `require*Permission` guards into its auto-generated routes for you.

## Multi-backend adapters

Backends are selected per model with `static adapterName`; there is no
top-level "enable Redis / enable LDAP" switch. Configuration for each backend
lives under `conf.orm`.

### Sequelize (default)

```js
await init({
  conf: {orm: {dialect: 'sqlite', storage: 'data.sqlite', logging: false}},
});
```

### Redis

```js
class CacheEntry extends Model {
  static adapterName = 'redis';
  static fields = {/* ... */};
}

await init({
  conf: {orm: {redis: {/* model-redis options */}}},
  models: [CacheEntry],
});
```

### LDAP

```js
class LdapUser extends Model {
  static adapterName = 'ldap';
  static fields = {
    uid: {type: 'string', primaryKey: true},
    cn: {type: 'string'},
    mail: {type: 'email'},
  };
}

await init({
  conf: {
    orm: {
      ldap: {
        url: 'ldap://localhost',
        bindDN: 'cn=admin,dc=example,dc=com',
        bindPassword: 'secret',
        userBase: 'ou=users,dc=example,dc=com',
        models: {
          LdapUser: {
            objectClass: 'inetOrgPerson',
            rdnAttribute: 'uid',
            base: 'ou=users,dc=example,dc=com',
          },
        },
      },
    },
  },
  models: [LdapUser],
});
```

## Tests

```bash
npm test
```

## License

MIT
