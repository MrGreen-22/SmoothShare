let modes = Object.freeze({ send: 'send', receive: 'receive' });
let currentMode = null;

const sendModeBtn = document.getElementById('sendModeBtn');
const receiveModeBtn = document.getElementById('receiveModeBtn');
const sendSection = document.getElementById('sendSection');
const receiveSection = document.getElementById('receiveSection');
const fileInput = document.getElementById('fileInput');
const fileInputLabel = document.getElementById('fileInputLabel');
const fileInfo = document.getElementById('fileInfo');
const connectSendBtn = document.getElementById('connectSendBtn');
const receiverPeerIdInput = document.getElementById('receiverPeerIdInput');
const listPeerIdDisplay = document.querySelectorAll('.peer-id-display');
const listCopyPeerIdBtn = document.querySelectorAll('.btn-icon.btn-copy');

// send mode button
sendModeBtn.addEventListener('click', () => {
    currentMode = modes.send;
    sendModeBtn.classList.add('active');
    receiveModeBtn.classList.remove('active');
    sendSection.classList.add('active');
    receiveSection.classList.remove('active');

    // stop listening for incoming connections
    if (peer) {
        peer.off('connection', onConnection);
    }
    console.info('Send mode: not listening for incoming connections or data');
});

// receive mode button
receiveModeBtn.addEventListener('click', () => {
    currentMode = modes.receive;
    receiveModeBtn.classList.add('active');
    sendModeBtn.classList.remove('active');
    receiveSection.classList.add('active');
    sendSection.classList.remove('active');

    if (!conn) {
        console.info('Receive mode: listening for incoming connections...');
    }

    // handle incoming connections
    peer.on('connection', onConnection);

    // if a connection already exits and is open, setup file receive
    if (conn && conn.open) {
        console.info('Receive mode: listening for incoming data...');
        // show connection status
        document.querySelector('#receiveSection .status-text').textContent = 'Connected to remote peer: ' + conn.peer;
        document.getElementById('receiveStatus').classList.add('active');
        setupFileReceive();
    }
});

// display user's peer id
function showPeerId() {
    if (!peer || !peer.id) return;

    for (const element of listPeerIdDisplay) {
        element.textContent = peer.id;
        for (const element of listCopyPeerIdBtn) {
            element.disabled = false;
        }
    }
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}


// copy-peer-id btns
for (const element of listCopyPeerIdBtn) {
    element.addEventListener('click', async () => {
        const peerId = document.getElementById('senderPeerIdDisplayMain').textContent;
        try {
            await navigator.clipboard.writeText(peerId);
            showToast('✓ Peer ID copied to clipboard!');
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = peerId;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                showToast('✓ Peer ID copied to clipboard!');
            } catch (err) {
                showToast('✗ Failed to copy');
            }
            document.body.removeChild(textArea);
        }
    });
}


// file input
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        selectedFile = file;
        fileInputLabel.classList.add('has-file');
        fileInfo.innerText = `${file.name}
        (${formatBytes(selectedFile.size)})`;
        updateConnectButton();
        resetTransferStatus();
    }
});

// Format bytes for file size display
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// receiver Peer Id Input
receiverPeerIdInput.addEventListener('input', () => {
    updateConnectButton();
    resetTransferStatus();
});

function updateConnectButton() {
    const hasFile = selectedFile !== null;
    const hasPeerId = receiverPeerIdInput.value.trim().length > 0;
    connectSendBtn.disabled = !(hasFile && hasPeerId);
}

// connect&send button
connectSendBtn.addEventListener('click', async () => {
    const remotePeerId = receiverPeerIdInput.value.trim();

    if (!selectedFile || !remotePeerId) {
        showTransferStatus('error', 'Please select a file and enter a valid Peer ID.');
        return;
    }

    connectSendBtn.disabled = true;
    document.getElementById('sendStatus').classList.add('active');
    resetTransferStatus();
    document.getElementById('sendStatusText').textContent = 'Connecting to peer...';


    // connect to peer and send file when connection opens
    await connectAndSend(remotePeerId);
});

/**
 * 
 * @param {number} progress number in percentage
 */
function updateProgress(progress) {
    document.getElementById(`${currentMode}ProgressBar`).style.width = progress + '%';
    document.getElementById(`${currentMode}ProgressText`).textContent = progress + '%';
}

// receive success
function showReceiveSuccess(blob, fileMetadata) {
    document.getElementById('receiveStatusText').textContent = 'File receive complete!';
    const url = URL.createObjectURL(blob);
    showTransferStatus('success',
        `Successfully received: ${fileMetadata.name} (${formatBytes(fileMetadata.size)}). <a href="${url}" download="${fileMetadata.name}" style="color: #22543d; text-decoration: underline;">Click here to download</a>`);
}

/**
 * display message dialogs about transfer status
 * @param {string} type 'error' | 'success'
 * @param {string} message message text
 */
function showTransferStatus(type, message) {
    const messageBox = document.querySelector(`#${currentMode}Section .transfer-message`);
    messageBox.innerHTML = message;
    messageBox.className = `message transfer-message ${type}-message active`;
}

function resetTransferStatus() {
    document.getElementById(`${currentMode}StatusText`).textContent = '';
    updateProgress(0);
    document.querySelector(`#${currentMode}Section .transfer-message`).classList.remove('active');
}

/**
 * display message dialogs about peer & connection status
 * @param {string} type 'error' | 'success' | 'warning'
 * @param {string} message message text
 */
function showConnStatus(type, message) {
    const arrMessageBox = document.querySelectorAll('.connection-message');
    for (const element of arrMessageBox) {
        element.innerHTML = message;
        element.className = `message connection-message ${type}-message active`;
    }
}

function resetConnStatus() {
    const arrMessageBox = document.querySelectorAll('.connection-message');
    for (const element of arrMessageBox) {
        element.classList.remove('active');
    }
}

