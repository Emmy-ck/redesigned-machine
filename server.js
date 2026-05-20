const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { initializeDatabase } = require('./utils/database');

const port = process.env.PORT || 3000;

const requestHandler = (req, res) => {
  if (req.url === '/' && req.method === 'GET') {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    fs.readFile(indexPath, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
};

const server = http.createServer(requestHandler);

// Initialize database and start server
initializeDatabase().then(() => {
  server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    console.log(`Database connected to customatch`);
  });
}).catch((error) => {
  console.error('Failed to initialize database:', error);
  process.exit(1);
});