// utils/ses.js
// Minimal SES email sender using AWS SDK v3
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const REGION = process.env.AWS_REGION || 'us-east-1';
const SES_SENDER = process.env.SES_SENDER; // e.g., noreply@yourdomain.com (must be verified in SES or domain verified)
const SES_FROM_NAME = process.env.SES_FROM_NAME || 'Tart';

const ses = new SESClient({ region: REGION });

function buildFromAddress() {
  if (!SES_SENDER) throw new Error('SES_SENDER is not configured');
  // Format: "Name <email@domain>"
  return `${SES_FROM_NAME} <${SES_SENDER}>`;
}

async function sendEmail({ to, subject, html, text }) {
  if (!to) throw new Error('Missing "to"');
  if (!subject) throw new Error('Missing "subject"');
  const params = {
    Source: buildFromAddress(),
    Destination: { ToAddresses: Array.isArray(to) ? to : [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {}
    }
  };

  if (html) params.Message.Body.Html = { Data: html, Charset: 'UTF-8' };
  if (text) params.Message.Body.Text = { Data: text, Charset: 'UTF-8' };
  if (!params.Message.Body.Html && !params.Message.Body.Text) {
    params.Message.Body.Text = { Data: '', Charset: 'UTF-8' };
  }

  const command = new SendEmailCommand(params);
  return await ses.send(command);
}

module.exports = { sendEmail };
