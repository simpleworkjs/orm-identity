'use strict';

const {Model} = require('../model');

class AuthToken extends Model {
  static fields = {
    id: {type: 'uuid', primaryKey: true},
    token: {type: 'uuidv4', unique: true},
    name: {type: 'string', max: 100},
    expiresAt: {type: 'date'},
    isValid: {type: 'boolean', default: true},
    user: {type: 'hasOne', model: 'User', isRequired: true},
  };

  static display = {
    name: 'Auth Token',
    titleField: 'name',
  };
}

module.exports = AuthToken;
