/**
 * VPS Dashboard - Remnawave Style
 * Main JavaScript
 */

// Configuration
const SECURE_PATH = window.location.pathname.split('/').filter(Boolean)[0] || 'dashboard';
const API_BASE = `/${SECURE_PATH}/api`;

// State
let currentPath = '/';
let terminalSocket = null;
let statsInterval = null;

// DOM Elements
const tabs = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');
const currentPageEl = document.getElementById('current-page');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initStats();
    initFiles();
    initTerminal();
    initModals();
});

// Tabs
function initTabs() {
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const tabName = tab.dataset.tab;
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    // Update nav
    tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    // Update content
    tabContents.forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}-tab`);
    });
    
    // Update breadcrumb
    const pageNames = {
        'overview': 'Обзор',
        'files': 'Файлы',
        'terminal': 'Терминал'
    };
    currentPageEl.textContent = pageNames[tabName] || 'Обзор';
    
    // Stop stats if not overview
    if (tabName !== 'overview' && statsInterval) {
        clearInterval(statsInterval);
        statsInterval = null;
    } else if (tabName === 'overview') {
        initStats();
    }
}

// Stats
function initStats() {
    if (statsInterval) return;
    
    updateStats();
    statsInterval = setInterval(updateStats, 5000);
}

async function updateStats() {
    try {
        const response = await fetch(`${API_BASE}/system/info`);
        const data = await response.json();
        
        if (data.error) return;
        
        // Update CPU
        document.getElementById('cpu-value').textContent = `${data.cpu_usage}%`;
        document.getElementById('cpu-bar').style.width = `${data.cpu_usage}%`;
        
        // Update Memory
        document.getElementById('mem-value').textContent = `${data.memory_usage}%`;
        document.getElementById('mem-bar').style.width = `${data.memory_usage}%`;
        
        // Update Disk
        document.getElementById('disk-value').textContent = `${data.disk_usage}%`;
        document.getElementById('disk-bar').style.width = `${data.disk_usage}%`;
        
        // Update Uptime
        document.getElementById('uptime-value').textContent = formatUptime(data.uptime_seconds);
        document.getElementById('os-info').textContent = data.os_info;
        
        // Update hostname
        document.getElementById('hostname').textContent = data.hostname;
        document.getElementById('info-hostname').textContent = data.hostname;
        document.getElementById('info-os').textContent = data.os_info;
        document.getElementById('info-memory').textContent = `${data.memory_total_mb} MB`;
        
    } catch (error) {
        console.error('Stats error:', error);
    }
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
        return `${days}д ${hours}ч ${minutes}м`;
    }
    return `${hours}ч ${minutes}м ${seconds % 60}с`;
}

// Files
function initFiles() {
    loadFiles('/');
    
    document.getElementById('btn-back').addEventListener('click', goBack);
    document.getElementById('btn-refresh').addEventListener('click', () => loadFiles(currentPath));
    document.getElementById('btn-create-dir').addEventListener('click', showCreateDirModal);
    document.getElementById('file-upload').addEventListener('change', handleFileUpload);
}

async function loadFiles(path) {
    try {
        const response = await fetch(`${API_BASE}/files?path=${encodeURIComponent(path)}`);
        const data = await response.json();
        
        if (data.error) {
            showError(data.error);
            return;
        }
        
        currentPath = data.current_path;
        updatePathDisplay(data.current_path);
        renderFiles(data);
        
    } catch (error) {
        console.error('Files error:', error);
        showError('Ошибка загрузки файлов');
    }
}

function updatePathDisplay(path) {
    document.getElementById('current-path').textContent = path;
}

function renderFiles(data) {
    const container = document.getElementById('files-list');
    
    if (data.items.length === 0) {
        container.innerHTML = `
            <div class="file-item" style="justify-content: center; color: var(--text-tertiary);">
                Пусто
            </div>
        `;
        return;
    }
    
    container.innerHTML = data.items.map(item => {
        const iconClass = getFileIconClass(item);
        const sizeDisplay = item.is_dir ? '-' : formatSize(item.size);
        
        return `
            <div class="file-item" data-path="${escapeHtml(item.path)}">
                <div class="file-icon ${iconClass}">
                    ${getFileIcon(item)}
                </div>
                <div class="file-info">
                    <div class="file-name">${escapeHtml(item.name)}</div>
                    <div class="file-meta">
                        <span class="file-modified">${item.modified}</span>
                        <span class="file-size">${sizeDisplay}</span>
                        <span class="file-permissions">${item.permissions}</span>
                    </div>
                </div>
                <div class="file-actions">
                    ${item.is_dir ? `
                        <button class="btn-icon" onclick="openDirectory('${escapeHtml(item.path)}')" title="Открыть">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="9 18 15 12 9 6"/>
                            </svg>
                        </button>
                    ` : ''}
                    ${!item.is_dir ? `
                        <button class="btn-icon" onclick="downloadFile('${escapeHtml(item.path)}')" title="Скачать">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/>
                                <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                        </button>
                        <button class="btn-icon" onclick="editFile('${escapeHtml(item.path)}')" title="Редактировать">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                    ` : ''}
                    <button class="btn-icon" onclick="deleteItem('${escapeHtml(item.path)}')" title="Удалить">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Add click handlers for directories
    container.querySelectorAll('.file-item').forEach(item => {
        const path = item.dataset.path;
        const isDir = item.querySelector('.file-icon').classList.contains('folder');
        
        // Одинарный клик для папок - открывает директорию
        item.addEventListener('click', (e) => {
            // Игнорировать клики по кнопкам действий
            if (e.target.closest('.file-actions')) return;
            
            if (isDir) {
                loadFiles(path);
            }
        });
        
        // Двойной клик тоже работает
        item.addEventListener('dblclick', () => {
            if (isDir) {
                loadFiles(path);
            }
        });
    });
}

