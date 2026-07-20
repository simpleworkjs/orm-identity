'use strict';

const {Model} = require('../model');

class UserGroup extends Model {
  static fields = {
    id: {type: 'uuid', primaryKey: true},
    user: {type: 'hasOne', model: 'User', isRequired: true},
    group: {type: 'hasOne', model: 'Group', isRequired: true},
  };

  static display = {
    name: 'User Group',
    titleField: 'id',
  };
}

module.exports = UserGroup;
