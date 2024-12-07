const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');
const WebSocket = require('ws');
const multer = require('multer');
const crypto = require('crypto');

const app = express();
const PORT = 4000;
const server = http.createServer(app);
const ROOMS_DIR = path.join(__dirname, 'rooms');

if (!fs.existsSync(ROOMS_DIR)) fs.mkdirSync(ROOMS_DIR);

const upload = multer({ dest: path.join(__dirname, 'uploads') });

app.use(express.json());
app.use(express.static('public'));

app.get('/uploads/:roomid/:fileid/*', (req, res) => {
    const { roomid, fileid } = req.params;
    const fileName = req.params[0];
    const filePath = path.join(ROOMS_DIR, roomid, 'upload', fileid, fileName);

    if (fs.existsSync(filePath)) {
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        return res.sendFile(filePath);
    } else {
        return res.status(404).json({ error: 'File not found' });
    }
});

const wss = new WebSocket.Server({ server });
const connections = {};

wss.on('connection', (ws, req) => {
    const roomId = new URL(req.url, `http://${req.headers.host}`).searchParams.get('roomid');
    if (!connections[roomId]) connections[roomId] = [];
    connections[roomId].push(ws);

    ws.on('message', (message) => {
        connections[roomId].forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    });

    ws.on('close', () => {
        connections[roomId] = connections[roomId].filter((client) => client !== ws);
    });
});

app.post('/rooms/:id/upload', upload.single('file'), (req, res) => {
    const roomId = req.params.id;
    const roomPath = path.join(ROOMS_DIR, roomId);
    if (!fs.existsSync(roomPath)) return res.status(404).json({ error: 'Room not found' });

    try {
        const uploadedFile = req.file;
        const fileId = crypto.randomBytes(16).toString('hex');
        const uploadDir = path.join(roomPath, 'upload', fileId);
        fs.mkdirSync(uploadDir, { recursive: true });

        const targetPath = path.join(uploadDir, uploadedFile.originalname);
        fs.renameSync(uploadedFile.path, targetPath);

        const fileUrl = `/uploads/${roomId}/${fileId}/${uploadedFile.originalname}`;
        const fileMessage = {
            name: 'System',
            message: `<a href="${escapeHTML(fileUrl)}" target="_blank">${escapeHTML(uploadedFile.originalname)}</a>`,
            date: formatDate(new Date())
        };

        const messagesFile = path.join(roomPath, 'messages.json');
        let messages = fs.existsSync(messagesFile) ? JSON.parse(fs.readFileSync(messagesFile)) : [];

        const existingMessage = messages.find(msg => {
            const regex = /href="([^"]+)"/;
            const newMessageUrl = (fileMessage.message.match(regex) || [])[1];
            const existingMessageUrl = (msg.message.match(regex) || [])[1];
            return newMessageUrl === existingMessageUrl;
        });

        if (!existingMessage) {
            messages.push(fileMessage);
            fs.writeFileSync(messagesFile, JSON.stringify(messages));
        }

        if (connections[roomId]) {
            connections[roomId].forEach((ws) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(fileMessage));
                }
            });
        }

        res.json({ message: 'File uploaded successfully', fileUrl: escapeHTML(fileUrl) });
    } catch {
        res.status(500).json({ error: 'Failed to upload file' });
    }
});

app.get('/rooms', (req, res) => {
    try {
        const rooms = fs.readdirSync(ROOMS_DIR).map((roomId) => {
            const roomFile = path.join(ROOMS_DIR, roomId, 'room.json');
            return fs.existsSync(roomFile) ? { id: roomId, ...JSON.parse(fs.readFileSync(roomFile)) } : null;
        }).filter(Boolean);
        res.json(rooms);
    } catch {
        res.status(500).json({ error: 'Failed to fetch rooms' });
    }
});

app.post('/rooms', (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name || !description) return res.status(400).json({ error: 'Invalid input' });

        const roomId = Date.now().toString();
        const roomPath = path.join(ROOMS_DIR, roomId);
        fs.mkdirSync(roomPath);
        fs.writeFileSync(path.join(roomPath, 'room.json'), JSON.stringify({ name, description }));

        res.json({ roomId });
    } catch {
        res.status(500).json({ error: 'Failed to create room' });
    }
});

app.get('/rooms/:id', (req, res) => {
    const roomPath = path.join(ROOMS_DIR, req.params.id, 'room.json');
    if (!fs.existsSync(roomPath)) return res.status(404).json({ error: 'Room not found' });

    try {
        res.json(JSON.parse(fs.readFileSync(roomPath)));
    } catch {
        res.status(500).json({ error: 'Failed to fetch room data' });
    }
});

app.get('/rooms/:id/messages', (req, res) => {
    const messagesFile = path.join(ROOMS_DIR, req.params.id, 'messages.json');
    if (!fs.existsSync(messagesFile)) return res.json([]);

    try {
        res.json(JSON.parse(fs.readFileSync(messagesFile)));
    } catch {
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

app.post('/rooms/:id/messages', (req, res) => {
    const roomPath = path.join(ROOMS_DIR, req.params.id);
    const messagesFile = path.join(roomPath, 'messages.json');

    if (!fs.existsSync(roomPath)) return res.status(404).send({ error: 'Room not found' });

    try {
        const messages = fs.existsSync(messagesFile) ? JSON.parse(fs.readFileSync(messagesFile)) : [];
        const newMessage = {
            name: escapeHTML(req.body.name),
            message: req.body.message.includes('<a href') ? req.body.message : escapeHTML(req.body.message),
            date: formatDate(new Date())
        };

        messages.push(newMessage);
        fs.writeFileSync(messagesFile, JSON.stringify(messages));

        if (connections[req.params.id]) {
            connections[req.params.id].forEach((ws) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(newMessage));
                }
            });
        }

        res.json(newMessage);
    } catch {
        res.status(500).json({ error: 'Failed to send message' });
    }
});

function escapeHTML(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(date) {
    const d = new Date(date);
    return `${('0' + (d.getMonth() + 1)).slice(-2)}/${('0' + d.getDate()).slice(-2)} ${('0' + d.getHours()).slice(-2)}:${('0' + d.getMinutes()).slice(-2)}`;
}

server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
