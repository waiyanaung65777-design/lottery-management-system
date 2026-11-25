const path = require('path');
const fs = require('fs');

console.log('__dirname:', __dirname);
console.log('public dir:', path.join(__dirname, 'public'));
console.log('login.html:', path.join(__dirname, 'public', 'login.html'));
console.log('exists?:', fs.existsSync(path.join(__dirname, 'public', 'login.html')));
