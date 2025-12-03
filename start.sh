#!/bin/bash

# TermAI Startup Script
# This script handles installation of dependencies and starts both frontend and backend services

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[TermAI]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[TermAI]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[TermAI]${NC} $1"
}

print_error() {
    echo -e "${RED}[TermAI]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check Node.js version
check_node_version() {
    if command_exists node; then
        NODE_VERSION=$(node -v | sed 's/v//')
        NODE_MAJOR=$(echo $NODE_VERSION | cut -d. -f1)
        if [ "$NODE_MAJOR" -lt 18 ]; then
            print_error "Node.js version 18 or higher is required. Current version: v$NODE_VERSION"
            print_status "Please update Node.js: https://nodejs.org/"
            exit 1
        else
            print_success "Node.js version: v$NODE_VERSION ✓"
        fi
    else
        print_error "Node.js is not installed. Please install Node.js 18 or higher."
        print_status "Visit: https://nodejs.org/"
        exit 1
    fi
}

# Function to check if npm exists
check_npm() {
    if command_exists npm; then
        NPM_VERSION=$(npm -v)
        print_success "npm version: $NPM_VERSION ✓"
    else
        print_error "npm is not installed. Please install npm."
        exit 1
    fi
}

# Function to install dependencies
install_dependencies() {
    print_status "Installing dependencies..."
    
    # Check if frontend node_modules exists
    if [ ! -d "node_modules" ]; then
        print_status "Installing frontend dependencies..."
        npm install
        print_success "Frontend dependencies installed ✓"
    else
        print_warning "Frontend dependencies already installed, skipping..."
    fi
    
    # Check if server node_modules exists
    if [ ! -d "server/node_modules" ]; then
        print_status "Installing backend dependencies..."
        cd server
        npm install
        cd ..
        print_success "Backend dependencies installed ✓"
    else
        print_warning "Backend dependencies already installed, skipping..."
    fi
}

# Function to check if ports are available and kill existing processes
check_ports() {
    print_status "Checking if ports are available..."
    
    # Check and kill processes on port 3003 (backend)
    if lsof -Pi :3003 -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_warning "Port 3003 is already in use. Killing existing process..."
        kill -9 $(lsof -Pi :3003 -sTCP:LISTEN -t) 2>/dev/null || true
        sleep 1
        print_success "Cleared port 3003 ✓"
    fi
    
    # Check and kill processes on port 5173 (frontend)
    if lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_warning "Port 5173 is already in use. Killing existing process..."
        kill -9 $(lsof -Pi :5173 -sTCP:LISTEN -t) 2>/dev/null || true
        sleep 1
        print_success "Cleared port 5173 ✓"
    fi
    
    # Also kill any lingering node processes related to TermAi
    pkill -f "node.*TermAi" 2>/dev/null || true
}

# Function to start the application
start_app() {
    print_status "Starting TermAI application..."
    print_status "Frontend will be available at: http://localhost:5173"
    print_status "Backend will be available at: http://localhost:3003"
    print_status ""
    print_status "Press Ctrl+C to stop both services"
    print_status ""
    
    # Use npm script to run both services concurrently
    npm run dev:all
}

# Main execution
main() {
    clear
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════╗"
    echo "║              TermAI Startup Script           ║"
    echo "║          AI-Powered Terminal Assistant       ║"
    echo "╚══════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    print_status "Starting TermAI setup and launch process..."
    
    # Pre-flight checks
    print_status "Running pre-flight checks..."
    check_node_version
    check_npm
    check_ports
    
    # Handle command line arguments
    case "${1:-}" in
        --install-only)
            print_status "Install-only mode requested"
            install_dependencies
            print_success "Dependencies installed successfully!"
            print_status "Run './start.sh' to start the application"
            exit 0
            ;;
        --skip-install)
            print_status "Skipping dependency installation"
            ;;
        *)
            install_dependencies
            ;;
    esac
    
    # Start the application
    start_app
}

# Handle script interruption
trap 'echo -e "\n${YELLOW}[TermAI]${NC} Shutting down..."; exit 130' INT

# Run main function with all arguments
main "$@"