const express = require('express');
const path = require('path');
const http = require('http');

const app = express();
const file = path.join(__dirname, 'public', 'login.html');

app.get('/login', (req, res) => {
  res.sendFile(file, { dotfiles: 'allow' }, (err) => {
    if (err) {
      console.error('SendFile error:', err);
      res.status(err.status || 500).send(err.message);
    }
  });
});

const server = app.listen(3457, () => {
  http.get('http://localhost:3457/login', res => {
    console.log('Got response status with dotfiles:allow ->', res.statusCode);
    server.close();
  });
});
