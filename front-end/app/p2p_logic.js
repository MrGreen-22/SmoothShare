let peer = null;
let conn = null;
let selectedFile = null;
const CHUNK_SIZE = 32 * 1024; // 32KB chunks
const iceServers = [
    {
        urls: "stun:stun.relay.metered.ca:80",
    },
    {
        urls: "turn:global.relay.metered.ca:80",
        username: "5db638b48e8eafc76d44dd45",
        credential: "UygfMNTXZ5E+9zp1",
    },
    {
        urls: "turn:global.relay.metered.ca:80?transport=tcp",
        username: "5db638b48e8eafc76d44dd45",
        credential: "UygfMNTXZ5E+9zp1",
    },
    {
        urls: "turn:global.relay.metered.ca:443",
        username: "5db638b48e8eafc76d44dd45",
        credential: "UygfMNTXZ5E+9zp1",
    },
    {
        urls: "turns:global.relay.metered.ca:443?transport=tcp",
        username: "5db638b48e8eafc76d44dd45",
        credential: "UygfMNTXZ5E+9zp1",
    },
];


// Initialize peer before DOM load
initPeer();

// Cleanup on page unload
window.onbeforeunload = () => {
    if (conn) conn.close();
    if (peer) peer.destroy();
};

/** 
 * Initialize peer
*/
function initPeer() {
    peer = new Peer(null, {
        debug: 2,
        config: { 'iceServers': iceServers }
    });

    peer.on('open', (id) => {
        resetConnStatus();
        showPeerId();
        console.info('Connected to signaling server');
        console.info('My peer ID: ' + id);

    });

    peer.on('disconnected', () => {
        console.warn('Lost Connection with signaling server. Reconnecting...');
        showConnStatus('warning', 'Warning: Lost connection with signaling server. Reconnecting...');
        peer.reconnect();
    });

    peer.on('error', (err) => {
        console.error(`Peer error: ${err.type}`);
        showConnStatus('error', `Peer error: ${err.type}`);
    });
}

/**
 * connect to receiver peer and send file
 * @param {string} peerId
 */
async function connectAndSend(peerId) {
    // if there's no connection create new one, send file on open
    if (!conn) {
        console.info('Creating new connection...');
        conn = peer.connect(peerId, { reliable: true });
        setupConnection();
        return;
    }

    // if a connection already exits and is open, send file
    if (conn.open) {
        await sendFile();
    }
}

/**
 * Accept new connection from remote peer if none exists, otherwise close it.
 * 
 * Ensures only one active connection at a time
 * @param {DataConnection} connection
 */
function onConnection(connection) {
    if (conn) { // already have a connection
        connection.close();
        return;
    }
    conn = connection;
    console.info('Received incoming connection from remote peer: ', conn.peer);
    setupConnection();
}

/**
 * common logic for connection events
*/
function setupConnection() {
    conn.on('open', async () => {
        resetConnStatus();
        console.info("Connection opened with remote peer: ", conn.peer);
        await logConnectionType(conn.peerConnection);

        if (currentMode === modes.send) {
            // send file
            await sendFile();
        }

        else if (currentMode === modes.receive) {
            // show connection status
            document.querySelector('#receiveSection .status-text').textContent = 'Connected to remote peer: ' + conn.peer;
            document.getElementById('receiveStatus').classList.add('active');

            setupFileReceive();
        }
    });

    conn.on('error', (err) => {
        console.error('Connection error: ', err.type);
        document.querySelector('#receiveSection .status-text').textContent = 'Connection error';
        showConnStatus('error', `Connection error: ${err.type}`);
    });

    conn.on('close', () => {
        console.error('Connection closed with remote peer: ', conn.peer);
        document.querySelector('#receiveSection .status-text').textContent = 'Waiting for connection...';
        showConnStatus('error', `Connection closed with remote peer`);
        conn = null;
    });
}

/**
 * 
 * @param {*} pc PeerConnection of the connection object
 */
async function logConnectionType(pc) {
    const stats = await pc.getStats();
    for (const report of stats.values()) {
        if (report.type === 'candidate-pair' && report.state === "succeeded") {
            const local = stats.get(report.localCandidateId);
            console.log('Connection candidate type:', local.candidateType);
        }
    }
}

// Send file
async function sendFile() {
    if (!selectedFile) {
        console.warn('No file selected to send!');
        return;
    }

    // double check
    if (!conn || !conn.open) {
        console.error('No active connection!');
        return;
    }

    document.getElementById('sendStatusText').textContent = 'Connected! Starting file transfer...';
    // Send metadata
    conn.send({
        type: 'metadata',
        name: selectedFile.name,
        size: selectedFile.size,
    });

    // setup file reading in chunks
    const totalChunks = Math.ceil(selectedFile.size / CHUNK_SIZE);
    let offset = 0;
    let chunkIndex = 0;

    const reader = new FileReader();

    const readNextChunk = function () {
        const slice = selectedFile.slice(offset, offset + CHUNK_SIZE);
        reader.readAsArrayBuffer(slice);
    };

    reader.onload = (e) => {
        conn.send({
            type: 'chunk',
            chunk: e.target.result
        });

        offset += CHUNK_SIZE;
        chunkIndex++;

        // update progress
        const progress = Math.round((chunkIndex / totalChunks) * 100);
        updateProgress(progress);

        if (offset < selectedFile.size) {
            readNextChunk();
        } else {
            // Transfer complete
            conn.send({ type: 'end' });
            document.getElementById('sendStatusText').textContent = 'Transfer complete!';
            showTransferStatus('success', `Successfully sent: ${selectedFile.name}`);
            console.info('File transfer completed: ', selectedFile.name);
        }
    };

    reader.onerror = () => {
        showTransferStatus('error', 'Error reading file!');
        document.getElementById('sendBtn').disabled = false;
    };

    // satrt sending chunks
    readNextChunk();
}

// receive file
function setupFileReceive() {
    let fileMetadata = null;
    let receivedChunks = [];
    let totalChunks = 0;

    function clearVars() {
        receivedChunks = [];
        fileMetadata = null;
        totalChunks = 0;
    }

    conn.on('data', (data) => {
        // double check
        if (!conn || !conn.open) {
            console.error('No active connection!');
            return;
        }

        if (data.type === 'metadata') {
            clearVars();
            resetTransferStatus();
            // Receiving file metadata
            fileMetadata = data;
            totalChunks = Math.ceil(fileMetadata.size / CHUNK_SIZE);
            document.getElementById('receiveStatusText').textContent =
                `Receiving file: ${fileMetadata.name} (${formatBytes(fileMetadata.size)})...`;
        } else if (data.type === 'chunk') {
            // Receiving file chunk
            receivedChunks.push(data.chunk);
            const progress = Math.round((receivedChunks.length / totalChunks) * 100);
            updateProgress(progress);
        } else if (data.type === 'end') {
            // File receive complete
            const blob = new Blob(receivedChunks);
            console.info('File receive completed: ', fileMetadata.name);
            showReceiveSuccess(blob, fileMetadata);
            clearVars();
        }
    });
}

