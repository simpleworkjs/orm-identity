'use strict';

/**
 * Built-in identity and RBAC models.
 *
 * These are always loaded by the ORM factory so every app gets users,
 * groups, roles, permissions, auth tokens, and join tables.
 */

const User = require('./User');
const AuthToken = require('./AuthToken');
const Group = require('./Group');
const Role = require('./Role');
const Permission = require('./Permission');
const UserGroup = require('./UserGroup');
const GroupRole = require('./GroupRole');
const RolePermission = require('./RolePermission');

module.exports = {
  User,
  AuthToken,
  Group,
  Role,
  Permission,
  UserGroup,
  GroupRole,
  RolePermission,
};
