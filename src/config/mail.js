const nodemailer = require('nodemailer');
const { MAIL_HOST, MAIL_PORT, MAIL_SECURE, MAIL_USER, MAIL_PASSWORD, MAIL_ENABLED } = require('./env');

let transporter;

function isMailConfigured() {
  return MAIL_ENABLED;
}

function getTransporter() {
  if (!isMailConfigured()) {
    throw new Error('Mail transport is not configured');
  }
  if (!transporter) {
    const transportOptions = {
      host: MAIL_HOST,
      port: MAIL_PORT,
      secure: MAIL_SECURE,
    };
    if (MAIL_USER && MAIL_PASSWORD) {
      transportOptions.auth = {
        user: MAIL_USER,
        pass: MAIL_PASSWORD,
      };
    }
    transporter = nodemailer.createTransport(transportOptions);
  }
  return transporter;
}

module.exports = {
  getTransporter,
  isMailConfigured,
};
