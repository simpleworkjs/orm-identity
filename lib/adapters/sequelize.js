'use strict';

const {Sequelize, DataTypes} = require('sequelize');

class SequelizeAdapter {
  constructor(config) {
    this.sequelize = new Sequelize(config);
    this.backingModels = {};
  }

  async connect() {
    await this.sequelize.authenticate();
  }

  registerModel(Model) {
    const attributes = {};

    // Scalar fields become columns.
    for (const [name, field] of Object.entries(Model.fieldInstances)) {
      if (!field.isRelationship) {
        attributes[name] = field.toSequelize();
      }
    }

    // hasOne relationships become a foreign-key column.
    for (const field of Model.relationships) {
      if (field.type === 'hasOne') {
        const remoteModel = Model.orm.models[field.model];
        if (!remoteModel) throw new Error(`Unknown related model: ${field.model}`);
        const remotePk = remoteModel.primaryKey;
        const seqDef = remotePk.toSequelize ? remotePk.toSequelize() : {type: DataTypes.INTEGER};
        attributes[`${field.name}Id`] = {
          type: seqDef.type,
          allowNull: !field.isRequired,
        };
      }
    }

    const SM = this.sequelize.define(Model.name, attributes, {
      tableName: Model.tableName || Model.name,
      timestamps: true,
      underscored: false,
    });

    this.backingModels[Model.name] = SM;
    Model.backingModel = SM;
  }

  associateModels(models) {
    // Only process hasOne relationships. Each hasOne creates:
    //   - This model belongs to the remote model.
    //   - The remote model has many of this model.
    for (const Model of models) {
      const adapter = Model.orm.adapter(Model);
      if (adapter !== this) continue; // skip non-sequelize models

      for (const field of Model.relationships) {
        if (field.type !== 'hasOne') continue;

        const RemoteModel = Model.orm.models[field.model];
        if (!RemoteModel) continue;
        const remoteAdapter = Model.orm.adapter(RemoteModel);

        const SM = Model.backingModel;
        const RSM = RemoteModel.backingModel;

        if (remoteAdapter === this) {
          SM.belongsTo(RSM, {as: field.name, foreignKey: `${field.name}Id`});
          const reverseField = RemoteModel.relationships.find(
            r => r.type === 'hasMany' && r.model === Model.name
          );
          const reverseAlias = reverseField ? reverseField.name : `${Model.name.toLowerCase()}s`;
          RSM.hasMany(SM, {as: reverseAlias, foreignKey: `${field.name}Id`});
        }
      }
    }
  }

  async sync(options) {
    await this.sequelize.sync(options);
  }

  async list(Model, args) {
    args = args || {};
    const rows = await Model.backingModel.findAll(args);
    return rows.map(row => new Model(row));
  }

  async create(Model, data) {
    const row = await Model.backingModel.create(data);
    return new Model(row);
  }

  async get(Model, pk) {
    const row = await Model.backingModel.findByPk(pk);
    return row ? new Model(row) : null;
  }

  async update(instance, data) {
    await instance._backing.update(data);
    return instance;
  }

  async delete(instance) {
    await instance._backing.destroy();
  }
}

module.exports = {SequelizeAdapter};
