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
}

module.exports = User;
