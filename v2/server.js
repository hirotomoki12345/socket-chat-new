const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');
const WebSocket = require('ws');
const multer = require('multer');
const crypto = require('crypto');

const app = express();
const PORT = 4003;
const server = http.createServer(app);
const ROOMS_DIR = path.join(__dirname, 'rooms');

// 初期化
if (!fs.existsSync(ROOMS_DIR)) fs.mkdirSync(ROOMS_DIR);

// ファイルアップロード設定
const upload = multer({ dest: path.join(__dirname, 'uploads') });

app.use(express.json());
app.use(express.static('public'));
app.get('/uploads/:roomid/:fileid/*', (req, res, next) => {
    const { roomid, fileid } = req.params;
    const fileName = req.params[0];  // Capture the remaining part of the URL (the file name)
    
    // Construct the file path using the parameters
    const filePath = path.join(ROOMS_DIR, roomid, 'upload', fileid, fileName);
    
    // Check if the file exists
    if (fs.existsSync(filePath)) {
        // Set the Content-Disposition header to trigger file download
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        
        // Send the file to the client
        return res.sendFile(filePath);
    } else {
        return res.status(404).json({ error: 'File not found' });  // Return error if file is not found
    }
});


// WebSocket初期化
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
// ファイルアップロード処理
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

        // ファイルURLを生成 (公開URL)
        const fileUrl = `/uploads/${roomId}/${fileId}/${uploadedFile.originalname}`;
        
        // エスケープ処理をスキップするファイルURL
        const fileUrlSafe = escapeHTML(fileUrl);
        const fileNameSafe = escapeHTML(uploadedFile.originalname);

        // ファイルメッセージを作成 (a要素をエスケープせずに保持)
        const fileMessage = {
            name: 'System',
            message: `<a href="${fileUrlSafe}" target="_blank">${fileNameSafe}</a>`,
            date: formatDate(new Date())
        };

        // メッセージをファイルに保存
        const messagesFile = path.join(roomPath, 'messages.json');
        let messages = fs.existsSync(messagesFile) ? JSON.parse(fs.readFileSync(messagesFile)) : [];

        // 重複メッセージをチェック
        const existingMessage = messages.find(msg => {
            const regex = /href="([^"]+)"/;
            const newMessageUrl = (fileMessage.message.match(regex) || [])[1];
            const existingMessageUrl = (msg.message.match(regex) || [])[1];
            return newMessageUrl === existingMessageUrl;  // URLが一致する場合
        });

        // 重複しない場合のみ追加
        if (!existingMessage) {
            messages.push(fileMessage);
            fs.writeFileSync(messagesFile, JSON.stringify(messages));
        } else {
            console.log('重複するファイルメッセージをスキップ');
        }

        // WebSocketで全員に通知
        if (connections[roomId]) {
            connections[roomId].forEach((ws) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(fileMessage));
                }
            });
        }

        res.json({ message: 'File uploaded successfully', fileUrl: fileUrlSafe });
    } catch (error) {
        console.error('アップロードエラー:', error);
        res.status(500).json({ error: 'Failed to upload file' });
    }
});



// 部屋一覧取得
app.get('/rooms', (req, res) => {
    try {
        const rooms = fs.readdirSync(ROOMS_DIR).map((roomId) => {
            const roomFile = path.join(ROOMS_DIR, roomId, 'room.json');
            return fs.existsSync(roomFile) ? { id: roomId, ...JSON.parse(fs.readFileSync(roomFile)) } : null;
        }).filter(Boolean);
        res.json(rooms);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch rooms' });
    }
});

// 部屋作成
app.post('/rooms', (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name || !description) return res.status(400).json({ error: 'Invalid input' });

        const roomId = Date.now().toString();
        const roomPath = path.join(ROOMS_DIR, roomId);
        fs.mkdirSync(roomPath);
        fs.writeFileSync(path.join(roomPath, 'room.json'), JSON.stringify({ name, description }));

        res.json({ roomId });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create room' });
    }
});

// 部屋詳細取得
app.get('/rooms/:id', (req, res) => {
    const roomPath = path.join(ROOMS_DIR, req.params.id, 'room.json');
    if (!fs.existsSync(roomPath)) return res.status(404).json({ error: 'Room not found' });

    try {
        res.json(JSON.parse(fs.readFileSync(roomPath)));
    } catch {
        res.status(500).json({ error: 'Failed to fetch room data' });
    }
});

// メッセージ履歴取得
app.get('/rooms/:id/messages', (req, res) => {
    const messagesFile = path.join(ROOMS_DIR, req.params.id, 'messages.json');
    if (!fs.existsSync(messagesFile)) return res.json([]);

    try {
        res.json(JSON.parse(fs.readFileSync(messagesFile)));
    } catch {
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// メッセージ送信処理
// メッセージ送信処理
app.post('/rooms/:id/messages', (req, res) => {
    const roomPath = path.join(ROOMS_DIR, req.params.id);
    const messagesFile = path.join(roomPath, 'messages.json');

    if (!fs.existsSync(roomPath)) return res.status(404).send({ error: 'Room not found' });

    try {
        const messages = fs.existsSync(messagesFile) ? JSON.parse(fs.readFileSync(messagesFile)) : [];
        let newMessage;

        if (req.body.message.includes('<a href')) {
            // ファイルリンクが含まれる場合はエスケープ処理をスキップ
            newMessage = {
                name: escapeHTML(req.body.name),
                message: req.body.message,  // エスケープせずそのまま保存
                date: formatDate(new Date())
            };
        } else {
            // 通常のメッセージの場合はエスケープ処理
            newMessage = {
                name: escapeHTML(req.body.name),
                message: escapeHTML(req.body.message),
                date: formatDate(new Date())
            };
        }

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

// HTMLエスケープ
function escapeHTML(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 日付フォーマット
function formatDate(date) {
    const d = new Date(date);
    return `${('0' + (d.getMonth() + 1)).slice(-2)}/${('0' + d.getDate()).slice(-2)} ${('0' + d.getHours()).slice(-2)}:${('0' + d.getMinutes()).slice(-2)}`;
}

server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
