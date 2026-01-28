// Global Vars
let peer = null;
let profilePassword = '';
let sharedFiles = [];
let connections = new Map(); // remotePeerId -> {connection, receivingData};
const connTypes = Object.freeze({ incoming: 'Incoming', outgoing: 'Outgoing' })
const dataTypes = Object.freeze({
    getFiles: 'get_files', error: 'error', fileMetadata: 'file_metadata',
    chunk: 'chunk', fileEnd: 'file_end'
});
const CHUNK_SIZE = 32 * 1024; // 32KB chunks
const transferTypes = Object.freeze({ sending: 'Sending', receiving: 'Receiving' });
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

// self-host config  
const options = {
        host: location.hostname,
		port: location.port || 80,
        path: '/peerserver',
        debug: 2,
        config: { 'iceServers': iceServers }
    }; 

// Main
// Cleanup before page unload
window.onbeforeunload = () => {
    connections.forEach(conn => conn.close());
    if (peer) peer.destroy();
};   

// Peer Management
function initPeer(profileId = null) {
    peer = new Peer(profileId, options);

    peer.on('open', (id) => {
        console.info('Connected to peerJS server');
        console.info('My peer ID: ' + id);
        showMyPeerId();
        showToast('✅ Connected to server');
        updateConnectButton();
    });

    peer.on('disconnected', () => {
        console.warn('Lost Connection with peerJS server. Reconnecting...');
        showToast('🔄 Lost Connection with server. Reconnecting...');
        copyPeerIdBtn.disabled = true;
        peer.reconnect();
    });

    peer.on('error', (err) => {
        console.error(`Peer Error: ${err.type}`);
        showToast(`❌ Error: ${err.type}`);
    });

    peer.on('close', () => {
        console.error('Peer was destroyed.');
        showToast('❗ Peer was destroyed. Try resetting your ID.');
        connections.clear();
        myPeerIdDisplay.textContent = '';
        // initPeer();
    });

    peer.on('connection', (conn) => {
        handleConnection(conn, connTypes.incoming);
    });
}

function connectToPeer(remotePeerId) {
    showToast('🔄 Connecting...');
    let conn = peer.connect(remotePeerId, { reliable: true });
    handleConnection(conn, connTypes.outgoing);
}

// Connection Management
/**
 * setup connection event handlers
*/
function handleConnection(conn, connType) {
    conn.on('open', async () => {
        console.info("Connection opened with remote peer: ", conn.peer);
        await logConnectionType(conn.peerConnection);
        connections.set(conn.peer, { connection: conn, receivingData: null });
        if (connType === connTypes.outgoing) {
            remotePeerIdInput.value = '';
            addConnectionBox(conn.peer);
            showToast('✅ Connected successfully');
        }
        else {
            showToast('✅ Incoming connection established from ' + conn.peer);
        }
    });

    conn.on('data', (data) => {
        handleReceivedData(data, conn.peer);
    });

    conn.on('close', () => {
        handleDisconnect(conn.peer);
    });

    conn.on('error', (err) => {
        console.error('Connection error: ', err.type);
        conn.close();
        handleDisconnect(conn.peer);
        // showConnStatus('error', `Connection error: ${err.type}`);
    });
}

/**
 * @param {*} peerConnection PeerConnection of the connection object
 */
async function logConnectionType(peerConnection) {
    const stats = await peerConnection.getStats();
    for (const report of stats.values()) {
        if (report.type === 'candidate-pair' && report.state === "succeeded") {
            const local = stats.get(report.localCandidateId);
            console.log('Connection candidate type:', local.candidateType);
        }
    }
}

function handleDisconnect(remotePeerId) {
    console.info('Disconnected from: ', remotePeerId);
    connections.delete(remotePeerId);
    showToast('Disconnected from ' + remotePeerId);
    removeConnectionBox(remotePeerId);
    removeTransferBox(transferTypes.sending, remotePeerId);
    removeTransferBox(transferTypes.receiving, remotePeerId);
}

function closeConnection(remotePeerId) {
    connections.get(remotePeerId).connection.close();
    handleDisconnect(remotePeerId);
}

// Transfer Management
function requestFiles(remotePeerId, requestFilesBtn) {
    requestFilesBtn.disabled = true;
    removeTransferBox(transferTypes.sending, remotePeerId);
    removeTransferBox(transferTypes.receiving, remotePeerId);
    const password = document.getElementById(`conn-password-${remotePeerId}`).value;
    // send password along with request
    connections.get(remotePeerId).connection.send({ type: dataTypes.getFiles, password: password });
}

