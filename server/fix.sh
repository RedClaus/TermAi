#!/bin/bash

# TermAi Client Configuration Fixer
# This script ensures the frontend is configured to talk to the backend on port 3004

echo "🔧 Configuring TermAi Client..."

# 1. Create/Update .env.local to force the correct API URL
# Vite automatically loads .env.local and it overrides .env
echo "VITE_API_URL=http://localhost:3004" > .env.local
echo "VITE_WS_URL=http://localhost:3004" >> .env.local

echo "✅ Created .env.local with correct port (3004)"

# 2. Check node dependencies
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo "🚀 Starting Frontend..."
echo "   The app will open at http://localhost:5173"
echo "   It is configured to talk to the server at http://localhost:3004"
echo ""

# 3. Start the dev server
npm run dev
