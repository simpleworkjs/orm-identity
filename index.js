'use strict';

/**
 * @simpleworkjs/orm-identity
 *
 * A model-first ORM with built-in identity and RBAC models.
 *
 * Public API:
 *   const orm = require('@simpleworkjs/orm-identity');
 *   const {ORM, Model, fields, adapters, identity, auth, init} = orm;
 *
 * Factory:
 *   const models = init({conf, models: [require('./models/Task')]});
 */

const {ORM, Model} = require('./lib/orm');
const fields = require('./lib/fields');
const adapters = require('./lib/adapters');
const identity = require('./lib/identity');
const auth = require('./lib/auth');

/**
 * Initialize the ORM with identity models plus app-specific models.
 *
 * Options:
 *   conf     — configuration object with database/redis/ldap sections.
 *   models   — array or object of app Model classes.
 *   pubsub   — optional pub/sub instance.
 */
function init(options) {
  options = options || {};
  const orm = new ORM(options.conf || {}, options.pubsub);

  // Identity models are always loaded first.
  const identityModels = Object.values(identity);
  const appModels = Array.isArray(options.models)
    ? options.models
    : Object.values(options.models || {});

  return orm.load([identityModels, appModels]);
}

module.exports = {
  ORM,
  Model,
  fields,
  adapters,
  identity,
  auth,
  init,
};
