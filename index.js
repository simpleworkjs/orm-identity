'use strict';

/**
 * @simpleworkjs/orm-identity
 *
 * Identity and RBAC layer on top of @simpleworkjs/orm.
 *
 * Public API:
 *   const ormIdentity = require('@simpleworkjs/orm-identity');
 *   const {ORM, Model, fields, adapters, identity, auth, init} = ormIdentity;
 *
 * Factory:
 *   const models = init({conf, models: [require('./models/Task')]});
 */

const baseORM = require('@simpleworkjs/orm');
const identity = require('./lib/identity');
const auth = require('./lib/auth');

/**
 * Initialize the ORM with built-in identity models plus app-specific models.
 *
 * Options:
 *   conf     — configuration object with orm section.
 *   models   — array or object of app Model classes.
 *   pubsub   — optional pub/sub instance.
 */
function init(options) {
  options = options || {};
  const orm = new baseORM.ORM(options.conf || {}, options.pubsub);

  // Identity models are always loaded first so app models can reference them.
  const identityModels = Object.values(identity);
  const appModels = Array.isArray(options.models)
    ? options.models
    : Object.values(options.models || {});

  return orm.load([identityModels, appModels]);
}

module.exports = {
  ORM: baseORM.ORM,
  Model: baseORM.Model,
  fields: baseORM.fields,
  adapters: baseORM.adapters,
  identity,
  auth,
  init,
};
