'use strict';

const {Model} = require('@simpleworkjs/orm');

class Group extends Model {
  static fields = {
    id: {type: 'uuid', primaryKey: true},
    name: {type: 'string', isRequired: true, max: 100, unique: true},
    description: {type: 'text'},
  };

  static display = {
    name: 'Group',
    titleField: 'name',
  };
}

module.exports = Group;
