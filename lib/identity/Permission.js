'use strict';

const {Model} = require('../model');

class Permission extends Model {
  static fields = {
    id: {type: 'uuid', primaryKey: true},
    name: {type: 'string', isRequired: true, max: 100, unique: true},
    description: {type: 'text'},
  };

  static display = {
    name: 'Permission',
    titleField: 'name',
  };
}

module.exports = Permission;