function handleReceivedData(data, remotePeerId) {
    let connData = connections.get(remotePeerId);
    switch (data.type) {
        // Get Files Request
        case dataTypes.getFiles:
            let conn = connData.connection;
            // verify password
            if (data.password !== profilePassword) {
                conn.send({ type: dataTypes.error, message: 'Invalid password. Access denied.' });
                return;
            }
            // check if there are files available to share
            if (sharedFiles.length === 0) {
                conn.send({ type: 'error', message: 'No files available for sharing' });
                return;
            }

            sendFiles(conn, remotePeerId);
            break;
        // Error    
        case dataTypes.error:
            const connectionBox = document.getElementById(`conn-${remotePeerId}`);
            showStatus(`${data.message}`, 'error', connectionBox);
            showToast(`❌ Error from ${remotePeerId}: ${data.message}`);
            updateTransferStatus(transferTypes.receiving, remotePeerId, 'error');
            // setTimeout(() => {
            //     removeTransferBox(transferTypes.receiving, remotePeerId);
            // }, 5000);
            enableRequestFilesBtn(remotePeerId);
            break;
        // File Metadata
        case dataTypes.fileMetadata:
            connData.receivingData = {
                metadata: data.metadata,
                chunks: [],
                currentFile: data.metadata.currentFile,
                totalFiles: data.metadata.totalFiles
            };
            renderTransferBox(transferTypes.receiving, remotePeerId, data.metadata);
            break;
        // File Chunk
        case dataTypes.chunk:
            if (connData.receivingData) {
                connData.receivingData.chunks.push(data.chunk);
                const progress = (connData.receivingData.chunks.length * CHUNK_SIZE /
                    connData.receivingData.metadata.size * 100);
                updateProgress(transferTypes.receiving, remotePeerId, Math.min(progress, 100).toFixed(0));
            }
            break;
        // File End
        case dataTypes.fileEnd:
            // File transfer complete
            if (connData.receivingData) {
                const blob = new Blob(connData.receivingData.chunks);
                const transferBoxContainer = document.getElementById(`transfer-recv-${remotePeerId}`);
                showDownloadDialog(blob, connData.receivingData.metadata, transferBoxContainer);

                const isLastFile = connData.receivingData.currentFile === connData.receivingData.totalFiles;
                if (isLastFile) {
                    updateTransferStatus(transferTypes.receiving, remotePeerId, 'complete');
                    const connectionBox = document.getElementById(`conn-${remotePeerId}`);
                    showStatus('All files received successfully', 'success', connectionBox);
                    enableRequestFilesBtn(remotePeerId);
                }
                // not the last file: clear receivingData for the next file
                connData.receivingData = null;
            }
            break;
        default:
            console.error(`received unvalid response from remote peer: ${remotePeerId}`);
            break;
    }
}

async function sendFiles(conn, remotePeerId) {
    for (let i = 0; i < sharedFiles.length; i++) {
        const file = sharedFiles[i];

        // Create transfer box
        renderTransferBox(transferTypes.sending, remotePeerId,
            {
                name: file.name,
                currentFile: i + 1,
                totalFiles: sharedFiles.length
            });

        // Send metadata
        conn.send({
            type: dataTypes.fileMetadata,
            metadata: {
                name: file.name,
                size: file.size,
                fileType: file.type,
                currentFile: i + 1,
                totalFiles: sharedFiles.length
            }
        });

        try {
            // Send file in chunks
            await sendFileInChunks(conn, file, remotePeerId);
            // Send end file signal
            conn.send({ type: dataTypes.fileEnd });
        } catch (error) {
            showToast(`❌ Error sending file to ${remotePeerId}: ` + error.message);
            // set transfer box status to error
            updateTransferStatus(transferTypes.sending, remotePeerId, 'error');
            setTimeout(() => {
                removeTransferBox(transferTypes.sending, remotePeerId);
            }, 5000);
            // notify remote peer
            conn.send({ type: dataTypes.error, message: 'File transfer failed: ' + error.message });
            return;
        }
    }

    // Mark transfer as complete
    updateTransferStatus(transferTypes.sending, remotePeerId, 'complete');
    setTimeout(() => {
        removeTransferBox(transferTypes.sending, remotePeerId);
    }, 3000);
}

function sendFileInChunks(conn, file, peerId) {
    return new Promise((resolve, reject) => {
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        let offset = 0;
        let chunkIndex = 0;
        const reader = new FileReader();

        const readNextChunk = () => {
            const slice = file.slice(offset, offset + CHUNK_SIZE);
            reader.readAsArrayBuffer(slice);
        };

        reader.onload = (e) => {
            if (!conn.open) {
                reject(new Error('Connection closed'));
                return;
            }

            conn.send({
                type: 'chunk',
                chunk: e.target.result
            });

            offset += CHUNK_SIZE;
            chunkIndex++;

            const progress = Math.round((chunkIndex / totalChunks) * 100);
            updateProgress(transferTypes.sending, peerId, Math.min(progress, 100).toFixed(0));

            if (offset < file.size) {
                readNextChunk();
            } else {
                // File sent completely
                resolve();
                return;
            }
        };

        reader.onerror = () => {
            reject(new Error('Failed to read file'));
            return;
        };
        // start reading
        readNextChunk();
    });
}
