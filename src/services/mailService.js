const path = require('path');
const ejs = require('ejs');
const { MAIL_FROM, MAIL_ADMIN_RECIPIENTS } = require('../config/env');
const { getTransporter, isMailConfigured } = require('../config/mail');

async function renderTemplate(templateName, context) {
  const basePath = path.join(__dirname, '..', '..', 'views', 'emails');
  const [html, text] = await Promise.all([
    ejs.renderFile(path.join(basePath, `${templateName}.html.ejs`), context),
    ejs.renderFile(path.join(basePath, `${templateName}.text.ejs`), context),
  ]);
  return { html, text };
}

async function deliver(options) {
  if (!isMailConfigured()) {
    console.warn('Mail transport is not configured. Skipping email delivery for:', options.subject);
    return null;
  }
  const transporter = getTransporter();
  const payload = {
    from: MAIL_FROM,
    ...options,
  };
  return transporter.sendMail(payload);
}

async function sendPendingRegistrationEmails(user) {
  const context = { user };
  const [adminTemplate, registrantTemplate] = await Promise.all([
    renderTemplate('admin-approval-request', context),
    renderTemplate('registrant-pending', context),
  ]);

  const deliveries = [];
  if (MAIL_ADMIN_RECIPIENTS.length > 0) {
    deliveries.push(
      deliver({
        to: MAIL_ADMIN_RECIPIENTS,
        subject: `New Modini Apps registration: ${user.email}`,
        ...adminTemplate,
      })
    );
  } else {
    console.warn('No admin recipients configured for approval request emails.');
  }

  deliveries.push(
    deliver({
      to: user.email,
      subject: 'Your Modini Apps registration is pending approval',
      ...registrantTemplate,
    })
  );

  await Promise.all(deliveries);
}

async function sendUserApprovalEmail(user, temporaryPassword) {
  const context = { user, temporaryPassword };
  const template = await renderTemplate('registrant-approved', context);
  await deliver({
    to: user.email,
    subject: 'Your Modini Apps account has been approved',
    ...template,
  });
}

module.exports = {
  sendPendingRegistrationEmails,
  sendUserApprovalEmail,
  // Exported for testing/mocking convenience
  renderTemplate,
};
