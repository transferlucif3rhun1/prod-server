#!/bin/bash

# API Key Manager Frontend Setup Script
# Creates complete frontend folder structure with empty files

set -e  # Exit on any error

echo "🚀 Setting up API Key Manager Frontend structure..."

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p frontend/src/{components,hooks,services,styles,types,utils}
mkdir -p frontend/public

# Function to create empty file only if it doesn't exist
create_empty_file() {
    local file_path="$1"
    
    if [ ! -f "$file_path" ]; then
        echo "✅ Creating $file_path"
        touch "$file_path"
    else
        echo "⏭️  Skipping $file_path (already exists)"
    fi
}

echo "📄 Creating configuration files..."
# Root config files
create_empty_file "frontend/package.json"
create_empty_file "frontend/vite.config.ts"
create_empty_file "frontend/tailwind.config.js"
create_empty_file "frontend/postcss.config.js"
create_empty_file "frontend/tsconfig.json"
create_empty_file "frontend/tsconfig.node.json"
create_empty_file "frontend/index.html"
create_empty_file "frontend/.gitignore"
create_empty_file "frontend/.env.example"
create_empty_file "frontend/README.md"

echo "📄 Creating source files..."
# Main app files
create_empty_file "frontend/src/main.tsx"
create_empty_file "frontend/src/App.tsx"

# Components
create_empty_file "frontend/src/components/Layout.tsx"
create_empty_file "frontend/src/components/Login.tsx"
create_empty_file "frontend/src/components/CreateKey.tsx"
create_empty_file "frontend/src/components/ManageKeys.tsx"
create_empty_file "frontend/src/components/Logs.tsx"

# Hooks
create_empty_file "frontend/src/hooks/useAuth.ts"
create_empty_file "frontend/src/hooks/useWebSocket.ts"

# Services
create_empty_file "frontend/src/services/api.ts"

# Styles
create_empty_file "frontend/src/styles/globals.css"

# Types
create_empty_file "frontend/src/types/index.ts"

# Utils
create_empty_file "frontend/src/utils/index.ts"

# Public assets
create_empty_file "frontend/public/vite.svg"

echo ""
echo "✨ Frontend structure created successfully!"
echo ""
echo "📁 Created structure:"
echo "frontend/"
echo "├── src/"
echo "│   ├── components/ (5 files)"
echo "│   ├── hooks/ (2 files)"
echo "│   ├── services/ (1 file)"
echo "│   ├── styles/ (1 file)"
echo "│   ├── types/ (1 file)"
echo "│   ├── utils/ (1 file)"
echo "│   ├── App.tsx"
echo "│   └── main.tsx"
echo "├── public/"
echo "│   └── vite.svg"
echo "└── 10 config files"
echo ""
echo "🔥 Next steps:"
echo "1. Copy content into the empty files"
echo "2. cd frontend && npm install"
echo "3. npm run build"
echo "4. Run your Go server!"