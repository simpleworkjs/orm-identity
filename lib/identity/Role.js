'use strict';

const {Model} = require('../model');

class Role extends Model {
  static fields = {
    id: {type: 'uuid', primaryKey: true},
    name: {type: 'string', isRequired: true, max: 100, unique: true},
    description: {type: 'text'},
  };

  static display = {
    name: 'Role',
    titleField: 'name',
  };
}

module.exports = Role;
