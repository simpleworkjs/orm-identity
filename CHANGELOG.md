# Changelog

## 0.2.3

### Changed

- Raised the `@simpleworkjs/orm` dependency floor to `^0.2.6` so installs pull the
  ORM release carrying hooks/validation, soft-delete, query operators,
  transactions, and `belongsToMany`. No identity code changes — the runtime access
  policy already works against `orm ^0.2.5`; this pins the newer ORM surface for
  apps building on the identity layer.

## 0.2.2

### Changed

- Raised the `@simpleworkjs/orm` dependency floor from `^0.2.0` to `^0.2.5` so a
  fresh install always resolves an ORM with the `json` field type and the runtime
  `_accessPolicy` hook that the DB-backed access rules (0.2.1) depend on. Without
  this, `^0.2.0` could resolve to a pre-`json` ORM and the entity-permission grants
  on Roles would fail to persist/evaluate. Code identical to 0.2.1.

## 0.2.1

### Added

- **DB-backed, runtime-editable access rules (reggy-style).** `Role` gains
  `entityModel`, `entityPermissions` (a `json` `{owner,group,everyone}×{crud}`
  grid), and `isActive` — a Role can govern a model with tiered CRUD grants
  (`lib/identity/Role.js`). New `auth` helpers (`lib/auth.js`):
  `installAccessPolicy` (seeds a default governing Role per model from its
  `static permissions`, builds the merged `orm._accessPolicy`, and rebuilds it
  whenever a Role changes), `rebuildAccessPolicy`, and `seedDefaultRoles`.
  `init()` installs the policy after loading. The base model reads the policy for
  its access decisions; existing token behaviour is preserved by the seeded
  defaults until an admin edits a rule.

## 0.2.0

### Changed

- **Updated dependencies to clear known advisories.** `bcrypt` `^5.1.1` →
  `^6.0.0` and `uuid` `^9.0.1` → `^11.1.1`, and bumped the `@simpleworkjs/orm`
  range to `^0.2.0` (which carries its own dependency updates). Added an
  `overrides` entry pinning `uuid` to `^11.1.1`. Consumers on `^0.1.x` should
  bump to `^0.2.0`.

### Fixed

- **`npm test` was silently skipping root-level test files.** The script ran
  `node --test test/**/*.test.js`; without `bash` globstar enabled (the
  default), that pattern only matched files in subdirectories of `test/` and
  silently dropped any `*.test.js` directly under `test/`. Changed to
  `node --test`, which lets Node's test runner auto-discover all test files.
- **Login timing side-channel enabling username enumeration** (`lib/auth.js`):
  `login()` returned early when a username was not found, so a missing user
  resolved measurably faster than a wrong password. It now runs `bcrypt.compare`
  against a dummy hash on the lookup-miss path, so timing no longer reveals
  whether a username exists.
- **Disabled users retained login and session validity** (`lib/auth.js`):
  `login()` and `loadUserByToken()` did not check `isValid`, so an account set
  to `isValid: false` could still authenticate and resolve from an existing
  token. Both paths now reject disabled users.
- **No token revocation path** (`lib/auth.js`): added `revokeAuthToken` and
  `revokeAllUserTokens`, and `loadUserByToken` now honours `AuthToken.expiresAt`
  and `isValid`. `issueAuthToken` treats a `ttlHours` of `0` as
  "expire immediately" rather than "never expire".
- **Malformed `Authorization` headers were treated as literal tokens**
  (`lib/auth.js`): a header missing the `Bearer` scheme is now rejected instead
  of being used verbatim as a token value.
- **Token expiry was off by one at the boundary** (`lib/auth.js`):
  `loadUserByToken` compared `expiresAt < now` (strict), so a token whose
  expiry equalled the current instant — e.g. one issued with `ttlHours: 0` —
  stayed valid for that instant. Changed to `<=` so an exactly-expired token
  never resolves a user. (This also removes same-tick flakiness in the
  `ttlHours: 0` test.)

### Documentation

- Rewrote the README to match the actual `conf.orm` configuration convention
  (the previous `database:` / `redis:` / `enabled` examples were wrong), and
  added full reference docs for the `Model` API and the `auth.*` toolkit
  (login, token issue/revoke, and the Express permission middleware), none of
  which were previously documented.
