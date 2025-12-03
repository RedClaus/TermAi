# TermAI Makefile
.PHONY: help install start stop restart clean health logs setup docker-up docker-down

# Default target
help:
	@echo "TermAI Development Commands"
	@echo "=========================="
	@echo ""
	@echo "Basic Commands:"
	@echo "  make install     - Install dependencies"
	@echo "  make start       - Start development servers"
	@echo "  make stop        - Stop running servers"
	@echo "  make restart     - Restart servers"
	@echo "  make health      - Check service health"
	@echo "  make logs        - Show application logs"
	@echo ""
	@echo "Setup Commands:"
	@echo "  make setup       - Setup environment file"
	@echo "  make clean       - Clean install (remove node_modules)"
	@echo ""
	@echo "Docker Commands:"
	@echo "  make docker-up   - Start with Docker Compose"
	@echo "  make docker-down - Stop Docker containers"
	@echo "  make docker-logs - View Docker logs"
	@echo ""
	@echo "Production:"
	@echo "  make prod        - Start in production mode"
	@echo "  make build       - Build for production"

# Installation
install:
	@./startup.sh --install-only

# Development
start:
	@./startup.sh

stop:
	@./startup.sh --stop

restart:
	@./startup.sh --restart

# Health and monitoring
health:
	@./startup.sh --check-health

logs:
	@./startup.sh --logs

# Setup
setup:
	@./startup.sh --setup-env

clean:
	@./startup.sh --clean

# Production
prod:
	@./startup.sh --prod

build:
	@npm run build

# Docker
docker-up:
	@docker-compose up -d

docker-down:
	@docker-compose down

docker-logs:
	@docker-compose logs -f

docker-build:
	@docker-compose up --build -d

# Testing
test:
	@npm test

lint:
	@npm run lint

# Quick development workflow
dev: setup install start

# Full reset
reset: stop clean install start

# Status check
status: health
	@echo ""
	@echo "Process Status:"
	@ps aux | grep -E "(node|vite)" | grep -v grep || echo "No TermAI processes found"
	@echo ""
	@echo "Port Usage:"
	@lsof -i :5173 -i :3001 2>/dev/null || echo "Ports 5173 and 3001 are free"
