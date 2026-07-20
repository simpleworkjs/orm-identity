'use strict';

const {BaseModel} = require('./base');
const {SequelizeAdapter} = require('./adapters/sequelize');
const {RedisAdapter} = require('./adapters/redis');
const {LDAPAdapter} = require('./adapters/ldap');

/**
 * ORM that loads model classes and wires them to backend adapters.
 *
 * Adapters:
 *   - sequelize (default) — SQLite/Postgres/MySQL via Sequelize.
 *   - redis — model-redis backend.
 *   - ldap — read/write LDAP directory.
 */
class ORM {
  constructor(config, pubsub) {
    this.config = config || {};
    this.pubsub = pubsub;
    this.models = {};
    this.adapters = {};
    this._createAdapters();
  }

  _createAdapters() {
    const db = this.config.database || {};

    const redisConf = this.config.redis || db.redis;
    if (redisConf && redisConf.enabled !== false) {
      this.adapters.redis = new RedisAdapter(redisConf);
    }

    const ldapConf = this.config.ldap || db.ldap;
    if (ldapConf && ldapConf.enabled !== false) {
      this.adapters.ldap = new LDAPAdapter(ldapConf);
    }

    if (db.enabled !== false) {
      this.adapters.sequelize = new SequelizeAdapter(db);
    }
  }

  adapter(Model) {
    const name = Model.adapterName || 'sequelize';
    const adapter = this.adapters[name];
    if (!adapter) throw new Error(`No adapter configured for ${Model.name} (wanted ${name})`);
    return adapter;
  }

  async load(modelFiles) {
    const loaded = [];
    const normalize = (item) => {
      if (typeof item === 'string') {
        const exported = require(item);
        return Array.isArray(exported) ? exported : Object.values(exported);
      }
      if (Array.isArray(item)) return item;
      if (item.prototype instanceof BaseModel) return [item];
      return Object.values(item);
    };

    for (const item of modelFiles) {
      for (const Model of normalize(item)) {
        if (Model.prototype instanceof BaseModel) {
          Model.orm = this;
          Model._register();
          this.models[Model.name] = Model;
          loaded.push(Model);
        }
      }
    }

    for (const Model of loaded) {
      this.adapter(Model).registerModel(Model);
    }

    for (const adapter of Object.values(this.adapters)) {
      if (adapter.associateModels) {
        adapter.associateModels(loaded);
      }
    }

    if (this.adapters.sequelize) {
      await this.adapters.sequelize.sync();
    }

    return this.models;
  }

  _publish(action, modelName, pk, instance) {
    if (!this.pubsub) return;
    this.pubsub.publish(`model:${modelName}:${action}`, {
      pk,
      model: modelName,
      action,
      data: instance ? instance.toJSON() : null,
    });
  }

  async close() {
    if (this.adapters.sequelize) {
      await this.adapters.sequelize.sequelize.close();
    }
  }
}

module.exports = {
  Model: BaseModel,
  ORM,
};
