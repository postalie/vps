#!/bin/bash
#
# VPS Dashboard - Installation Script
# Remnawave Style
# Debian 11+
#
# Usage: curl -sSL <url> | bash
#    or: wget -qO- <url> | bash
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="VPS Dashboard"
APP_DIR="/opt/vps-dashboard"
SERVICE_NAME="vps-dashboard"
PORT=50011
PYTHON_VERSION="3.11"

# Logging
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "Этот скрипт должен быть запущен от root"
        exit 1
    fi
}

# Check OS
check_os() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
        
        if [[ "$OS" != "debian" && "$OS" != "ubuntu" ]]; then
            log_warning "Рекомендуется Debian 11+ или Ubuntu 20.04+"
            log_warning "Текущая ОС: $OS $VERSION"
        fi
    else
        log_warning "Не удалось определить ОС"
    fi
}

# Update system
update_system() {
    log_info "Обновление пакетов..."
    apt-get update -qq
    apt-get upgrade -y -qq
    log_success "Система обновлена"
}

# Install dependencies
install_dependencies() {
    log_info "Установка зависимостей..."
    
    apt-get install -y -qq \
        python3 \
        python3-pip \
        python3-venv \
        python3-dev \
        nginx \
        certbot \
        python3-certbot-nginx \
        curl \
        wget \
        git \
        sqlite3 \
        supervisor
    
    log_success "Зависимости установлены"
}

# Create app directory and download files
create_app_directory() {
    log_info "Создание директории приложения..."

    mkdir -p "$APP_DIR"
    cd "$APP_DIR"

    # Download app files from GitHub
    log_info "Скачивание файлов приложения..."

    GITHUB_RAW="https://raw.githubusercontent.com/postalie/vps/main"

    # Download main files
    curl -sSL "$GITHUB_RAW/app.py" -o app.py
    curl -sSL "$GITHUB_RAW/requirements.txt" -o requirements.txt

    # Create directories
    mkdir -p static/css static/js templates auth certs

    # Download templates
    curl -sSL "$GITHUB_RAW/templates/base.html" -o templates/base.html
    curl -sSL "$GITHUB_RAW/templates/register.html" -o templates/register.html
    curl -sSL "$GITHUB_RAW/templates/login.html" -o templates/login.html
    curl -sSL "$GITHUB_RAW/templates/dashboard.html" -o templates/dashboard.html

    # Download static files
    curl -sSL "$GITHUB_RAW/static/css/style.css" -o static/css/style.css
    curl -sSL "$GITHUB_RAW/static/js/dashboard.js" -o static/js/dashboard.js

    log_success "Файлы загружены"
    log_success "Директория создана: $APP_DIR"
}

# Setup Python virtual environment
setup_python() {
    log_info "Настройка Python окружения..."

    # Create venv
    python3 -m venv venv
    source venv/bin/activate

    # Upgrade pip
    pip install --upgrade pip -q

    # Install Flask and dependencies
    pip install -q \
        flask \
        flask-socketio \
        flask-login \
        flask-cors \
        python-socketio \
        python-engineio \
        eventlet \
        gunicorn \
        werkzeug

    log_success "Python окружение настроено"
}

