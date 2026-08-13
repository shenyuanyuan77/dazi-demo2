const BaseProjectModel = require('./base_project_model.js');

class UserStateModel extends BaseProjectModel {}

UserStateModel.CL = BaseProjectModel.C('user_state');
UserStateModel.FIELD_PREFIX = 'USER_STATE_';
UserStateModel.DB_STRUCTURE = {
  _pid: 'string|true',
  USER_STATE_ID: 'string|true',
  USER_STATE_USER_ID: 'string|true',
  USER_STATE_TYPE: 'string|true',
  USER_STATE_DATA: 'object|true|default={}|length=200000',
  USER_STATE_ADD_TIME: 'int|true',
  USER_STATE_EDIT_TIME: 'int|true',
  USER_STATE_ADD_IP: 'string|false',
  USER_STATE_EDIT_IP: 'string|false',
};

module.exports = UserStateModel;
