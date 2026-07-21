'use strict';

const test = require('node:test');
const assert = require('node:assert');
const orm = require('..');
const {init, Model} = orm;

function makeConf() {
  return {
    orm: {
      dialect: 'sqlite',
      storage: ':memory:',
      logging: false,
    },
  };
}

class Project extends Model {
  static fields = {
    id: {type: 'uuid', primaryKey: true},
    name: {type: 'string', isRequired: true, max: 100},
    createdBy: {type: 'hasOne', model: 'User'},
  };

  static permissions = {
    read: ['user'],
    create: ['admin'],
    update: ['admin', 'owner'],
    delete: ['admin'],
  };
}

class Task extends Model {
  static fields = {
    id: {type: 'uuid', primaryKey: true},
    title: {type: 'string', isRequired: true, max: 200},
    project: {type: 'hasOne', model: 'Project'},
    createdBy: {type: 'hasOne', model: 'User'},
  };

  static permissions = {
    read: ['user'],
    create: ['admin'],
    update: ['admin', 'owner'],
    delete: ['admin'],
  };
}

test('ORM loads identity + app models and generates schema', async function() {
  const models = await init({conf: makeConf(), models: [Project, Task]});

  assert.ok(models.User, 'User model loaded');
  assert.ok(models.Project, 'Project model loaded');
  assert.ok(models.Task, 'Task model loaded');
  assert.ok(models.Group, 'Group model loaded');

  const taskSchema = models.Task.toSchema();
  assert.strictEqual(taskSchema.name, 'Task');
  assert.strictEqual(taskSchema.pk, 'id');
  assert.ok(taskSchema.fields.title, 'title field in schema');
  assert.ok(taskSchema.fields.project, 'project relation in schema');
  assert.strictEqual(taskSchema.fields.project.foreignKey, 'projectId');
});

test('CRUD lifecycle works and emits pubsub events', async function() {
  const events = [];
  const pubsub = {
    publish: function(topic, data) { events.push({topic, data}); },
  };

  const models = await init({conf: makeConf(), models: [Project, Task], pubsub});

  const project = await models.Project.create({name: 'Test project'});
  assert.ok(project.id, 'project created with id');

  const task = await models.Task.create({title: 'Test task', projectId: project.id});
  assert.strictEqual(task.projectId, project.id, 'task stores projectId');
  assert.strictEqual(task.toJSON().projectId, project.id, 'toJSON includes projectId');

  await task.update({title: 'Updated task'});
  const fetched = await models.Task.get(task.id);
  assert.strictEqual(fetched.title, 'Updated task', 'update persisted');

  await task.delete();
  const gone = await models.Task.get(task.id);
  assert.strictEqual(gone, null, 'task deleted');

  assert.ok(events.some(e => e.topic === 'model:Project:create'), 'create event emitted');
  assert.ok(events.some(e => e.topic === 'model:Task:update'), 'update event emitted');
  assert.ok(events.some(e => e.topic === 'model:Task:delete'), 'delete event emitted');
});

test('Password field hashes with bcrypt and compares', async function() {
  const models = await init({conf: makeConf()});

  const user = await models.User.create({
    userName: 'testuser',
    email: 'test@example.com',
    password: 'Secret1!',
  });
  assert.ok(user.id, 'user created');
  assert.notStrictEqual(user.password, 'Secret1!', 'password is hashed');

  const match = await user.passwordCompare('Secret1!');
  assert.strictEqual(match, true, 'correct password compares true');

  const noMatch = await user.passwordCompare('wrong');
  assert.strictEqual(noMatch, false, 'wrong password compares false');
});

test('Model permission evaluation respects admin, user, owner and public', async function() {
  const models = await init({conf: makeConf(), models: [Project, Task]});

  const admin = {id: 'admin-id', permissions: new Set(['admin'])};
  const plainUser = {id: 'user-id', permissions: new Set([])};

  assert.strictEqual(models.Task.hasPermission(admin, 'delete'), true, 'admin can delete');
  assert.strictEqual(models.Task.hasPermission(plainUser, 'delete'), false, 'plain user cannot delete');
  assert.strictEqual(models.Task.hasPermission(null, 'read'), false, 'unauthenticated cannot read by default');

  const ownerUser = await models.User.create({
    userName: 'owner',
    email: 'owner@example.com',
    password: 'Secret1!',
  });
  const taskOwner = {id: ownerUser.id, permissions: new Set([])};
  const task = await models.Task.create({title: 'Owner test', createdById: taskOwner.id});
  assert.strictEqual(task.hasPermission(taskOwner, 'update'), true, 'owner can update');
  assert.strictEqual(task.hasPermission(plainUser, 'update'), false, 'non-owner cannot update');
});

test('User.isAdmin and User.isValid are marked protectedFields (not client-settable via generic REST)', async function() {
  const models = await init({conf: makeConf(), models: [Project, Task]});
  assert.deepStrictEqual(models.User.protectedFields, ['isAdmin', 'isValid']);
});
