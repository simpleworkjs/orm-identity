'use strict';

const {Model} = require('@simpleworkjs/orm');

class User extends Model {
  static fields = {
    id: {type: 'uuid', primaryKey: true},
    userName: {type: 'string', isRequired: true, min: 3, max: 50, unique: true},
    email: {type: 'email', isRequired: true},
    password: {type: 'password-bcrypt', isRequired: true},
    isAdmin: {type: 'boolean', default: false},
    isValid: {type: 'boolean', default: true},
  };

  static display = {
    name: 'User',
    titleField: 'userName',
  };

  // Never client-settable through generic REST bodies (e.g.
  // @simpleworkjs/backend's auto-generated routes) — only application code
  // should be able to grant admin or disable an account.
  static protectedFields = ['isAdmin', 'isValid'];
}

module.exports = User;
