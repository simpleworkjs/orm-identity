'use strict';

const {Model} = require('@simpleworkjs/orm');

class GroupRole extends Model {
  static fields = {
    id: {type: 'uuid', primaryKey: true},
    group: {type: 'hasOne', model: 'Group', isRequired: true},
    role: {type: 'hasOne', model: 'Role', isRequired: true},
  };

  static display = {
    name: 'Group Role',
    titleField: 'id',
  };
}

module.exports = GroupRole;
