# @simpleworkjs/orm-identity

A model-first ORM with built-in identity and RBAC models. Designed for internal apps, homelab tools, and devops dashboards.

## Features

- Define models once with a `static fields = {}` DSL.
- Auto-generated SQL tables (Sequelize/SQLite/Postgres/MySQL), Redis backing, or LDAP backing.
- Built-in identity models: `User`, `AuthToken`, `Group`, `Role`, `Permission`, plus join tables.
- RBAC permission resolution: User → Group → Role → Permission.
- Password hashing (bcrypt) and token-based auth helpers.
- Multi-backend from day one — a SQL `Project` can have an LDAP-backed `User` as its owner.

## Install

```bash
npm install @simpleworkjs/orm-identity
```

LDAP support requires `ldapts`:

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
      database: {dialect: 'sqlite', storage: 'data.sqlite', logging: false},
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

## Built-in identity models

The ORM automatically loads these models:

- `User` — `id`, `userName`, `email`, `password` (bcrypt), `isAdmin`, `isValid`.
- `AuthToken` — bearer tokens with optional expiry.
- `Group` — named collection of users.
- `Role` — named collection of permissions.
- `Permission` — action strings like `Task.create`, `admin`.
- `UserGroup`, `GroupRole`, `RolePermission` — join tables.

## Permission DSL

```js
static permissions = {
  read: ['user'],          // any authenticated user
  create: ['admin'],       // users with the admin permission
  update: ['admin', 'owner'], // admin or the record's creator
  delete: ['admin'],
};
```

Special tokens:

- `public` — no authentication required.
- `user` — any authenticated user.
- `admin` — user has the `admin` permission.
- `owner` — user id matches the record's `createdById` / `ownerId`.

## Multi-backend adapters

### Sequelize (default)

```js
await init({
  conf: {
    database: {dialect: 'sqlite', storage: 'data.sqlite', logging: false},
  },
});
```

### Redis

```js
await init({
  conf: {
    database: {enabled: false},
    redis: {prefix: 'myapp:'},
  },
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
    database: {enabled: false},
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
  models: [LdapUser],
});
```

## Tests

```bash
npm test
```

## License

MIT
