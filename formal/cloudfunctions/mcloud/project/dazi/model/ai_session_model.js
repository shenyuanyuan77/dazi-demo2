const BaseProjectModel = require('./base_project_model.js');

class AiSessionModel extends BaseProjectModel {}

AiSessionModel.CL = BaseProjectModel.C('ai_session');
AiSessionModel.FIELD_PREFIX = 'AI_SESSION_';
AiSessionModel.DB_STRUCTURE = {
	_pid: 'string|true',
	AI_SESSION_ID: 'string|true',
	AI_SESSION_USER_ID: 'string|true',
	AI_SESSION_TITLE: 'string|true|default=健身咨询',
	AI_SESSION_TYPE: 'string|true|default=general',
	AI_SESSION_CONTEXT: 'object|true|default={}',
	AI_SESSION_STATUS: 'int|true|default=1',
	AI_SESSION_ADD_TIME: 'int|true',
	AI_SESSION_EDIT_TIME: 'int|true',
	AI_SESSION_ADD_IP: 'string|false',
	AI_SESSION_EDIT_IP: 'string|false',
};

module.exports = AiSessionModel;
