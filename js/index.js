// DOM Elements
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const myPeerIdDisplay = document.getElementById('myPeerIdDisplay');
const copyPeerIdBtn = document.getElementById('copyPeerIdBtn');
const remotePeerIdInput = document.getElementById('remotePeerIdInput');
const connectBtn = document.getElementById('connectBtn');
const connectionsListEl = document.getElementById('connectionsList');
const sendingTransfersEl = document.getElementById('sendingTransfers');
const receivingTransfersEl = document.getElementById('receivingTransfers');

// Peer Management
// display user's peer id
function showMyPeerId() {
    if (!peer || !peer.id) return;
    myPeerIdDisplay.textContent = peer.id;
    copyPeerIdBtn.disabled = false;
}

// copy-peer-id button
copyPeerIdBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(peer.id);
        showToast('✓ Peer ID copied to clipboard!');
    } catch (err) {
        const textArea = document.createElement('textarea');
        textArea.value = peer.id;
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


// File Management
fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    // add files if not already in sharedFiles
    files.forEach(file => {
        if (!sharedFiles.find(f => f.name === file.name && f.size === file.size)) {
            sharedFiles.push(file);
        }
    });
    renderFileList();
    fileInput.value = ''; // Reset input
});

function renderFileList() {
    if (sharedFiles.length === 0) {
        fileList.innerHTML = '<div class="empty-state">No files selected. Click below to add files to share.</div>';
        return;
    }

    fileList.innerHTML = sharedFiles.map((file, index) => `
        <div class="file-item">
          <div class="file-item-info">
            <div class="file-item-icon">📄</div>
            <div class="file-item-details">
              <div class="file-item-name">${file.name}</div>
              <div class="file-item-size">${formatFileSize(file.size)}</div>
            </div>
          </div>
          <button class="file-item-remove" onclick="removeFile(${index})">Remove</button>
        </div>
      `).join('');
}

function removeFile(index) {
    sharedFiles.splice(index, 1);
    renderFileList();
}

// Connection Management
remotePeerIdInput.addEventListener('input', () => {
    updateConnectButton();
    // resetTransferStatus();
});

function updateConnectButton() {
    const hasPeerId = remotePeerIdInput.value.trim().length > 0;
    connectBtn.disabled = !(peer && hasPeerId);
}

connectBtn.addEventListener('click', () => {
    const remotePeerId = remotePeerIdInput.value.trim();

    if (remotePeerId === peer.id) {
        showToast('Cannot connect to yourself');
        return;
    }

    // check if already connected to the reomte peer
    if (handleExistingConn(remotePeerId)) {
        return;
    }
    connectToPeer(remotePeerId);
});

function handleExistingConn(remotePeerId) {
    if (connections.has(remotePeerId)) {
        showToast('✓ Connection found');
        remotePeerIdInput.value = '';
        // if the connection is not shown in the list, add it to the list
        const connectionBox = document.querySelector(`[data-peer-id="${remotePeerId}"]`);
        if (!connectionBox) {
            addConnectionBox(remotePeerId)
        }
        // else: Highlight the existing connection briefly
        else {
            connectionBox.style.transform = 'scale(1.02)';
            setTimeout(() => {
                connectionBox.style.transform = 'scale(1)';
            }, 300);
        }
        return true;
    }
    return false;
}

function addConnectionBox(remotePeerId) {
    if (connectionsListEl.classList.contains('empty-state')) {
        connectionsListEl.classList.remove('empty-state');
        connectionsListEl.innerHTML = '';
    }

    let tempContainer = document.createElement('div');
    tempContainer.innerHTML = (`
        <div class="connection-box" data-peer-id="${remotePeerId}" style="transition: transform 0.3s;">
          <div class="connection-box-header">
            <span class="connection-status-icon"></span>
            <div class="connection-peer-id">Peer-ID: ${remotePeerId}</div>
          </div>
          <div class="connection-actions">
            <button class="btn btn-success" onclick="requestFiles('${remotePeerId}', this)">📥 Request Files</button>
            <button class="btn btn-danger" onclick="closeConnection('${remotePeerId}')">🔌 Disconnect</button>
          </div>
        </div>
        `);
    let connectionBox = tempContainer.querySelector('.connection-box');
    connectionsListEl.prepend(connectionBox);
    tempContainer.remove();
}

function removeConnectionBox(remotePeerId) {
    const connectionBox = document.querySelector(`[data-peer-id="${remotePeerId}"]`);
    if (connectionBox) {
        connectionBox.remove();
    }
    if (connectionsListEl.children.length === 0) {
        connectionsListEl.classList.add('empty-state')
        connectionsListEl.innerHTML = 'No added connections';
    }
}

