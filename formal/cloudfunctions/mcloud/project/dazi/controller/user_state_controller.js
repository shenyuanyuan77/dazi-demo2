const BaseProjectController = require('./base_project_controller.js');
const UserStateService = require('../service/user_state_service.js');

class UserStateController extends BaseProjectController {
  async getAll() {
    return await new UserStateService().getAll(this._userId);
  }

  async save() {
    const input = this.validateData({
      type: 'must|string|min:1|max:60',
      data: 'must|object'
    });
    return await new UserStateService().save(this._userId, input.type, input.data);
  }
}

module.exports = UserStateController;
