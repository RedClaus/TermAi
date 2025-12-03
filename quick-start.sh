#!/bin/bash

# TermAI Quick Start Script
# One-command setup for new users

set -e

echo "🤖 TermAI Quick Start Setup 🚀"
echo "==============================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -f "startup.sh" ]; then
    echo "❌ Please run this script from the TermAI project directory"
    echo "   Make sure you have package.json and startup.sh in the current directory"
    exit 1
fi

echo "📋 This script will:"
echo "   1. Make scripts executable"
echo "   2. Setup environment file"
echo "   3. Install dependencies"
echo "   4. Start the application"
echo ""

read -p "Continue? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 1
fi

echo ""
echo "🔧 Making scripts executable..."
chmod +x startup.sh
chmod +x start.sh 2>/dev/null || true

echo "🚀 Starting TermAI setup..."
./startup.sh --setup-env
./startup.sh --install-only

echo ""
echo "✅ Setup complete!"
echo ""
echo "🎯 Next steps:"
echo "   1. Edit .env file with your API keys if needed"
echo "   2. Start the application: ./startup.sh"
echo "   3. Open http://localhost:5173 in your browser"
echo ""
echo "💡 Useful commands:"
echo "   ./startup.sh --help    - Show all options"
echo "   ./startup.sh --stop    - Stop services"
echo "   ./startup.sh --restart - Restart services"
echo "   make help              - Show Makefile commands"
echo ""

read -p "Would you like to start the application now? (Y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    echo "🚀 Starting TermAI..."
    ./startup.sh
else
    echo "💡 Run './startup.sh' when you're ready to start the application"
fi
