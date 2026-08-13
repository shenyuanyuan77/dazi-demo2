const crypto = require('crypto');
const BaseProjectController = require('./base_project_controller.js');

class AuthController extends BaseProjectController {
  async session() {
    const userId = crypto
      .createHash('sha256')
      .update(String(this._userId))
      .digest('hex')
      .slice(0, 32);
    return { userId };
  }
}

module.exports = AuthController;
