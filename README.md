# VPS Dashboard

**Современная панель управления VPS в стиле docs.rw (Remnawave)**

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Python](https://img.shields.io/badge/python-3.8+-green)
![Debian](https://img.shields.io/badge/debian-11+-orange)
![License](https://img.shields.io/badge/license-MIT-green)

## Особенности

- 🔐 **Безопасность**: Уникальный secure path для каждого сервера
- 📁 **Файловый менеджер**: Загрузка, выгрузка, редактирование файлов
- 💻 **Веб-терминал**: Полный доступ к консоли через браузер
- 📊 **Мониторинг**: CPU, память, диск, uptime в реальном времени
- 🔒 **SSL**: Автоматическая настройка Let's Encrypt или самоподписанный сертификат
- 🎨 **Современный UI**: Тёмная тема в стиле docs.rw
- 🚀 **One-command install**: Одна команда для полной установки

## Быстрый старт

### Установка на VPS (Debian 11+)

```bash
# Скачайте и запустите скрипт установки
curl -sSL https://raw.githubusercontent.com/yourusername/vps-dashboard/main/install.sh | sudo bash

# Или через wget
wget -qO- https://raw.githubusercontent.com/yourusername/vps-dashboard/main/install.sh | sudo bash
```

### После установки

1. Скрипт покажет URL панели управления вида:
   ```
   https://<IP_VPS>:50011/<уникальный_путь>
   ```

2. Откройте URL в браузере

3. При первом входе зарегистрируйте учётную запись

4. Готово! Используйте панель для управления сервером

## Структура проекта

```
vps_dashboard/
├── app.py                 # Основное приложение Flask
├── install.sh             # Скрипт установки
├── requirements.txt       # Python зависимости
├── static/
│   ├── css/
│   │   └── style.css     # Стили в стиле docs.rw
│   └── js/
│       └── dashboard.js  # Клиентский JavaScript
├── templates/
│   ├── base.html         # Базовый шаблон
│   ├── register.html     # Страница регистрации
│   ├── login.html        # Страница входа
│   └── dashboard.html    # Основная панель
├── auth/
│   ├── config.json       # Конфигурация (secure path)
│   └── users.db          # База данных пользователей
└── certs/
    ├── fullchain.pem     # SSL сертификат
    └── privkey.pem       # SSL ключ
```

## Функционал

### Обзор системы
- Потребление CPU в реальном времени
- Использование оперативной памяти
- Заполненность диска
- Uptime сервера
- Информация об ОС

### Файловый менеджер
- Просмотр файлов и папок
- Загрузка файлов на ПК
- Загрузка файлов на сервер
- Создание папок
- Редактирование файлов
- Удаление файлов и папок
- Отображение прав доступа

### Веб-терминал
- Полноценный доступ к bash
- Поддержка WebSocket для реального времени
- Автосохранение истории сессии
- Очистка терминала

## API

### Файлы
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/{secure_path}/api/files?path=/` | Список файлов |
| GET | `/{secure_path}/api/files/download?path=` | Скачать файл |
| POST | `/{secure_path}/api/files/upload` | Загрузить файл |
| POST | `/{secure_path}/api/files/create_dir` | Создать папку |
| POST | `/{secure_path}/api/files/delete` | Удалить файл/папку |
| GET | `/{secure_path}/api/files/read?path=` | Читать файл |
| POST | `/{secure_path}/api/files/save` | Сохранить файл |
| POST | `/{secure_path}/api/files/rename` | Переименовать |

### Система
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/{secure_path}/api/system/info` | Информация о системе |
| POST | `/{secure_path}/api/command` | Выполнить команду |

## Управление сервисом

```bash
# Статус
sudo systemctl status vps-dashboard

# Перезапуск
sudo systemctl restart vps-dashboard

# Остановка
sudo systemctl stop vps-dashboard

# Запуск
sudo systemctl start vps-dashboard

# Логи
sudo journalctl -u vps-dashboard -f
```

## Конфигурация nginx

Порт 50011 (HTTPS) проксирует на внутренний порт 50010 (Flask + Gunicorn).

Конфигурация находится в `/etc/nginx/sites-available/vps-dashboard`

## Безопасность

- Secure path генерируется при установке (128 бит энтропии)
- Пароли хешируются через Werkzeug (PBKDF2)
- Сессионные куки с HttpOnly и Secure флагами
- Защита от опасных команд в терминале
- Ограничение на размер файлов для просмотра (10MB)

## Требования

- Debian 11+ или Ubuntu 20.04+
- Python 3.8+
- nginx
- 256MB+ RAM
- 1GB+ свободного места на диске

## Обновление

```bash
cd /opt/vps-dashboard
sudo systemctl stop vps-dashboard

# Обновить файлы
git pull origin main  # или скопируйте новые файлы

# Обновить зависимости
source venv/bin/activate
pip install -r requirements.txt --upgrade

# Запустить
sudo systemctl start vps-dashboard
```

## Удаление

```bash
sudo systemctl stop vps-dashboard
sudo systemctl disable vps-dashboard
sudo rm -rf /opt/vps-dashboard
sudo rm /etc/systemd/system/vps-dashboard.service
sudo rm /etc/nginx/sites-available/vps-dashboard
sudo rm /etc/nginx/sites-enabled/vps-dashboard
sudo systemctl daemon-reload
sudo systemctl restart nginx
```

## Технологии

- **Backend**: Flask, Flask-SocketIO, Flask-Login
- **Frontend**: Vanilla JS, CSS3
- **WebSocket**: Socket.IO
- **Database**: SQLite
- **Web Server**: nginx + Gunicorn + Eventlet
- **SSL**: Let's Encrypt / OpenSSL

## Лицензия

MIT License - см. файл LICENSE

## Поддержка

При возникновении проблем:
1. Проверьте логи: `journalctl -u vps-dashboard -f`
2. Убедитесь, что порт 50011 открыт в фаерволе
3. Проверьте статус nginx: `systemctl status nginx`

---

**VPS Dashboard** - Просто. Стильно. Безопасно.
