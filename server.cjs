const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = {'/':'index.html','/index.html':'index.html','/styles.css':'styles.css','/app.js':'app.js'};
const types = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.mp3':'audio/mpeg'};
http.createServer((req,res) => {
  const pathname = new URL(req.url,'http://localhost').pathname;
  const file = files[pathname] || (/^\/audio\/[a-z]+\.mp3$/.test(pathname) ? pathname.slice(1) : null);
  if (!file) {res.writeHead(404);res.end('Not found');return;}
  const type = types[path.extname(file)];
  res.writeHead(200, {'Content-Type': type.startsWith('audio') ? type : type + '; charset=utf-8'});
  fs.createReadStream(path.join(__dirname,file)).pipe(res);
}).listen(4173,'127.0.0.1',()=>console.log('Local: http://localhost:4173'));