# Initialize database
init_database() {
    log_info "Инициализация базы данных..."
    
    cd "$APP_DIR"
    source venv/bin/activate
    
    python3 -c "
import sqlite3
from pathlib import Path

db_path = Path('auth/users.db')
db_path.parent.mkdir(exist_ok=True)

conn = sqlite3.connect(db_path)
conn.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
''')
conn.commit()
conn.close()
"
    
    log_success "База данных создана"
}

# Get VPS IP
get_vps_ip() {
    # Try multiple methods to get public IP
    IP=$(curl -s -4 ifconfig.me 2>/dev/null || \
         curl -s -4 icanhazip.com 2>/dev/null || \
         curl -s -4 api.ipify.org 2>/dev/null || \
         hostname -I | awk '{print $1}')
    
    if [[ -z "$IP" ]]; then
        log_error "Не удалось получить IP адрес сервера"
        exit 1
    fi
    
    log_info "IP адрес VPS: $IP"
    echo "$IP"
}

# Setup SSL with Let's Encrypt
setup_ssl() {
    log_info "Настройка SSL сертификата..."
    
    # Get domain or use IP
    echo ""
    log_info "Для SSL сертификата Let's Encrypt требуется доменное имя."
    echo "   Если у вас есть домен, введите его (например: dashboard.example.com)"
    echo "   Если домена нет, нажмите Enter для использования самоподписанного сертификата"
    read -p "Домен (или Enter для самоподписанного): " DOMAIN
    
    if [[ -n "$DOMAIN" ]]; then
        # Use Let's Encrypt
        log_info "Получение сертификата Let's Encrypt для $DOMAIN..."
        
        # Stop nginx temporarily
        systemctl stop nginx 2>/dev/null || true
        
        # Get certificate
        if certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos --email admin@"$DOMAIN" 2>/dev/null; then
            log_success "SSL сертификат получен"
            
            # Create symlinks for app
            mkdir -p "$APP_DIR/certs"
            ln -sf "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$APP_DIR/certs/fullchain.pem"
            ln -sf "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$APP_DIR/certs/privkey.pem"
            
            echo "$DOMAIN" > "$APP_DIR/certs/domain"
            USE_LETSENCRYPT=true
        else
            log_warning "Не удалось получить сертификат Let's Encrypt"
            log_info "Используем самоподписанный сертификат..."
            USE_LETSENCRYPT=false
        fi
    else
        log_info "Генерация самоподписанного сертификата..."
        USE_LETSENCRYPT=false
    fi
    
    if [[ "$USE_LETSENCRYPT" == "false" ]]; then
        # Generate self-signed certificate
        mkdir -p "$APP_DIR/certs"
        
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "$APP_DIR/certs/privkey.pem" \
            -out "$APP_DIR/certs/fullchain.pem" \
            -subj "/C=RU/ST=Moscow/L=Moscow/O=VPS Dashboard/CN=vps" \
            -addext "subjectAltName=IP:$VPS_IP"
        
        log_success "Самоподписанный сертификат создан"
        log_warning "Браузер будет показывать предупреждение о безопасности"
    fi
    
    # Set permissions
    chmod 600 "$APP_DIR/certs/privkey.pem"
    chmod 644 "$APP_DIR/certs/fullchain.pem"
}

# Configure nginx
configure_nginx() {
    log_info "Настройка nginx..."
    
    # Download nginx config from GitHub
    curl -sSL "$GITHUB_RAW/nginx.conf" -o /etc/nginx/sites-available/vps-dashboard
    
    # Enable site
    ln -sf /etc/nginx/sites-available/vps-dashboard /etc/nginx/sites-enabled/vps-dashboard
    rm -f /etc/nginx/sites-enabled/default
    
    # Test and reload nginx
    nginx -t
    systemctl restart nginx
    
    log_success "nginx настроен"
}

# Create systemd service
create_systemd_service() {
    log_info "Создание systemd сервиса..."
    
    cat > /etc/systemd/system/$SERVICE_NAME.service << EOF
[Unit]
Description=$APP_NAME
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
Environment="PATH=$APP_DIR/venv/bin"
ExecStart=$APP_DIR/venv/bin/gunicorn --worker-class eventlet --workers 1 --bind 127.0.0.1:50010 app:app
Restart=always
RestartSec=5

# Security
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
    
    # Reload systemd and start service
    systemctl daemon-reload
    systemctl enable $SERVICE_NAME
    systemctl start $SERVICE_NAME
    
    log_success "Systemd сервис создан и запущен"
}

# Configure firewall
configure_firewall() {
    log_info "Настройка брандмауэра..."
    
    # Check if ufw is available
    if command -v ufw &> /dev/null; then
        ufw allow 22/tcp comment "SSH"
        ufw allow 80/tcp comment "HTTP"
        ufw allow $PORT/tcp comment "VPS Dashboard HTTPS"
        
        if ! ufw status | grep -q "Status: active"; then
            log_warning "UFW не активен. Рекомендуется включить: ufw enable"
        fi
    fi
    
    # Check if firewalld is available
    if command -v firewall-cmd &> /dev/null; then
        firewall-cmd --permanent --add-port=22/tcp
        firewall-cmd --permanent --add-port=80/tcp
        firewall-cmd --permanent --add-port=$PORT/tcp
        firewall-cmd --reload
    fi
    
    log_success "Брандмауэр настроен"
}

# Generate secure path and save config
generate_config() {
    log_info "Генерация конфигурации..."
    
    mkdir -p "$APP_DIR/auth"
    
    # Generate secure path
    SECURE_PATH=$(openssl rand -hex 16)
    
    # Save config
    cat > "$APP_DIR/auth/config.json" << EOF
{
    "secure_path": "$SECURE_PATH",
    "created_at": "$(date -Iseconds)",
    "port": $PORT,
    "version": "1.0.0"
}
EOF
    
    chmod 600 "$APP_DIR/auth/config.json"
    
    log_success "Конфигурация создана"
    
    # Store for display
    DASHBOARD_URL="https://$VPS_IP:$PORT/$SECURE_PATH"
    if [[ "$USE_LETSENCRYPT" == "true" && -n "$DOMAIN" ]]; then
        DASHBOARD_URL="https://$DOMAIN:$PORT/$SECURE_PATH"
    fi
}

# Display installation summary
display_summary() {
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║${NC}          ${BLUE}$APP_NAME - Установка завершена${NC}           ${GREEN}║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${YELLOW}URL панели управления:${NC}"
    echo -e "  ${BLUE}${DASHBOARD_URL}${NC}"
    echo ""
    echo -e "  ${YELLOW}Порт:${NC} $PORT"
    echo -e "  ${YELLOW}Директория:${NC} $APP_DIR"
    echo ""

    if [[ "$USE_LETSENCRYPT" == "true" && -n "$DOMAIN" ]]; then
        echo -e "  ${GREEN}✓ SSL: Let's Encrypt ($DOMAIN)${NC}"
        echo -e "  ${GREEN}✓ URL: https://$DOMAIN:$PORT/$SECURE_PATH${NC}"
    else
        echo -e "  ${YELLOW}! SSL: Самоподписанный сертификат${NC}"
        echo -e "    ${YELLOW}URL: https://$VPS_IP:$PORT/$SECURE_PATH${NC}"
        echo -e "    Браузер покажет предупреждение - нажмите \"Продолжить\""
    fi

    echo ""
    echo -e "  ${BLUE}Следующие шаги:${NC}"
    echo "    1. Откройте URL панели управления в браузере"
    echo "    2. Зарегистрируйте учётную запись (первый вход)"
    echo "    3. Используйте панель для управления сервером"
    echo ""
    echo -e "  ${BLUE}Управление сервисом:${NC}"
    echo "    systemctl status $SERVICE_NAME    # Статус"
    echo "    systemctl restart $SERVICE_NAME   # Перезапуск"
    echo "    systemctl stop $SERVICE_NAME      # Остановка"
    echo ""

    # Save URL to file for reference
    echo "$DASHBOARD_URL" > "$APP_DIR/dashboard.url"
    echo "$DASHBOARD_URL" > "$APP_DIR/auth/url.txt"

    log_success "URL сохранён в: $APP_DIR/dashboard.url"
    log_success "URL сохранён в: $APP_DIR/auth/url.txt"
}

# Main installation
main() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}           ${GREEN}$APP_NAME - Установка${NC}                    ${BLUE}║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    check_root
    check_os
    
    # Get VPS IP early
    VPS_IP=$(get_vps_ip)
    
    update_system
    install_dependencies
    create_app_directory
    setup_python
    init_database
    generate_config
    setup_ssl
    configure_nginx
    create_systemd_service
    configure_firewall

    display_summary
    
    echo -e "${GREEN}Установка завершена успешно!${NC}"
}

# Run installation
main "$@"
