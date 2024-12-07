const roomId = new URLSearchParams(window.location.search).get('roomid');

async function fetchRoomInfo() {
    const res = await fetch(`/rooms/${roomId}`);
    if (!res.ok) {
        alert('部屋情報の取得に失敗しました');
        return;
    }
    const roomData = await res.json();
    document.getElementById('roomTitle').textContent = `部屋: ${decodeHTML(roomData.name)}`;
    document.getElementById('roomDescription').textContent = `説明: ${decodeHTML(roomData.description)}`;
}

async function fetchMessages() {
    const res = await fetch(`/rooms/${roomId}/messages`);
    if (!res.ok) {
        alert('メッセージの取得に失敗しました');
        return;
    }
    const messages = await res.json();
    const messageList = document.getElementById('messageList');
    messageList.innerHTML = '';
    messages.forEach(msg => {
        const li = document.createElement('li');
        if (msg.message.includes('<a href')) {
            li.innerHTML = `${msg.date} - ${decodeHTML(msg.name)}: ${msg.message}`;
        } else {
            li.textContent = `${msg.date} - ${decodeHTML(msg.name)}: ${decodeHTML(msg.message)}`;
        }
        messageList.appendChild(li);
    });
}

async function sendMessage() {
    const name = document.getElementById('name').value.trim();
    const message = document.getElementById('message').value.trim();
    const button = document.getElementById('sendButton');
    if (!name || !message) {
        alert('名前とメッセージを入力してください');
        return;
    }
    button.disabled = true;
    try {
        const res = await fetch(`/rooms/${roomId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, message })
        });
        if (!res.ok) {
            throw new Error('メッセージ送信に失敗しました');
        }
        document.getElementById('message').value = '';
        fetchMessages();
    } catch (error) {
        alert(error.message);
    } finally {
        button.disabled = false;
    }
}

async function uploadFile() {
    const fileInput = document.getElementById('fileUpload');
    const file = fileInput.files[0];
    if (!file) {
        alert('ファイルを選択してください');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    const uploadButton = document.getElementById('uploadButton');
    uploadButton.disabled = true;

    try {
        const res = await fetch(`/rooms/${roomId}/upload`, {
            method: 'POST',
            body: formData,
        });
        if (!res.ok) {
            throw new Error('アップロードに失敗しました');
        }
        const data = await res.json();
        alert('ファイルをアップロードしました');
    
        fileInput.value = ''; 
    } catch (error) {
        console.error('アップロードエラー:', error);
        alert('アップロードに失敗しました');
    } finally {
        uploadButton.disabled = false;
    }
}


// WebSocket接続
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const wsUrl = `${protocol}${window.location.host}/?roomid=${roomId}`;
    const ws = new WebSocket(wsUrl);
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const li = document.createElement('li');
        if (data.message.includes('<a href')) {
            li.innerHTML = `${data.date} - ${decodeHTML(data.name)}: ${data.message}`;
        } else {
            li.textContent = `${data.date} - ${decodeHTML(data.name)}: ${decodeHTML(data.message)}`;
        }
        document.getElementById('messageList').appendChild(li);
    };

    ws.onerror = () => {
        console.error('WebSocket接続エラー');
    };

    ws.onclose = () => {
        console.log('WebSocket接続が閉じられました');
    };
}

// HTMLエスケープ
function decodeHTML(html) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = html;
    return textarea.value;
}

async function sendFileLinkMessage(fileLink) {
    const name = 'System';
    const message = fileLink; 
    
    try {
        const res = await fetch(`/rooms/${roomId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, message })
        });
        if (!res.ok) {
            throw new Error('ファイルリンク送信に失敗しました');
        }
        fetchMessages(); 
    } catch (error) {
        alert(error.message);
    }
}


document.addEventListener('DOMContentLoaded', () => {
    fetchRoomInfo();
    fetchMessages();
    connectWebSocket();
    document.getElementById('sendButton').addEventListener('click', sendMessage);
    document.getElementById('uploadButton').addEventListener('click', uploadFile);
});
