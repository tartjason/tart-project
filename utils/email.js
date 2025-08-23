// utils/email.js
// Email sender using Resend
const { Resend } = require('resend');

const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Tart';
const EMAIL_FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS; // e.g., noreply@yourdomain.com (must be verified in Resend domain)

let _resend;
function getClient() {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
    _resend = new Resend(apiKey);
  }
  return _resend;
}

function buildFromAddress() {
  if (!EMAIL_FROM_ADDRESS) throw new Error('EMAIL_FROM_ADDRESS is not configured');
  return `${EMAIL_FROM_NAME} <${EMAIL_FROM_ADDRESS}>`;
}

async function sendEmail({ to, subject, html, text }) {
  if (!to) throw new Error('Missing "to"');
  if (!subject) throw new Error('Missing "subject"');

  const client = getClient();
  const toList = Array.isArray(to) ? to : [to];

  const { data, error } = await client.emails.send({
    from: buildFromAddress(),
    to: toList,
    subject,
    html: html || undefined,
    text: text || undefined,
  });

  if (error) {
    const err = new Error(`Resend send error: ${error.message || String(error)}`);
    err.resendError = error;
    throw err;
  }

  return data;
}

module.exports = { sendEmail };
