'use strict';

const {DataTypes} = require('sequelize');
const bcrypt = require('bcrypt');

/**
 * Base field class. Every model field (scalar or relationship) inherits from this.
 */
class Field {
  constructor(name, options) {
    options = typeof options === 'string' ? {type: options} : (options || {});

    this.name = name;
    this.type = options.type || 'string';
    this.isRequired = options.isRequired === true;
    this.default = options.default;
    this.primaryKey = options.primaryKey === true;
    this.unique = options.unique === true;
    this.isPrivate = options.isPrivate === true;
    this.display = options.display || {};
    this.form = options.form || {};
    this.validate = options.validate || {};
    this.isRelationship = false;
  }

  async preSave(value) {
    return value;
  }

  toSequelize() {
    throw new Error(`toSequelize not implemented for ${this.type}`);
  }

  toSchema() {
    return {
      name: this.name,
      type: this.type,
      jsType: this.jsType,
      htmlType: this.htmlType,
      allowNull: !this.isRequired,
      primaryKey: this.primaryKey,
      defaultValue: this.default,
      unique: this.unique,
      isPrivate: this.isPrivate,
      display: this.display,
      form: this.form,
      validate: this.validate,
    };
  }
}

class StringField extends Field {
  constructor(name, options) {
    super(name, options);
    this.min = options.min;
    this.max = options.max;
    this.jsType = 'string';
    this.htmlType = options.htmlType || (options.max > 255 ? 'textarea' : 'text');
  }

  toSequelize() {
    return {
      type: this.max ? DataTypes.STRING(this.max) : DataTypes.STRING,
      allowNull: !this.isRequired,
      defaultValue: this.default,
      unique: this.unique,
      validate: this._buildValidate(),
    };
  }

  _buildValidate() {
    const v = {...this.validate};
    if (this.min !== undefined) {
      v.len = {args: [this.min, this.max || 255], msg: `must be ${this.min}-${this.max || 255} chars`};
    }
    return Object.keys(v).length ? v : undefined;
  }
}

class TextField extends Field {
  constructor(name, options) {
    super(name, options);
    this.jsType = 'string';
    this.htmlType = 'textarea';
  }

  toSequelize() {
    return {
      type: DataTypes.TEXT,
      allowNull: !this.isRequired,
      defaultValue: this.default,
    };
  }
}

class IntegerField extends Field {
  constructor(name, options) {
    super(name, options);
    this.min = options.min;
    this.max = options.max;
    this.jsType = 'number';
    this.htmlType = 'number';
  }

  toSequelize() {
    return {
      type: DataTypes.INTEGER,
      allowNull: !this.isRequired,
      defaultValue: this.default,
      validate: this._buildValidate(),
    };
  }

  _buildValidate() {
    const v = {...this.validate};
    if (this.min !== undefined || this.max !== undefined) {
      v.min = this.min;
      v.max = this.max;
    }
    return Object.keys(v).length ? v : undefined;
  }
}

class FloatField extends Field {
  constructor(name, options) {
    super(name, options);
    this.jsType = 'number';
    this.htmlType = 'number';
  }

  toSequelize() {
    return {
      type: DataTypes.FLOAT,
      allowNull: !this.isRequired,
      defaultValue: this.default,
    };
  }
}

class BooleanField extends Field {
  constructor(name, options) {
    super(name, options);
    this.jsType = 'boolean';
    this.htmlType = 'checkbox';
  }

  toSequelize() {
    return {
      type: DataTypes.BOOLEAN,
      allowNull: !this.isRequired,
      defaultValue: this.default,
    };
  }
}

class DateField extends Field {
  constructor(name, options) {
    super(name, options);
    this.jsType = 'Date';
    this.htmlType = 'datetime-local';
  }

  toSequelize() {
    return {
      type: DataTypes.DATE,
      allowNull: !this.isRequired,
      defaultValue: this.default,
    };
  }
}

class UUIDField extends Field {
  constructor(name, options) {
    super(name, options);
    this.jsType = 'string';
    this.htmlType = 'text';
  }

  toSequelize() {
    return {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      allowNull: !this.isRequired,
      primaryKey: this.primaryKey,
    };
  }
}

class PasswordBcryptField extends StringField {
  constructor(name, options) {
    super(name, options);
    this.isPrivate = true;
    this.htmlType = 'password';
    this.saltRounds = options.saltRounds || 10;
  }

  async preSave(value) {
    if (!value) return value;
    return bcrypt.hash(value, this.saltRounds);
  }

  injectMethods(fieldName) {
    return {
      [`${fieldName}Compare`]: async function(value) {
        return bcrypt.compare(value, this[fieldName]);
      },
    };
  }
}

class EmailField extends StringField {
  constructor(name, options) {
    super(name, options);
    this.htmlType = 'email';
  }

  toSequelize() {
    const def = super.toSequelize();
    def.validate = def.validate || {};
    def.validate.isEmail = true;
    return def;
  }
}

class HasOneField extends Field {
  constructor(name, options) {
    super(name, options);
    this.type = 'hasOne';
    this.model = options.model;
    this.remoteKey = options.remoteKey || 'id';
    this.foreignKey = `${this.name}Id`;
    this.isRelationship = true;
    this.jsType = 'number';
    this.htmlType = 'select';
  }

  toSchema(remoteModel) {
    const schema = super.toSchema();
    schema.foreignKey = this.foreignKey;
    schema.references = {
      type: 'hasOne',
      model: this.model,
      as: this.name,
      remoteKey: this.remoteKey,
      localKey: this.foreignKey,
      nullable: !this.isRequired,
    };
    return schema;
  }
}

class HasManyField extends Field {
  constructor(name, options) {
    super(name, options);
    this.type = 'hasMany';
    this.model = options.model;
    this.remoteKey = options.remoteKey;
    this.foreignKey = this.remoteKey || `${this.model.toLowerCase()}Id`;
    this.isRelationship = true;
    this.jsType = 'array';
    this.htmlType = 'hidden';
  }

  toSchema(remoteModel) {
    const schema = super.toSchema();
    schema.foreignKey = this.foreignKey;
    schema.references = {
      type: 'hasMany',
      model: this.model,
      as: this.name,
      localKey: 'id',
      remoteKey: this.foreignKey,
      nullable: true,
    };
    return schema;
  }
}

const registry = {
  string: StringField,
  text: TextField,
  int: IntegerField,
  integer: IntegerField,
  float: FloatField,
  boolean: BooleanField,
  date: DateField,
  uuid: UUIDField,
  uuidv4: UUIDField,
  'password-bcrypt': PasswordBcryptField,
  email: EmailField,
  hasOne: HasOneField,
  hasMany: HasManyField,
};

function create(name, options) {
  const type = typeof options === 'string' ? options : (options && options.type);
  const FieldClass = registry[type];
  if (!FieldClass) throw new Error(`Unknown field type: ${type}`);
  return new FieldClass(name, options);
}

function register(type, FieldClass) {
  registry[type] = FieldClass;
}

module.exports = {
  Field,
  StringField,
  TextField,
  IntegerField,
  FloatField,
  BooleanField,
  DateField,
  UUIDField,
  PasswordBcryptField,
  EmailField,
  HasOneField,
  HasManyField,
  create,
  register,
};
