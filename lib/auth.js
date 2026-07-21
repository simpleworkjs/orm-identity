'use strict';

/**
 * Auth layer for @simpleworkjs/orm-identity.
 *
 * Resolves a bearer token or session cookie into a user, then resolves the
 * user's effective permissions from Group -> Role -> Permission chains.
 */

const bcrypt = require('bcrypt');
const {v4: uuidv4} = require('uuid');

const TOKEN_HEADER = 'authorization';
const COOKIE_NAME = 'swjs_token';

// Used to give bcrypt.compare something to hash-and-compare against even
// when no user was found, so a lookup miss takes the same time as a wrong
// password instead of returning early. Value is irrelevant; it never matches
// a real password.
const DUMMY_HASH = bcrypt.hashSync('no-such-user', 10);

function extractToken(req) {
  const header = req.headers[TOKEN_HEADER] || req.headers[TOKEN_HEADER.toLowerCase()];
  if (header) {
    const parts = header.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      return parts[1];
    }
    // Malformed Authorization header (missing "Bearer", extra spaces, etc.)
    // must not be treated as a literal token value.
    return null;
  }
  if (req.cookies && req.cookies[COOKIE_NAME]) {
    return req.cookies[COOKIE_NAME];
  }
  return null;
}

async function loadUserByToken(models, token) {
  if (!token) return null;
  const tokens = await models.AuthToken.list({where: {token, isValid: true}});
  const authToken = tokens[0];
  if (!authToken) return null;
  // A token is expired the instant the clock reaches `expiresAt`, so use `<=`,
  // not `<`. With a strict `<`, a token whose `expiresAt` equals "now" (e.g.
  // one issued with `ttlHours: 0`) stays valid for that whole instant — a
  // real off-by-one at the boundary, and a source of same-tick test flakiness.
  if (authToken.expiresAt && new Date(authToken.expiresAt) <= new Date()) {
    return null;
  }
  const user = await models.User.get(authToken.userId);
  if (!user || user.isValid === false) return null;
  return user;
}

async function resolvePermissions(user, models) {
  const perms = new Set();
  if (!user) return perms;

  if (user.isAdmin) {
    perms.add('admin');
  }

  const userGroups = await models.UserGroup.list({where: {userId: user.id}});
  const groupIds = userGroups.map(ug => ug.groupId);
  if (groupIds.length) {
    const groupRoles = await models.GroupRole.list({where: {groupId: groupIds}});
    const roleIds = groupRoles.map(gr => gr.roleId);
    if (roleIds.length) {
      const rolePermissions = await models.RolePermission.list({where: {roleId: roleIds}});
      const permissionIds = rolePermissions.map(rp => rp.permissionId);
      if (permissionIds.length) {
        const permissions = await models.Permission.list({where: {id: permissionIds}});
        permissions.forEach(p => perms.add(p.name));
      }
    }
  }

  return perms;
}

function attachPermissions(user, permissions) {
  if (!user) return null;
  Object.defineProperty(user, 'permissions', {
    value: permissions,
    enumerable: false,
    writable: true,
    configurable: true,
  });
  return user;
}

function authMiddleware(models) {
  return async function(req, res, next) {
    try {
      const token = extractToken(req);
      const user = await loadUserByToken(models, token);
      req.permissions = user ? await resolvePermissions(user, models) : new Set();
      req.user = attachPermissions(user, req.permissions);
      next();
    } catch (error) {
      next(error);
    }
  };
}

function requirePermission(action) {
  return function(req, res, next) {
    if (!req.user) {
      return res.status(401).json({error: {message: 'Authentication required'}});
    }
    if (!req.permissions.has('admin') && !req.permissions.has(action)) {
      return res.status(403).json({error: {message: `Permission denied: ${action}`}});
    }
    next();
  };
}

function permissionUser(req) {
  return req.user ? {id: req.user.id, permissions: req.permissions || new Set()} : null;
}

function requireModelPermission(Model, action) {
  return function(req, res, next) {
    if (!Model.hasPermission(permissionUser(req), action)) {
      const status = req.user ? 403 : 401;
      const message = req.user
        ? `Permission denied for ${Model.name}.${action}`
        : 'Authentication required';
      return res.status(status).json({error: {message}});
    }
    next();
  };
}

function requireInstancePermission(Model, action) {
  return async function(req, res, next) {
    const instance = await Model.get(req.params[Model.primaryKey.name]);
    if (!instance) {
      return res.status(404).json({error: {message: `${Model.name} not found`}});
    }
    req.instance = instance;
    if (!instance.hasPermission(permissionUser(req), action)) {
      const status = req.user ? 403 : 401;
      const message = req.user
        ? `Permission denied for ${Model.name}.${action}`
        : 'Authentication required';
      return res.status(status).json({error: {message}});
    }
    next();
  };
}

async function issueAuthToken(user, models, name, ttlHours) {
  // `ttlHours` of `0` means "expire immediately", not "no expiration" — only
  // treat it as absent when it's actually undefined/null.
  const expiresAt = ttlHours !== undefined && ttlHours !== null
    ? new Date(Date.now() + ttlHours * 60 * 60 * 1000)
    : null;

  return await models.AuthToken.create({
    token: uuidv4(),
    name: name || 'api',
    userId: user.id,
    isValid: true,
    expiresAt,
  });
}

async function revokeAuthToken(models, token) {
  const tokens = await models.AuthToken.list({where: {token}});
  const authToken = tokens[0];
  if (!authToken) return false;
  await authToken.update({isValid: false});
  return true;
}

async function revokeAllUserTokens(models, userId) {
  const tokens = await models.AuthToken.list({where: {userId, isValid: true}});
  await Promise.all(tokens.map(t => t.update({isValid: false})));
  return tokens.length;
}

async function login(models, userName, password) {
  const users = await models.User.list({where: {userName}});
  const user = users[0];
  // Always run bcrypt.compare, even on a lookup miss, so this function takes
  // roughly the same time whether or not the username exists — otherwise the
  // early return on a missing user is a timing side-channel that lets an
  // attacker enumerate valid usernames.
  const ok = user
    ? await user.passwordCompare(password)
    : await bcrypt.compare(password, DUMMY_HASH);
  if (!user || !ok) return null;
  if (user.isValid === false) return null;
  return user;
}

module.exports = {
  authMiddleware,
  extractToken,
  requirePermission,
  requireModelPermission,
  requireInstancePermission,
  permissionUser,
  resolvePermissions,
  issueAuthToken,
  revokeAuthToken,
  revokeAllUserTokens,
  loadUserByToken,
  login,
  attachPermissions,
  COOKIE_NAME,
};
