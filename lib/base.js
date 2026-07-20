'use strict';

const fields = require('./fields');

class BaseModel {
  static fields = {};
  static display = {};
  static permissions = {};
  static orm = null;
  static backingModel = null;
  static tableName = null;
  static adapterName = 'sequelize';

  static fieldInstances = {};
  static relationships = [];
  static primaryKey = null;

  static _register() {
    this.fieldInstances = {};
    this.relationships = [];
    this.primaryKey = null;

    for (const [name, options] of Object.entries(this.fields)) {
      const field = fields.create(name, options);
      this.fieldInstances[name] = field;
      if (field.primaryKey) this.primaryKey = field;
      if (field.isRelationship) this.relationships.push(field);
    }

    if (!this.primaryKey) {
      const idField = fields.create('id', {type: 'int', primaryKey: true, autoIncrement: true});
      this.fieldInstances.id = idField;
      this.primaryKey = idField;
    }
  }

  constructor(backingInstance) {
    this._backing = backingInstance;
    this.primaryKey = backingInstance[this.constructor.primaryKey.name];

    for (const [name, field] of Object.entries(this.constructor.fieldInstances)) {
      let value = backingInstance[name];
      let propName = name;

      if (field.isRelationship && field.foreignKey) {
        value = backingInstance[field.foreignKey];
        propName = field.foreignKey;
      }

      if (field.isPrivate) {
        Object.defineProperty(this, propName, {
          value,
          enumerable: false,
          writable: true,
          configurable: true,
        });
      } else {
        this[propName] = value;
      }

      if (field.injectMethods) {
        const methods = field.injectMethods(name);
        for (const [methodName, method] of Object.entries(methods)) {
          Object.defineProperty(this, methodName, {
            value: method.bind(this),
            enumerable: false,
            writable: true,
            configurable: true,
          });
        }
      }
    }
  }

  toJSON() {
    const out = {};
    const backing = this._backing;
    for (const [name, field] of Object.entries(this.constructor.fieldInstances)) {
      if (field.isPrivate) continue;
      if (field.isRelationship && field.foreignKey) {
        const value = backing[field.foreignKey];
        if (value !== undefined) out[field.foreignKey] = value;
      } else {
        const value = backing[name];
        if (value !== undefined) out[name] = value;
      }
    }
    return out;
  }

  static async preSave(data, partial) {
    const out = {};
    for (const [name, field] of Object.entries(this.fieldInstances)) {
      if (field.isRelationship && field.foreignKey) {
        if (partial && !(field.foreignKey in data) && !(name in data)) continue;
        const value = data[field.foreignKey] !== undefined ? data[field.foreignKey] : data[name];
        if (value !== undefined) out[field.foreignKey] = value;
        continue;
      }
      if (field.isRelationship) continue;
      if (partial && !(name in data)) continue;
      let value = data[name];
      if (field.preSave) {
        value = await field.preSave(value, data);
      }
      if (value !== undefined) out[name] = value;
    }
    return out;
  }

  static async list(args) {
    return this.orm.adapter(this).list(this, args);
  }

  static async create(data) {
    data = await this.preSave(data, false);
    const instance = await this.orm.adapter(this).create(this, data);
    this.orm._publish('create', this.name, instance.primaryKey, instance);
    return instance;
  }

  static async get(pk) {
    return this.orm.adapter(this).get(this, pk);
  }

  async update(data) {
    data = await this.constructor.preSave(data, true);
    await this.constructor.orm.adapter(this).update(this, data);
    this.constructor.orm._publish('update', this.constructor.name, this.primaryKey, this);
    return this;
  }

  async delete() {
    const pk = this.primaryKey;
    await this.constructor.orm.adapter(this).delete(this);
    this.constructor.orm._publish('delete', this.constructor.name, pk, null);
  }

  static toSchema() {
    const fieldSchemas = {};
    for (const [name, field] of Object.entries(this.fieldInstances)) {
      let schema = field.toSchema();
      if (field.isRelationship) {
        const remoteModel = this.orm.models[field.model];
        schema = field.toSchema(remoteModel);
      }
      fieldSchemas[name] = schema;
    }

    return {
      name: this.name,
      pk: this.primaryKey.name,
      display: {
        name: this.display.name || this.name,
        titleField: this.display.titleField || this.primaryKey.name,
        ...this.display,
      },
      fields: fieldSchemas,
    };
  }

  static toPaths() {
    return {
      base: [
        {method: 'get', path: `/${this.name}`, description: `List ${this.name}`},
        {method: 'post', path: `/${this.name}`, description: `Create ${this.name}`},
        {method: 'get', path: `/${this.name}/:${this.primaryKey.name}`, description: `Get one ${this.name}`},
        {method: 'put', path: `/${this.name}/:${this.primaryKey.name}`, description: `Update ${this.name}`},
        {method: 'delete', path: `/${this.name}/:${this.primaryKey.name}`, description: `Delete ${this.name}`},
      ],
    };
  }

  static permissionsFor(action) {
    const defaults = {
      read: ['user'],
      create: ['admin'],
      update: ['admin', 'owner'],
      delete: ['admin'],
    };
    const declared = this.permissions[action];
    if (declared === undefined) return defaults[action] || ['admin'];
    return Array.isArray(declared) ? declared : [declared];
  }

  hasPermission(user, action) {
    const allowed = this.constructor.permissionsFor(action);
    return this.constructor._evaluatePermissions(allowed, user, this);
  }

  static hasPermission(user, action) {
    const allowed = this.permissionsFor(action);
    return this._evaluatePermissions(allowed, user, null);
  }

  static _evaluatePermissions(allowed, user, instance) {
    if (!allowed || !allowed.length) return false;
    if (allowed.includes('public')) return true;
    if (!user) return false;

    const userPermissions = user.permissions || [];
    const hasPerm = Array.isArray(userPermissions)
      ? p => userPermissions.includes(p)
      : p => userPermissions.has(p);

    if (allowed.includes('admin') && hasPerm('admin')) return true;
    if (allowed.includes('user')) return true;

    if (instance && allowed.includes('owner')) {
      const ownerId = instance.createdById || instance.ownerId || instance.userId;
      if (ownerId && ownerId === user.id) return true;
    }

    for (const perm of allowed) {
      if (hasPerm(perm)) return true;
    }

    return false;
  }
}

module.exports = {BaseModel};