function getFileIconClass(item) {
    if (item.is_dir) return 'folder';
    
    const ext = item.name.split('.').pop().toLowerCase();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'];
    const archiveExts = ['zip', 'tar', 'gz', 'rar', '7z'];
    const codeExts = ['py', 'js', 'html', 'css', 'json', 'xml', 'yaml', 'yml', 'sh', 'conf', 'cfg'];
    
    if (imageExts.includes(ext)) return 'image';
    if (archiveExts.includes(ext)) return 'archive';
    if (codeExts.includes(ext)) return 'code';
    return 'file';
}

function getFileIcon(item) {
    if (item.is_dir) {
        return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>`;
    }
    
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
        <polyline points="13 2 13 9 20 9"/>
    </svg>`;
}

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function goBack() {
    const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
    loadFiles(parentPath);
}

function openDirectory(path) {
    loadFiles(path);
}

async function downloadFile(path) {
    window.location.href = `${API_BASE}/files/download?path=${encodeURIComponent(path)}`;
}

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', currentPath);
    
    try {
        const response = await fetch(`${API_BASE}/files/upload`, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        
        if (data.error) {
            showError(data.error);
        } else {
            loadFiles(currentPath);
        }
    } catch (error) {
        console.error('Upload error:', error);
        showError('Ошибка загрузки');
    }
    
    e.target.value = '';
}

async function deleteItem(path) {
    if (!confirm(`Удалить "${path}"?`)) return;
    
    try {
        const formData = new FormData();
        formData.append('path', path);
        
        const response = await fetch(`${API_BASE}/files/delete`, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        
        if (data.error) {
            showError(data.error);
        } else {
            loadFiles(currentPath);
        }
    } catch (error) {
        console.error('Delete error:', error);
        showError('Ошибка удаления');
    }
}

// File Editor
async function editFile(path) {
    try {
        const response = await fetch(`${API_BASE}/files/read?path=${encodeURIComponent(path)}`);
        const data = await response.json();
        
        if (data.error) {
            showError(data.error);
            return;
        }
        
        document.getElementById('file-editor-content').value = data.content;
        document.getElementById('editor-file-path').textContent = data.path;
        document.getElementById('file-editor-modal').classList.add('active');
        
    } catch (error) {
        console.error('Edit error:', error);
        showError('Ошибка чтения файла');
    }
}

async function saveFile() {
    const path = document.getElementById('editor-file-path').textContent;
    const content = document.getElementById('file-editor-content').value;
    
    try {
        const formData = new FormData();
        formData.append('path', path);
        formData.append('content', content);
        
        const response = await fetch(`${API_BASE}/files/save`, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        
        if (data.error) {
            showError(data.error);
        } else {
            document.getElementById('file-editor-modal').classList.remove('active');
            loadFiles(currentPath);
        }
    } catch (error) {
        console.error('Save error:', error);
        showError('Ошибка сохранения');
    }
}

// Create Directory
function showCreateDirModal() {
    document.getElementById('create-dir-name').value = '';
    document.getElementById('create-dir-modal').classList.add('active');
    document.getElementById('create-dir-name').focus();
}

async function createDirectory() {
    const name = document.getElementById('create-dir-name').value.trim();
    if (!name) return;
    
    try {
        const formData = new FormData();
        formData.append('path', currentPath);
        formData.append('name', name);
        
        const response = await fetch(`${API_BASE}/files/create_dir`, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        
        if (data.error) {
            showError(data.error);
        } else {
            document.getElementById('create-dir-modal').classList.remove('active');
            loadFiles(currentPath);
        }
    } catch (error) {
        console.error('Create dir error:', error);
        showError('Ошибка создания папки');
    }
}

// Terminal
function initTerminal() {
    const terminalInput = document.getElementById('terminal-input');
    
    terminalInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const command = terminalInput.value;
            executeCommand(command);
            terminalInput.value = '';
        }
    });
    
    // Connect WebSocket
    connectTerminal();
}

function connectTerminal() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    terminalSocket = io(`${protocol}//${window.location.host}`, {
        path: `/${SECURE_PATH}/socket.io`
    });
    
    terminalSocket.on('connect', () => {
        appendToTerminal('\x1b[32mПодключено к терминалу\x1b[0m\r\n');
    });
    
    terminalSocket.on('terminal_output', (data) => {
        appendToTerminal(data.data);
    });
    
    terminalSocket.on('disconnect', () => {
        appendToTerminal('\r\n\x1b[31mОтключено от терминала\x1b[0m\r\n');
    });
}

