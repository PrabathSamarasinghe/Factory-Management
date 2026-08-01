const { config } = require('dotenv');
config(); // Load environment variables from .env file

// Required packages
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http'); // 1. IMPORT NATIVE HTTP MODULE
const { WebSocketServer } = require('ws'); // 2. IMPORT WS PACKAGE

// Other required packages and configurations can be added here
const boughtLeafRoutes = require('./routes/boughtLeaf.routes');

const app = express();

app.use(helmet());
app.use(express.json());
app.use(cors());

// 3. WRAP EXPRESS APP IN AN HTTP SERVER
const server = http.createServer(app);

// 4. ATTACH WEBSOCKET SERVER TO THE HTTP SERVER
const wss = new WebSocketServer({ server });

// PRODUCTION FIX FOR RENDER: Keep-alive heartbeat loop
// Sends a silent ping to all clients every 30 seconds so Render doesn't drop the connection
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) {
      ws.ping(); 
    }
  });
}, 30000);

// 5. MANAGE LIVE WEBSOCKET CONNECTIONS
wss.on('connection', (ws) => {
  console.log('Client connected to Bought Leaf microservice via WebSocket');

  // Handle incoming messages from the frontend client
  ws.on('message', (message) => {
    console.log(`Received message: ${message}`);
  });

  // Handle client disconnection
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

app.get('/health', (req, res) => {
  res.send('Bought Leaf microservice is running');
});

app.use('/', boughtLeafRoutes);

// 6. CHANGE app.listen TO server.listen
server.listen(process.env.PORT, () => {
  console.log(`Bought Leaf microservice (HTTP + WS) is running on port ${process.env.PORT}`);
});