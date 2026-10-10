const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = {'/':'index.html','/index.html':'index.html','/styles.css':'styles.css','/app.js':'app.js'};
const types = {'.html':'text/html','.css':'text/css','.js':'text/javascript'};
http.createServer((req,res) => {
  const file = files[new URL(req.url,'http://localhost').pathname];
  if (!file) {res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200, {'Content-Type':types[path.extname(file)]+'; charset=utf-8'});
  fs.createReadStream(path.join(__dirname,file)).pipe(res);
}).listen(4173,'127.0.0.1',()=>console.log('Local: http://localhost:4173'));
