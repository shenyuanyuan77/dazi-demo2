const BaseProjectModel = require('./base_project_model.js');

class AiLogModel extends BaseProjectModel {}

AiLogModel.CL = BaseProjectModel.C('ai_log');
AiLogModel.FIELD_PREFIX = 'AI_LOG_';
AiLogModel.DB_STRUCTURE = {
	_pid: 'string|true',
	AI_LOG_ID: 'string|true',
	AI_LOG_USER_ID: 'string|true',
	AI_LOG_SESSION_ID: 'string|false',
	AI_LOG_TYPE: 'string|true',
	AI_LOG_DATE: 'string|true',
	AI_LOG_DATA: 'object|true|default={}|length=6000',
	AI_LOG_SOURCE: 'string|true|default=chat',
	AI_LOG_ADD_TIME: 'int|true',
	AI_LOG_EDIT_TIME: 'int|true',
	AI_LOG_ADD_IP: 'string|false',
	AI_LOG_EDIT_IP: 'string|false',
};

module.exports = AiLogModel;
