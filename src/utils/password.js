const crypto = require('crypto');

const DEFAULT_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';

function generateTemporaryPassword(length = 16) {
  if (length <= 0) {
    throw new Error('Password length must be positive');
  }
  const charsetLength = DEFAULT_CHARSET.length;
  const randomBytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i += 1) {
    const index = randomBytes[i] % charsetLength;
    password += DEFAULT_CHARSET.charAt(index);
  }
  return password;
}

module.exports = {
  generateTemporaryPassword,
};
