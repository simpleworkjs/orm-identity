'use strict';

const {Model} = require('@simpleworkjs/orm');

class Role extends Model {
  static fields = {
    id: {type: 'uuid', primaryKey: true},
    name: {type: 'string', isRequired: true, max: 100, unique: true},
    description: {type: 'text'},

    // Reggy-style entity access rules. A Role can govern a model
    // (`entityModel`) with tiered CRUD grants (`entityPermissions`), evaluated
    // per record against the caller's relationship to it. Active rules are
    // merged (most-permissive) into the runtime access policy.
    entityModel: {type: 'string', max: 100, display: {name: 'Governs model'}},
    entityPermissions: {type: 'json', display: {name: 'Grants'}},
    isActive: {type: 'boolean', default: true, display: {name: 'Active'}},
  };

  static display = {
    name: 'Role',
    titleField: 'name',
  };
}

module.exports = Role;
