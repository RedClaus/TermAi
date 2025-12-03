# TermAI Enhanced Startup Guide

This guide covers the enhanced startup options available for the TermAI application, including the new `startup.sh` script with additional features.

## 🚀 Quick Start Options

### Option 1: Enhanced Script (Recommended)
```bash
chmod +x startup.sh
./startup.sh
```

### Option 2: Original Script
```bash
chmod +x start.sh
./start.sh
```

### Option 3: Docker
```bash
docker-compose up -d
```

## 📋 Enhanced Script Features

The new `startup.sh` script provides comprehensive functionality:

### Core Features
- ✅ **Colorful Output**: Better visual feedback with emojis and colors
- ✅ **Environment Setup**: Automatic `.env` file creation from template
- ✅ **Health Checks**: Service health monitoring with curl
- ✅ **Process Management**: Better PID tracking and cleanup
- ✅ **Port Conflict Detection**: Warns about port usage conflicts
- ✅ **Logging Support**: View application logs easily
- ✅ **Clean Installation**: Remove and reinstall dependencies
- ✅ **Service Control**: Start, stop, restart services

### Command Line Options

| Command | Description |
|---------|-------------|
| `./startup.sh` | Default: Install deps and start services |
| `./startup.sh --help` | Show help message |
| `./startup.sh --install-only` | Install dependencies only |
| `./startup.sh --skip-install` | Skip installation, start services |
| `./startup.sh --check-health` | Check if services are running |
| `./startup.sh --stop` | Stop running services |
| `./startup.sh --restart` | Restart services |
| `./startup.sh --logs` | Show application logs |
| `./startup.sh --setup-env` | Create .env file from template |
| `./startup.sh --clean` | Clean install (remove node_modules) |
| `./startup.sh --dev` | Start in development mode (default) |
| `./startup.sh --prod` | Start in production mode |

### Environment Variables

You can customize ports using environment variables:

```bash
export TERMAI_FRONTEND_PORT=8080
export TERMAI_BACKEND_PORT=8001
./startup.sh
```

## 🐳 Docker Deployment

### Development
```bash
# Build and start
docker-compose up --build

# Start in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Production
```bash
# Build production image
docker build -t termai:latest .

# Run container
docker run -d \
  --name termai \
  -p 5173:5173 \
  -p 3001:3001 \
  -v $(pwd)/.env:/app/.env:ro \
  termai:latest
```

## 🛠️ System Service (Optional)

To run TermAI as a system service:

```bash
# Copy service file
sudo cp termai.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable and start service
sudo systemctl enable termai
sudo systemctl start termai

# Check status
sudo systemctl status termai

# View logs
sudo journalctl -u termai -f
```

## 🔧 Configuration

### Environment Setup
The script automatically creates a `.env` file from `.env.example` if it doesn't exist:

```bash
# Create environment file
./startup.sh --setup-env

# Edit configuration
nano .env
```

### Port Configuration
Default ports:
- **Frontend**: 5173
- **Backend**: 3001

Change ports by setting environment variables or editing `.env`:
```bash
VITE_API_URL=http://localhost:3001
VITE_WS_URL=http://localhost:3001
```

## 📊 Monitoring and Logs

### Health Checks
```bash
# Check service status
./startup.sh --check-health

# Manual health check
curl http://localhost:5173  # Frontend
curl http://localhost:3001/health  # Backend (if health endpoint exists)
```

### View Logs
```bash
# Show all logs
./startup.sh --logs

# Follow logs in real-time (Docker)
docker-compose logs -f

# System service logs
sudo journalctl -u termai -f
```

## 🔥 Troubleshooting

### Common Issues

**Port already in use:**
```bash
# Check what's using the port
lsof -ti:5173
lsof -ti:3001

# Kill processes using the ports
./startup.sh --stop
```

**Dependencies issues:**
```bash
# Clean installation
./startup.sh --clean

# Manual cleanup
rm -rf node_modules server/node_modules
rm package-lock.json server/package-lock.json
npm install
cd server && npm install
```

**Permission denied:**
```bash
chmod +x startup.sh
```

**Node.js version:**
```bash
# Check Node version
node --version

# Should be >= v18.0.0
```

### Advanced Debugging

**Enable debug mode:**
```bash
# Set debug environment
export DEBUG=termai:*
./startup.sh
```

**Check service processes:**
```bash
# Find TermAI processes
ps aux | grep -E "(node|vite)" | grep -v grep

# Check port usage
netstat -tulpn | grep -E ":(5173|3001)"
```

## 🔄 Migration from Original Script

If you're using the original `start.sh`:

1. **Backup your current setup:**
   ```bash
   cp start.sh start_backup.sh
   ```

2. **Use the enhanced script:**
   ```bash
   chmod +x startup.sh
   ./startup.sh
   ```

3. **Both scripts are compatible** and can be used interchangeably.

## 📝 Development Workflow

### Daily Development
```bash
# Start development
./startup.sh

# Make changes to code...

# Restart after major changes
./startup.sh --restart

# Check if everything is running
./startup.sh --check-health
```

### Deployment Preparation
```bash
# Clean build
./startup.sh --clean

# Test production mode
./startup.sh --prod

# Build Docker image
docker build -t termai:latest .
```

### Maintenance
```bash
# Update dependencies
./startup.sh --stop
npm update
cd server && npm update
./startup.sh

# View recent logs
./startup.sh --logs

# System service maintenance
sudo systemctl restart termai
sudo journalctl -u termai --since "1 hour ago"
```

## 🎯 Performance Tips

1. **Use production mode** for better performance:
   ```bash
   ./startup.sh --prod
   ```

2. **Enable gzip compression** in your reverse proxy (nginx, apache)

3. **Use PM2 for production** (alternative to systemd):
   ```bash
   npm install -g pm2
   pm2 start npm --name "termai" -- run dev:all
   pm2 startup
   pm2 save
   ```

4. **Monitor resource usage**:
   ```bash
   # Check memory and CPU usage
   ps aux | grep -E "(node|vite)" | grep -v grep
   
   # Docker stats
   docker stats termai
   ```

## 🤝 Contributing

When contributing to the startup scripts:

1. Test all command-line options
2. Ensure compatibility with both Linux and macOS
3. Update this documentation
4. Test Docker builds
5. Verify systemd service functionality

## 📄 Files Overview

| File | Purpose |
|------|---------|
| `startup.sh` | Enhanced startup script with full features |
| `start.sh` | Original startup script (still supported) |
| `termai.service` | Systemd service configuration |
| `Dockerfile` | Container build configuration |
| `docker-compose.yml` | Container orchestration |
| `STARTUP_ENHANCED.md` | This documentation |

---

For more information, visit the [TermAI GitHub repository](https://github.com/RedClaus/TermAi).
