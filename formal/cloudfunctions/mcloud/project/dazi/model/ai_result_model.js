const BaseProjectModel = require('./base_project_model.js');

class AiResultModel extends BaseProjectModel {}

AiResultModel.CL = BaseProjectModel.C('ai_result');
AiResultModel.FIELD_PREFIX = 'AI_RESULT_';
AiResultModel.DB_STRUCTURE = {
	_pid: 'string|true',
	AI_RESULT_ID: 'string|true',
	AI_RESULT_USER_ID: 'string|true',
	AI_RESULT_SESSION_ID: 'string|true',
	AI_RESULT_TYPE: 'string|true',
	AI_RESULT_TITLE: 'string|true',
	AI_RESULT_SUMMARY: 'string|true|length=1000',
	AI_RESULT_PAYLOAD: 'object|true|default={}|length=6000',
	AI_RESULT_STATUS: 'int|true|default=1',
	AI_RESULT_ADD_TIME: 'int|true',
	AI_RESULT_EDIT_TIME: 'int|true',
	AI_RESULT_ADD_IP: 'string|false',
	AI_RESULT_EDIT_IP: 'string|false',
};

module.exports = AiResultModel;
