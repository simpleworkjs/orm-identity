'use strict';

const {Model} = require('../model');

class RolePermission extends Model {
  static fields = {
    id: {type: 'uuid', primaryKey: true},
    role: {type: 'hasOne', model: 'Role', isRequired: true},
    permission: {type: 'hasOne', model: 'Permission', isRequired: true},
  };

  static display = {
    name: 'Role Permission',
    titleField: 'id',
  };
}

module.exports = RolePermission;
