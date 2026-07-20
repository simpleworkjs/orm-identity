'use strict';

/**
 * LDAP adapter for @simpleworkjs/orm-identity.
 *
 * LDAP is treated as a first-class backend. Models can declare
 * `static adapterName = 'ldap'` to be backed by an LDAP directory.
 *
 * Day-1 scope:
 *   - Read users and groups from LDAP.
 *   - Resolve cross-backend relations at the ORM level (e.g. SQL project -> LDAP owner).
 *   - Delegate writes back to LDAP where appropriate.
 *
 * This adapter requires `ldapts` and a configured LDAP connection. If the
 * dependency is missing, the adapter throws on construction with a clear
 * message.
 */

let ldapts;
try {
  ldapts = require('ldapts');
} catch (error) {
  ldapts = null;
}

function escapeSearchValue(val) {
  return String(val)
    .replace(/\\/g, '\\5c')
    .replace(/\*/g, '\\2a')
    .replace(/\(/g, '\\28')
    .replace(/\)/g, '\\29')
    .replace(/\0/g, '\\00');
}

class LDAPAdapter {
  constructor(config) {
    if (!ldapts) {
      throw new Error('LDAP adapter requires the "ldapts" package. Run: npm install ldapts');
    }
    this.config = config || {};
    this.Client = ldapts.Client;
    this.Attribute = ldapts.Attribute;
    this.Change = ldapts.Change;
  }

  _makeClient() {
    return new this.Client({url: this.config.url});
  }

  async _withClient(fn) {
    const client = this._makeClient();
    try {
      await client.bind(this.config.bindDN, this.config.bindPassword);
      return await fn(client);
    } finally {
      await client.unbind().catch(() => {});
    }
  }

  registerModel(Model) {
    // LDAP-backed models do not need a Sequelize backing model.
    Model.backingModel = null;
  }

  async sync() {
    // No schema sync for LDAP.
  }

  _modelConfig(Model) {
    return this.config.models && this.config.models[Model.name] || {};
  }

  async list(Model, args) {
    const cfg = this._modelConfig(Model);
    const base = cfg.base || this.config.userBase;
    const filter = args && args.where
      ? this._whereToFilter(cfg.objectClass, args.where)
      : `(${cfg.objectClass || 'objectClass=*'})`;

    const entries = await this._withClient(async (client) => {
      const res = await client.search(base, {
        scope: 'sub',
        filter,
        attributes: cfg.attributes || ['*', '+'],
      });
      return res.searchEntries;
    });

    return entries.map(entry => new Model(this._entryToRow(entry, Model)));
  }

  async create(Model, data) {
    const cfg = this._modelConfig(Model);
    const pkName = Model.primaryKey.name;
    const pk = data[pkName];
    const dn = this._makeDN(cfg, pk);
    const entry = this._dataToEntry(data, cfg);

    await this._withClient(async (client) => {
      await client.add(dn, entry);
    });

    return this.get(Model, pk);
  }

  async get(Model, pk) {
    const cfg = this._modelConfig(Model);
    const base = cfg.base || this.config.userBase;
    const pkField = cfg.pkAttribute || Model.primaryKey.name;
    const filter = `(&(${cfg.objectClass || 'objectClass=*'})(${pkField}=${escapeSearchValue(pk)}))`;

    const entries = await this._withClient(async (client) => {
      const res = await client.search(base, {
        scope: 'sub',
        filter,
        attributes: cfg.attributes || ['*', '+'],
      });
      return res.searchEntries;
    });

    return entries.length ? new Model(this._entryToRow(entries[0], Model)) : null;
  }

  async update(instance, data) {
    const cfg = this._modelConfig(instance.constructor);
    const dn = this._makeDN(cfg, instance.primaryKey);
    const changes = Object.entries(data).map(([type, values]) => {
      return new this.Change({
        operation: 'replace',
        modification: new this.Attribute({type, values: [].concat(values)}),
      });
    });

    await this._withClient(async (client) => {
      await client.modify(dn, changes);
    });

    return instance;
  }

  async delete(instance) {
    const cfg = this._modelConfig(instance.constructor);
    const dn = this._makeDN(cfg, instance.primaryKey);
    await this._withClient(async (client) => {
      await client.del(dn);
    });
  }

  _makeDN(cfg, pk) {
    const rdn = cfg.rdnAttribute || cfg.pkAttribute || 'uid';
    return `${rdn}=${pk},${cfg.base || this.config.userBase}`;
  }

  _whereToFilter(objectClass, where) {
    const parts = Object.entries(where).map(([key, val]) => {
      return `(${key}=${escapeSearchValue(val)})`;
    });
    const oc = objectClass ? `(${objectClass})` : '';
    return `(&${oc}${parts.join('')})`;
  }

  _entryToRow(entry, Model) {
    const row = {};
    for (const [name, field] of Object.entries(Model.fieldInstances)) {
      if (field.isRelationship) continue;
      const attr = field.ldapAttribute || name;
      let value = entry[attr];
      if (Array.isArray(value)) {
        value = value.length === 1 ? value[0] : value;
      }
      row[name] = value;
    }
    return row;
  }

  _dataToEntry(data, cfg) {
    const entry = {...cfg.objectClass ? {objectClass: [].concat(cfg.objectClass)} : {}};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) entry[key] = value;
    }
    return entry;
  }
}

module.exports = {LDAPAdapter};
