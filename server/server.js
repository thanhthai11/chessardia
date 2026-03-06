// ============================================================
// server.js — Entry point
// ============================================================
const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const path     = require('path');
const { registerHandlers } = require('./socketHandler');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Serve frontend
app.use(express.static(path.join(__dirname, '../public')));

// Socket.io
io.on('connection', (socket) => {
  console.log(`[+] connect   ${socket.id}`);
  registerHandlers(io, socket);
  socket.on('disconnect', () => console.log(`[-] disconnect ${socket.id}`));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
