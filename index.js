require('dotenv').config();
const express = require('express');
const { handleMessage } = require('./bot/flows');

const app = express();
app.use(express.urlencoded({ extended: false }));

app.post('/webhook/whatsapp', handleMessage);

app.get('/health', (_, res) => res.send('OK'));

app.listen(process.env.PORT || 3333, () => {
  console.log('WhatsApp API corriendo');
});