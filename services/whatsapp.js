const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

module.exports.sendInteractive = async (to, interactive) => {
  await client.messages.create({
    from: process.env.WHATSAPP_FROM,
    to,
    interactive
  });
};

module.exports.sendText = async (to, text) => {
  await client.messages.create({
    from: process.env.WHATSAPP_FROM,
    to,
    body: text
  });
};
