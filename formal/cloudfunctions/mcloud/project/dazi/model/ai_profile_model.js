const BaseProjectModel = require('./base_project_model.js');

class AiProfileModel extends BaseProjectModel {}

AiProfileModel.CL = BaseProjectModel.C('ai_profile');
AiProfileModel.FIELD_PREFIX = 'AI_PROFILE_';
AiProfileModel.DB_STRUCTURE = {
	_pid: 'string|true',
	AI_PROFILE_ID: 'string|true',
	AI_PROFILE_USER_ID: 'string|true',
	AI_PROFILE_DATA: 'object|true|default={}|length=6000',
	AI_PROFILE_ADD_TIME: 'int|true',
	AI_PROFILE_EDIT_TIME: 'int|true',
	AI_PROFILE_ADD_IP: 'string|false',
	AI_PROFILE_EDIT_IP: 'string|false',
};

module.exports = AiProfileModel;
