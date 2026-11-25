const express = require('express');
const path = require('path');
const http = require('http');

const app = express();
const file = path.join(__dirname, 'public', 'login.html');
console.log('Sending file:', file);

app.get('/login', (req, res) => {
  res.sendFile(file, (err) => {
    if (err) {
      console.error('SendFile error:', err);
      res.status(err.status || 500).send(err.message);
    }
  });
});

const server = app.listen(3456, () => {
  http.get('http://localhost:3456/login', res => {
    console.log('Got response status:', res.statusCode);
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
      console.log('Body length:', body.length);
      server.close();
    });
  });
});
