#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VPS Dashboard - Remnawave Style
Main App
"""

import os
import sys
import json
import secrets
import hashlib
import subprocess
import threading
import socket
from pathlib import Path
from functools import wraps
from datetime import datetime

from flask import Flask, render_template, request, jsonify, redirect, url_for, session, send_file, Response
from flask_socketio import SocketIO, emit
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
import sqlite3

# Configuration
BASE_DIR = Path(__file__).parent.absolute()
AUTH_FILE = BASE_DIR / "auth" / "config.json"
CERTS_DIR = BASE_DIR / "certs"
ALLOWED_EXTENSIONS = {'txt', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'zip', 'tar', 'gz', 'py', 'js', 'html', 'css', 'json', 'xml', 'yaml', 'yml', 'md', 'sh', 'conf', 'cfg', 'log'}

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)
socketio = SocketIO(app, cors_allowed_origins="*")
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# Database setup
def get_db():
    db = sqlite3.connect(BASE_DIR / "auth" / "users.db")
    db.row_factory = sqlite3.Row
    return db

def init_db():
    auth_dir = BASE_DIR / "auth"
    auth_dir.mkdir(exist_ok=True)
    
    db = get_db()
    db.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    db.commit()
    db.close()

# Load or generate secure path
def get_secure_path():
    config_file = AUTH_FILE
    if config_file.exists():
        with open(config_file, 'r') as f:
            config = json.load(f)
            return config.get('secure_path', 'dashboard')
    else:
        secure_path = secrets.token_urlsafe(16)
        config = {
            'secure_path': secure_path,
            'created_at': datetime.now().isoformat(),
            'port': 50011
        }
        with open(config_file, 'w') as f:
            json.dump(config, f, indent=2)
        return secure_path

SECURE_PATH = get_secure_path()

# User class
class User(UserMixin):
    def __init__(self, id, username):
        self.id = id
        self.username = username

@login_manager.user_loader
def load_user(user_id):
    db = get_db()
    user = db.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
    db.close()
    if user:
        return User(user['id'], user['username'])
    return None

# Auth check decorator
def check_first_run():
    db = get_db()
    user_count = db.execute('SELECT COUNT(*) FROM users').fetchone()[0]
    db.close()
    return user_count == 0

# Routes
@app.route('/')
def index():
    if check_first_run():
        return redirect(url_for('register'))
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))

@app.route('/register', methods=['GET', 'POST'])
def register():
    if not check_first_run():
        return redirect(url_for('login'))
    
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        
        if not username or not password:
            return render_template('register.html', error='Введите логин и пароль')
        
        if len(password) < 6:
            return render_template('register.html', error='Пароль должен быть не менее 6 символов')
        
        db = get_db()
        try:
            password_hash = generate_password_hash(password)
            db.execute('INSERT INTO users (username, password_hash) VALUES (?, ?)', 
                      (username, password_hash))
            db.commit()
            db.close()
            return redirect(url_for('login'))
        except sqlite3.IntegrityError:
            db.close()
            return render_template('register.html', error='Пользователь уже существует')
    
    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if check_first_run():
        return redirect(url_for('register'))
    
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        
        db = get_db()
        user = db.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
        db.close()
        
        if user and check_password_hash(user['password_hash'], password):
            user_obj = User(user['id'], user['username'])
            login_user(user_obj, remember=True)
            return redirect(url_for('dashboard'))
        else:
            return render_template('login.html', error='Неверный логин или пароль')
    
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route(f'/{SECURE_PATH}')
@login_required
def dashboard():
    return render_template('dashboard.html', secure_path=SECURE_PATH)

# File Manager API
@app.route(f'/{SECURE_PATH}/api/files', methods=['GET'])
@login_required
def list_files():
    path = request.args.get('path', '/')
    if path == '/':
        full_path = '/'
    else:
        full_path = os.path.normpath(path)
        if not full_path.startswith('/'):
            full_path = '/' + full_path
    
    try:
        if not os.path.exists(full_path):
            return jsonify({'error': 'Путь не существует'}), 404
        
        items = []
        for item in os.listdir(full_path):
            item_path = os.path.join(full_path, item)
            try:
                stat = os.stat(item_path)
                items.append({
                    'name': item,
                    'path': item_path,
                    'is_dir': os.path.isdir(item_path),
                    'size': stat.st_size if os.path.isfile(item_path) else 0,
                    'modified': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    'permissions': oct(stat.st_mode)[-3:]
                })
            except (PermissionError, OSError):
                items.append({
                    'name': item,
                    'path': item_path,
                    'is_dir': os.path.isdir(item_path),
                    'size': 0,
                    'modified': 'N/A',
                    'permissions': '---'
                })
        
        # Sort: directories first, then files
        items.sort(key=lambda x: (not x['is_dir'], x['name'].lower()))
        
        return jsonify({
            'current_path': full_path,
            'parent_path': os.path.dirname(full_path) if full_path != '/' else None,
            'items': items
        })
    except PermissionError:
        return jsonify({'error': 'Нет доступа'}), 403
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route(f'/{SECURE_PATH}/api/files/download', methods=['GET'])
@login_required
def download_file():
    file_path = request.args.get('path', '')
    
    if not file_path or not os.path.isfile(file_path):
        return jsonify({'error': 'Файл не найден'}), 404
    
    try:
        return send_file(file_path, as_attachment=True)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route(f'/{SECURE_PATH}/api/files/upload', methods=['POST'])
@login_required
def upload_file():
    upload_path = request.form.get('path', '/')
    
    if 'file' not in request.files:
        return jsonify({'error': 'Нет файла'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Файл не выбран'}), 400
    
    try:
        filename = secure_filename(file.filename)
        full_path = os.path.join(upload_path, filename)
        file.save(full_path)
        return jsonify({'success': True, 'path': full_path})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route(f'/{SECURE_PATH}/api/files/create_dir', methods=['POST'])
@login_required
def create_directory():
    path = request.form.get('path', '')
    name = request.form.get('name', '')
    
    if not path or not name:
        return jsonify({'error': 'Не указан путь или имя'}), 400
    
    try:
        new_path = os.path.join(path, secure_filename(name))
        os.makedirs(new_path, exist_ok=True)
        return jsonify({'success': True, 'path': new_path})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route(f'/{SECURE_PATH}/api/files/delete', methods=['POST'])
@login_required
def delete_file():
    path = request.form.get('path', '')
    
    if not path or not os.path.exists(path):
        return jsonify({'error': 'Путь не существует'}), 404
    
    try:
        if os.path.isfile(path):
            os.remove(path)
        elif os.path.isdir(path):
            os.rmdir(path)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route(f'/{SECURE_PATH}/api/files/read', methods=['GET'])
@login_required
def read_file():
    file_path = request.args.get('path', '')
    
    if not file_path or not os.path.isfile(file_path):
        return jsonify({'error': 'Файл не найден'}), 404
    
    # Check file size (max 10MB for viewing)
    if os.path.getsize(file_path) > 10 * 1024 * 1024:
        return jsonify({'error': 'Файл слишком большой для просмотра'}), 400
    
    try:
        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
        return jsonify({'content': content, 'path': file_path})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route(f'/{SECURE_PATH}/api/files/save', methods=['POST'])
@login_required
def save_file():
    file_path = request.form.get('path', '')
    content = request.form.get('content', '')
    
    if not file_path:
        return jsonify({'error': 'Не указан путь'}), 400
    
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route(f'/{SECURE_PATH}/api/files/rename', methods=['POST'])
@login_required
def rename_file():
    old_path = request.form.get('path', '')
    new_name = request.form.get('new_name', '')
    
    if not old_path or not new_name:
        return jsonify({'error': 'Не указаны параметры'}), 400
    
    try:
        new_path = os.path.join(os.path.dirname(old_path), secure_filename(new_name))
        os.rename(old_path, new_path)
        return jsonify({'success': True, 'new_path': new_path})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# System Info API
@app.route(f'/{SECURE_PATH}/api/system/info', methods=['GET'])
@login_required
def system_info():
    try:
        # CPU
        cpu_usage = 0
        try:
            with open('/proc/stat', 'r') as f:
                line = f.readline()
                parts = line.split()
                cpu_usage = round(100 * (float(parts[4]) / float(sum([float(x) for x in parts[1:]]))), 1)
        except:
            cpu_usage = 0
        
        # Memory
        mem_info = {}
        try:
            with open('/proc/meminfo', 'r') as f:
                for line in f:
                    parts = line.split(':')
                    if parts[0] in ['MemTotal', 'MemFree', 'MemAvailable', 'Buffers', 'Cached']:
                        mem_info[parts[0]] = int(parts[1].strip().split()[0])
            
            mem_total = mem_info.get('MemTotal', 0)
            mem_available = mem_info.get('MemAvailable', mem_info.get('MemFree', 0) + mem_info.get('Buffers', 0) + mem_info.get('Cached', 0))
            mem_usage = round(100 * (mem_total - mem_available) / mem_total, 1) if mem_total > 0 else 0
        except:
            mem_usage = 0
            mem_total = 0
        
        # Disk
        disk_usage = 0
        try:
            stat = os.statvfs('/')
            disk_total = stat.f_blocks * stat.f_frsize
            disk_free = stat.f_bavail * stat.f_frsize
            disk_usage = round(100 * (disk_total - disk_free) / disk_total, 1)
        except:
            disk_usage = 0
            disk_total = 0
        
        # Uptime
        uptime = 0
        try:
            with open('/proc/uptime', 'r') as f:
                uptime = int(float(f.readline().split()[0]))
        except:
            uptime = 0
        
        # OS Info
        os_info = "Debian GNU/Linux"
        try:
            with open('/etc/os-release', 'r') as f:
                for line in f:
                    if line.startswith('PRETTY_NAME='):
                        os_info = line.split('=')[1].strip().strip('"')
                        break
        except:
            pass
        
        return jsonify({
            'cpu_usage': cpu_usage,
            'memory_usage': mem_usage,
            'memory_total_mb': round(mem_total / 1024, 0) if mem_total else 0,
            'disk_usage': disk_usage,
            'uptime_seconds': uptime,
            'os_info': os_info,
            'hostname': socket.gethostname()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# WebSocket Terminal
@socketio.on('connect')
def handle_connect():
    if not current_user.is_authenticated:
        return False

@socketio.on('terminal_input')
def handle_terminal_input(data):
    if not current_user.is_authenticated:
        return
    
    # Store terminal session in app context
    session_id = request.sid
    
    if not hasattr(app, 'terminal_sessions'):
        app.terminal_sessions = {}
    
    if session_id not in app.terminal_sessions:
        # Start new terminal session
        try:
            process = subprocess.Popen(
                ['/bin/bash'],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1
            )
            app.terminal_sessions[session_id] = process
            
            # Start reader thread
            def read_output():
                while session_id in app.terminal_sessions:
                    try:
                        output = process.stdout.read(1)
                        if output:
                            socketio.emit('terminal_output', {'data': output}, room=session_id)
                    except:
                        break
            
            reader_thread = threading.Thread(target=read_output, daemon=True)
            reader_thread.start()
        except Exception as e:
            emit('terminal_output', {'data': f'Error: {e}\r\n'})
            return
    
    # Send input to process
    process = app.terminal_sessions[session_id]
    try:
        process.stdin.write(data['data'])
        process.stdin.flush()
    except Exception as e:
        emit('terminal_output', {'data': f'\r\nError: {e}\r\n'})

@socketio.on('disconnect')
def handle_disconnect():
    session_id = request.sid
    if hasattr(app, 'terminal_sessions') and session_id in app.terminal_sessions:
        try:
            app.terminal_sessions[session_id].terminate()
        except:
            pass
        del app.terminal_sessions[session_id]

# Process commands API (alternative to WebSocket)
@app.route(f'/{SECURE_PATH}/api/command', methods=['POST'])
@login_required
def execute_command():
    command = request.form.get('command', '')
    
    if not command:
        return jsonify({'error': 'Нет команды'}), 400
    
    # Security: limit dangerous commands
    dangerous = ['rm -rf /', 'mkfs', 'dd if=/dev/zero', ':(){:|:&};:', 'chmod -R 777 /']
    for d in dangerous:
        if d in command:
            return jsonify({'error': 'Опасная команда запрещена'}), 403
    
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=30,
            cwd=request.form.get('cwd', '/root')
        )
        return jsonify({
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returncode': result.returncode
        })
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Таймаут выполнения (30с)'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    init_db()
    print(f"\n{'='*50}")
    print(f"VPS Dashboard - Remnawave Style")
    print(f"{'='*50}")
    print(f"Secure Path: /{SECURE_PATH}")
    print(f"Port: 50011")
    print(f"{'='*50}\n")
    
    # Run with SSL in production, HTTP for dev
    ssl_context = None
    cert_file = CERTS_DIR / 'fullchain.pem'
    key_file = CERTS_DIR / 'privkey.pem'
    
    if cert_file.exists() and key_file.exists():
        ssl_context = (str(cert_file), str(key_file))
        print("SSL: Включен")
    else:
        print("SSL: Выключен (нет сертификатов)")
    
    socketio.run(app, host='0.0.0.0', port=50011, ssl_context=ssl_context, debug=False)
