'use strict';

const {setUpTable} = require('model-redis');

/**
 * Redis adapter for @simpleworkjs/orm-identity.
 *
 * Functional adapter backed by model-redis. Supports scalar fields and
 * primary-key lookup. Cross-adapter relations use the ORM-level resolver.
 */
class RedisAdapter {
  constructor(config) {
    this.config = config;
    this.Table = setUpTable(config);
  }

  registerModel(Model) {
    const _keyMap = {};
    let primaryKeyName = null;

    for (const [name, field] of Object.entries(Model.fieldInstances)) {
      if (field.isRelationship) continue;
      _keyMap[name] = {
        type: field.jsType,
        isRequired: field.isRequired,
        default: field.default,
        isPrivate: field.isPrivate,
      };
      if (field.primaryKey) primaryKeyName = name;
    }

    if (!primaryKeyName) primaryKeyName = 'id';

    const BackingModel = class extends this.Table {};
    BackingModel._key = primaryKeyName;
    BackingModel._keyMap = _keyMap;
    BackingModel.name = Model.name;

    this.Table.register(BackingModel);
    Model.backingModel = BackingModel;
  }

  async sync() {
    // No schema sync needed for Redis.
  }

  async list(Model) {
    const rows = await Model.backingModel.list();
    return rows.map(row => new Model(row));
  }

  async create(Model, data) {
    const row = await Model.backingModel.create(data);
    return new Model(row);
  }

  async get(Model, pk) {
    try {
      const row = await Model.backingModel.get(pk);
      return new Model(row);
    } catch (error) {
      if (error.name === 'EntryNotFound') return null;
      throw error;
    }
  }

  async update(instance, data) {
    await instance._backing.update(instance.primaryKey, data);
    return instance;
  }

  async delete(instance) {
    await instance._backing.del(instance.primaryKey);
  }
}

module.exports = {RedisAdapter};
