const BaseProjectService = require('./base_project_service.js');
const UserStateModel = require('../model/user_state_model.js');

const ALLOWED_TYPES = [
  'fitness_profile',
  'fitness_diet_records',
  'fitness_training_plan',
  'fitness_workout_stats',
  'fitness_applied_agent_proposals'
];

class UserStateService extends BaseProjectService {
  async getAll(userId) {
    const rows = await UserStateModel.getAll({
      USER_STATE_USER_ID: userId,
      USER_STATE_TYPE: ['in', ALLOWED_TYPES]
    }, 'USER_STATE_TYPE,USER_STATE_DATA', {}, 100);
    const state = {};
    for (const row of rows || []) state[row.USER_STATE_TYPE] = row.USER_STATE_DATA || {};
    return state;
  }

  async save(userId, type, data) {
    if (!ALLOWED_TYPES.includes(type)) this.AppError('不支持的数据类型');
    const where = { USER_STATE_USER_ID: userId, USER_STATE_TYPE: type };
    const current = await UserStateModel.getOne(where);
    if (current) {
      await UserStateModel.edit(current._id, { USER_STATE_DATA: data || {} });
    } else {
      await UserStateModel.insert({
        USER_STATE_USER_ID: userId,
        USER_STATE_TYPE: type,
        USER_STATE_DATA: data || {}
      });
    }
    return { saved: true };
  }
}

module.exports = UserStateService;
