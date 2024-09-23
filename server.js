const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const sanitizeHtml = require('sanitize-html');
const moment = require('moment');
const schedule = require('node-schedule');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const upload = multer({ dest: 'uploads/', limits: { fileSize: 5 * 1024 * 1024 } });

const CHAT_HISTORY_FILE = 'chatHistory.json';
const ROOMS_FILE = 'rooms.json';

let chatHistory = fs.existsSync(CHAT_HISTORY_FILE) ? JSON.parse(fs.readFileSync(CHAT_HISTORY_FILE, 'utf-8')) : {};
let rooms = fs.existsSync(ROOMS_FILE) ? JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf-8')) : {};

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.json());

app.get('/rooms', (req, res) => {
  res.json(Object.keys(rooms));
});

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const originalExt = path.extname(req.file.originalname);
  const newFileName = `${req.file.filename}${originalExt}`;
  const targetPath = path.join(__dirname, 'uploads', newFileName);

  fs.rename(req.file.path, targetPath, (err) => {
    if (err) return res.status(500).json({ error: 'Error saving file' });

    const fileData = {
      filename: newFileName,
      originalname: req.file.originalname,
      uploadDate: new Date(),
    };

    schedule.scheduleJob(moment().add(30, 'days').toDate(), () => {
      fs.unlink(targetPath, (err) => {
        if (err) console.log(`Error deleting file: ${targetPath}`);
      });
    });

    res.json(fileData);
  });
});

io.on('connection', (socket) => {
  socket.emit('updateRooms', Object.keys(rooms));

  socket.on('joinRoom', (roomId) => {
    if (!rooms[roomId]) {
      socket.emit('error', 'Room does not exist');
      return;
    }
    socket.join(roomId);
    socket.emit('chatHistory', chatHistory[roomId] || []);
  });

  socket.on('message', (msg) => {
    const roomId = msg.roomId;
    const sanitizedMessage = sanitizeHtml(msg.message);
    const date = moment().format('YYYY-MM-DD HH:mm:ss');
    const chatData = { user: msg.user, message: sanitizedMessage, time: date, file: msg.file };

    if (!chatHistory[roomId]) chatHistory[roomId] = [];
    chatHistory[roomId].push(chatData);
    
    io.to(roomId).emit('message', chatData);
    fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(chatHistory, null, 2));
  });

  socket.on('createRoom', (roomId) => {
    if (rooms[roomId]) {
      socket.emit('error', 'Room ID already exists');
      return;
    }
    rooms[roomId] = [];
    io.emit('updateRooms', Object.keys(rooms));
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(rooms, null, 2));
  });
});

server.listen(5024, () => {
  console.log('Server is running on port 5024');
});