// Transfer Management
function enableRequestFilesBtn(remotePeerId) {
    const connectionBox = document.querySelector(`[data-peer-id="${remotePeerId}"]`);
    connectionBox.querySelector('.btn-success').disabled = false;
}

/**
 * @param {*} metadata object containing: name(File Name), currentFile(index), totalFiles
 */
function renderTransferBox(transferType, peerId, metadata) {
    let typeId;
    if (transferType === transferTypes.sending) {
        typeId = 'send';
    } else {
        typeId = 'recv';
    }

    // if the box already exists, update it and return
    const existingBox = document.getElementById(`transfer-${typeId}-${peerId}`);
    if (existingBox) {
        existingBox.querySelector('.transfer-file').textContent =
            `File ${metadata.currentFile}/${metadata.totalFiles}: ${metadata.name}`;
        return;
    }

    let container;
    if (transferType === transferTypes.sending) {
        container = sendingTransfersEl;
    } else {
        container = receivingTransfersEl;
    }

    // Remove empty state if exists
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    const box = document.createElement('div');
    box.className = 'transfer-box';
    box.id = `transfer-${typeId}-${peerId}`;
    box.innerHTML = `
        <div class="transfer-header">
          <div class="transfer-peer">${peerId}</div>
          <div class="transfer-status active">${transferType}</div>
        </div>
        <div class="transfer-file">File ${metadata.currentFile}/${metadata.totalFiles}: ${metadata.name}</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: 0%">0%</div>
        </div>
      `;
    container.prepend(box);
}

// Update progress
function updateProgress(transferType, peerId, percent) {
    let typeId;
    if (transferType === transferTypes.sending) {
        typeId = 'send';
    } else {
        typeId = 'recv';
    }

    const box = document.getElementById(`transfer-${typeId}-${peerId}`);
    if (box) {
        const fill = box.querySelector('.progress-fill');
        fill.style.width = percent + '%';
        fill.textContent = percent + '%';
    }
}

// Update transfer status
function updateTransferStatus(transferType, peerId, status) {
    let typeId;
    if (transferType === transferTypes.sending) {
        typeId = 'send';
    } else {
        typeId = 'recv';
    }

    const box = document.getElementById(`transfer-${typeId}-${peerId}`);
    if (box) {
        const statusEl = box.querySelector('.transfer-status');
        statusEl.textContent = status;
        statusEl.className = `transfer-status ${status}`;
    }
}

// Remove transfer box
function removeTransferBox(transferType, peerId) {
    let typeId;
    let container;
    if (transferType === transferTypes.sending) {
        typeId = 'send';
        container = sendingTransfersEl;
    } else {
        typeId = 'recv';
        container = receivingTransfersEl;
    }

    const box = document.getElementById(`transfer-${typeId}-${peerId}`);
    if (box) {
        // clear URLs
        box.querySelectorAll('a').forEach(link => {
            const url = link.href;
            if (url) {
                URL.revokeObjectURL(url);
            }
        });

        box.remove();
    }

    if (container.children.length === 0) {
        setTransferListAsEmpty(transferType);
    }
}

// Clear all transfer boxes in a container
function setTransferListAsEmpty(transferType) {
    let container;
    if (transferType === transferTypes.sending) {
        container = sendingTransfersEl;
    } else {
        container = receivingTransfersEl;
    }

    container.innerHTML = `
        <div class="empty-state">
          <div class="icon">📭</div>
          <div>No active downloads</div>
        </div>
      `;
}

// Utility Functions
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

// Format bytes for file size display
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// function escapeHtml(text) {
//     const div = document.createElement('div');
//     div.textContent = text;
//     return div.innerHTML;
// }

/**
 * Show status dialog 
 * @param {*} type 'success' | 'error' | 'info'  
 */
function showStatus(message, type, container) {
    const existing = container.querySelector('.status');
    if (existing) existing.remove();

    container.innerHTML += `<div class="status ${type}">${message}</div>`;

    setTimeout(() => {
        const status = container.querySelector('.status');
        if (status && status.textContent === message) {
            status.remove();
        }
    }, 3000);
}

function showDownloadDialog(blob, fileMetadata, transferBoxContainer) {
    const url = URL.createObjectURL(blob);
    const message = `<a href="${url}" download="${fileMetadata.name}" style="text-decoration: underline;">Download:</a> ${fileMetadata.name} (${formatFileSize(fileMetadata.size)})`;
    transferBoxContainer.innerHTML += `<div class="status success">${message}</div>`;
}

