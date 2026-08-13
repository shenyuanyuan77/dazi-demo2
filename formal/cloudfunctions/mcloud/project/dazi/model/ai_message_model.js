const BaseProjectModel = require('./base_project_model.js');

class AiMessageModel extends BaseProjectModel {}

AiMessageModel.CL = BaseProjectModel.C('ai_message');
AiMessageModel.FIELD_PREFIX = 'AI_MESSAGE_';
AiMessageModel.DB_STRUCTURE = {
	_pid: 'string|true',
	AI_MESSAGE_ID: 'string|true',
	AI_MESSAGE_USER_ID: 'string|true',
	AI_MESSAGE_SESSION_ID: 'string|true',
	AI_MESSAGE_ROLE: 'string|true',
	AI_MESSAGE_TYPE: 'string|true|default=general',
	AI_MESSAGE_CONTENT: 'string|true|length=6000',
	AI_MESSAGE_PAYLOAD: 'object|true|default={}|length=6000',
	AI_MESSAGE_ADD_TIME: 'int|true',
	AI_MESSAGE_EDIT_TIME: 'int|true',
	AI_MESSAGE_ADD_IP: 'string|false',
	AI_MESSAGE_EDIT_IP: 'string|false',
};

module.exports = AiMessageModel;