function executeCommand(command) {
    appendToTerminal(`\r\n\x1b[32mroot@vps:~$\x1b[0m ${command}\r\n`);
    
    if (terminalSocket && terminalSocket.connected) {
        terminalSocket.emit('terminal_input', { data: command + '\n' });
    } else {
        // Fallback to HTTP
        fetch(`${API_BASE}/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `command=${encodeURIComponent(command)}`
        })
        .then(res => res.json())
        .then(data => {
            if (data.stdout) appendToTerminal(data.stdout);
            if (data.stderr) appendToTerminal(data.stderr);
            if (data.error) appendToTerminal(`\x1b[31m${data.error}\x1b[0m\r\n`);
        })
        .catch(err => {
            appendToTerminal(`\x1b[31mОшибка: ${err}\x1b[0m\r\n`);
        });
    }
}

function appendToTerminal(text) {
    const output = document.getElementById('terminal-output');
    output.textContent += text;
    output.scrollTop = output.scrollHeight;
}

function clearTerminal() {
    document.getElementById('terminal-output').textContent = '';
}

// Modals
function initModals() {
    // Editor modal
    document.getElementById('editor-close').addEventListener('click', () => {
        document.getElementById('file-editor-modal').classList.remove('active');
    });
    document.getElementById('editor-cancel').addEventListener('click', () => {
        document.getElementById('file-editor-modal').classList.remove('active');
    });
    document.getElementById('editor-save').addEventListener('click', saveFile);
    
    // Create dir modal
    document.getElementById('create-dir-close').addEventListener('click', () => {
        document.getElementById('create-dir-modal').classList.remove('active');
    });
    document.getElementById('create-dir-cancel').addEventListener('click', () => {
        document.getElementById('create-dir-modal').classList.remove('active');
    });
    document.getElementById('create-dir-submit').addEventListener('click', createDirectory);
    
    // Close on escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(modal => {
                modal.classList.remove('active');
            });
        }
    });
    
    // Close on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
    
    // Terminal clear
    document.getElementById('btn-clear-terminal').addEventListener('click', clearTerminal);
}

// Utilities
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showError(message) {
    console.error(message);
    // Could show toast notification here
}
