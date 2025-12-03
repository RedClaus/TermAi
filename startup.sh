#!/bin/bash

# TermAI Enhanced Startup Script
# Enhanced version with additional features for better development experience

set -e  # Exit on any error

# Script version
VERSION="2.0"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
FRONTEND_PORT=5173
BACKEND_PORT=3001
LOG_DIR="./server/logs"
PID_FILE="/tmp/termai.pid"

# Function to print colored output
print_header() {
    echo -e "\n${PURPLE}╔═══════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${PURPLE}║                            🤖 TermAI Startup v$VERSION 🚀                            ║${NC}"
    echo -e "${PURPLE}╚═══════════════════════════════════════════════════════════════════════════════╝${NC}\n"
}

print_status() {
    echo -e "${BLUE}[TermAI]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[TermAI]${NC} ✅ $1"
}

print_warning() {
    echo -e "${YELLOW}[TermAI]${NC} ⚠️  $1"
}

print_error() {
    echo -e "${RED}[TermAI]${NC} ❌ $1"
}

print_info() {
    echo -e "${CYAN}[TermAI]${NC} ℹ️  $1"
}

# Function to show help
show_help() {
    echo -e "${CYAN}Usage: $0 [OPTIONS]${NC}"
    echo ""
    echo "Options:"
    echo "  --help              Show this help message"
    echo "  --install-only      Install dependencies only, don't start services"
    echo "  --skip-install      Skip dependency installation, start services only"
    echo "  --check-health      Check if services are running"
    echo "  --stop              Stop running services"
    echo "  --restart           Restart services"
    echo "  --logs              Show logs from both services"
    echo "  --setup-env         Create .env file from template"
    echo "  --clean             Clean node_modules and reinstall"
    echo "  --dev               Start in development mode (default)"
    echo "  --prod              Start in production mode"
    echo ""
    echo "Environment Variables:"
    echo "  TERMAI_FRONTEND_PORT  Frontend port (default: 5173)"
    echo "  TERMAI_BACKEND_PORT   Backend port (default: 3001)"
    echo ""
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if port is in use
check_port() {
    local port=$1
    if command_exists lsof; then
        if lsof -ti:$port >/dev/null 2>&1; then
            return 0  # Port is in use
        else
            return 1  # Port is free
        fi
    else
        # Fallback method using netstat
        if command_exists netstat; then
            if netstat -an | grep ":$port " >/dev/null 2>&1; then
                return 0  # Port is in use
            else
                return 1  # Port is free
            fi
        fi
    fi
    return 1  # Assume port is free if we can't check
}

# Function to check Node.js version
check_node_version() {
    if command_exists node; then
        NODE_VERSION=$(node -v | sed 's/v//')
        NODE_MAJOR=$(echo $NODE_VERSION | cut -d. -f1)
        if [ "$NODE_MAJOR" -lt 18 ]; then
            print_error "Node.js version 18 or higher is required. Current version: v$NODE_VERSION"
            print_info "Please update Node.js: https://nodejs.org/"
            exit 1
        else
            print_success "Node.js version: v$NODE_VERSION"
        fi
    else
        print_error "Node.js is not installed. Please install Node.js 18 or higher."
        print_info "Download from: https://nodejs.org/"
        exit 1
    fi
}

# Function to check npm
check_npm() {
    if command_exists npm; then
        NPM_VERSION=$(npm -v)
        print_success "npm version: v$NPM_VERSION"
    else
        print_error "npm is not installed. Please install npm."
        exit 1
    fi
}

# Function to setup environment file
setup_env() {
    print_status "Setting up environment configuration..."
    
    if [ ! -f .env ]; then
        if [ -f .env.example ]; then
            cp .env.example .env
            print_success "Created .env file from template"
            print_info "Please edit .env file with your configuration"
            
            # Update ports in .env if different from default
            if [ "$FRONTEND_PORT" != "5173" ]; then
                sed -i.bak "s/:5173/:$FRONTEND_PORT/g" .env
                print_info "Updated frontend port to $FRONTEND_PORT in .env"
            fi
            if [ "$BACKEND_PORT" != "3001" ]; then
                sed -i.bak "s/:3001/:$BACKEND_PORT/g" .env
                print_info "Updated backend port to $BACKEND_PORT in .env"
            fi
        else
            print_warning ".env.example not found, creating basic .env file"
            cat > .env << ENV_EOF
# TermAI Environment Configuration
VITE_API_URL=http://localhost:$BACKEND_PORT
VITE_WS_URL=http://localhost:$BACKEND_PORT
VITE_DEFAULT_PROVIDER=gemini
VITE_DEFAULT_OLLAMA_ENDPOINT=http://localhost:11434
ENV_EOF
            print_success "Created basic .env file"
        fi
    else
        print_success ".env file already exists"
    fi
}

# Function to install dependencies
install_dependencies() {
    print_status "Checking and installing dependencies..."
    
    # Install frontend dependencies
    if [ ! -d "node_modules" ]; then
        print_status "Installing frontend dependencies..."
        npm install
        print_success "Frontend dependencies installed"
    else
        print_success "Frontend dependencies already installed"
    fi
    
    # Install backend dependencies
    if [ ! -d "server/node_modules" ]; then
        print_status "Installing backend dependencies..."
        cd server
        npm install
        cd ..
        print_success "Backend dependencies installed"
    else
        print_success "Backend dependencies already installed"
    fi
}

# Function to check service health
check_health() {
    print_status "Checking service health..."
    
    # Check frontend
    if curl -s http://localhost:$FRONTEND_PORT >/dev/null 2>&1; then
        print_success "Frontend is running on http://localhost:$FRONTEND_PORT"
    else
        print_error "Frontend is not responding on port $FRONTEND_PORT"
    fi
    
    # Check backend
    if curl -s http://localhost:$BACKEND_PORT/health >/dev/null 2>&1; then
        print_success "Backend is running on http://localhost:$BACKEND_PORT"
    elif check_port $BACKEND_PORT; then
        print_warning "Backend port $BACKEND_PORT is in use but health check failed"
    else
        print_error "Backend is not running on port $BACKEND_PORT"
    fi
}

# Function to stop services
stop_services() {
    print_status "Stopping TermAI services..."
    
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p $PID > /dev/null 2>&1; then
            kill $PID
            print_success "Stopped services (PID: $PID)"
            rm -f "$PID_FILE"
        else
            print_warning "PID file exists but process not found"
            rm -f "$PID_FILE"
        fi
    fi
    
    # Fallback: kill by port
    if check_port $FRONTEND_PORT; then
        pkill -f "vite" 2>/dev/null || true
        print_info "Stopped frontend processes"
    fi
    
    if check_port $BACKEND_PORT; then
        pkill -f "node.*index.js" 2>/dev/null || true
        print_info "Stopped backend processes"
    fi
}

# Function to show logs
show_logs() {
    print_status "Showing logs..."
    
    if [ -d "$LOG_DIR" ]; then
        echo -e "\n${CYAN}=== Backend Logs ===${NC}"
        find "$LOG_DIR" -name "*.log" -type f -exec tail -20 {} \; 2>/dev/null || print_warning "No backend logs found"
    fi
    
    # Show npm logs if they exist
    if [ -f "npm-debug.log" ]; then
        echo -e "\n${CYAN}=== NPM Debug Log ===${NC}"
        tail -20 npm-debug.log
    fi
}

# Function to clean installation
clean_install() {
    print_status "Cleaning installation..."
    
    print_status "Removing node_modules directories..."
    rm -rf node_modules server/node_modules
    
    print_status "Removing package-lock files..."
    rm -f package-lock.json server/package-lock.json
    
    print_status "Reinstalling dependencies..."
    install_dependencies
    
    print_success "Clean installation completed"
}

# Function to check port conflicts
check_port_conflicts() {
    print_status "Checking port availability..."
    
    if check_port $FRONTEND_PORT; then
        print_warning "Port $FRONTEND_PORT (frontend) is already in use"
        if command_exists lsof; then
            PROCESS=$(lsof -ti:$FRONTEND_PORT)
            print_info "Process using port $FRONTEND_PORT: $PROCESS"
        fi
    else
        print_success "Port $FRONTEND_PORT (frontend) is available"
    fi
    
    if check_port $BACKEND_PORT; then
        print_warning "Port $BACKEND_PORT (backend) is already in use"
        if command_exists lsof; then
            PROCESS=$(lsof -ti:$BACKEND_PORT)
            print_info "Process using port $BACKEND_PORT: $PROCESS"
        fi
    else
        print_success "Port $BACKEND_PORT (backend) is available"
    fi
}

# Function to start services
start_services() {
    local mode=${1:-dev}
    
    print_status "Starting TermAI in $mode mode..."
    
    # Create log directory
    mkdir -p "$LOG_DIR"
    
    # Start services based on mode
    if [ "$mode" = "dev" ]; then
        npm run dev:all &
    else
        # Production mode
        print_status "Building for production..."
        npm run build
        npm run preview &
        npm run dev:server &
    fi
    
    # Save main PID
    echo $! > "$PID_FILE"
    
    print_success "Services started!"
    print_info "Frontend: http://localhost:$FRONTEND_PORT"
    print_info "Backend: http://localhost:$BACKEND_PORT"
    
    # Wait a moment and check if services are starting
    sleep 3
    check_health
}

# Function to handle script termination
cleanup() {
    print_warning "Shutting down TermAI..."
    stop_services
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Main script logic
main() {
    # Parse environment variables
    FRONTEND_PORT=${TERMAI_FRONTEND_PORT:-$FRONTEND_PORT}
    BACKEND_PORT=${TERMAI_BACKEND_PORT:-$BACKEND_PORT}
    
    case "${1:-}" in
        --help|-h)
            print_header
            show_help
            exit 0
            ;;
        --setup-env)
            print_header
            setup_env
            exit 0
            ;;
        --install-only)
            print_header
            check_node_version
            check_npm
            setup_env
            install_dependencies
            print_success "Installation completed! Run './startup.sh' to start the application."
            exit 0
            ;;
        --skip-install)
            print_header
            check_node_version
            check_npm
            check_port_conflicts
            start_services
            ;;
        --check-health)
            print_header
            check_health
            exit 0
            ;;
        --stop)
            print_header
            stop_services
            exit 0
            ;;
        --restart)
            print_header
            stop_services
            sleep 2
            check_node_version
            check_npm
            check_port_conflicts
            start_services
            ;;
        --logs)
            print_header
            show_logs
            exit 0
            ;;
        --clean)
            print_header
            clean_install
            exit 0
            ;;
        --dev)
            print_header
            check_node_version
            check_npm
            setup_env
            install_dependencies
            check_port_conflicts
            start_services "dev"
            ;;
        --prod)
            print_header
            check_node_version
            check_npm
            setup_env
            install_dependencies
            check_port_conflicts
            start_services "prod"
            ;;
        "")
            # Default behavior
            print_header
            check_node_version
            check_npm
            setup_env
            install_dependencies
            check_port_conflicts
            start_services
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
    
    # Keep script running if services were started
    if [ -f "$PID_FILE" ]; then
        print_info "Press Ctrl+C to stop all services"
        wait
    fi
}

# Run main function
main "$@"
