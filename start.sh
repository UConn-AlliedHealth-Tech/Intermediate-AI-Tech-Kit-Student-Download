#!/bin/bash
# Medical AI Learning Lab - Quick Start Script

echo "========================================="
echo "Medical AI Learning Lab - Quick Start"
echo "========================================="
echo ""

# Check prerequisites
echo "Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js from https://nodejs.org/"
    exit 1
fi
echo "✓ Node.js $(node --version)"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found. Please install npm"
    exit 1
fi
echo "✓ npm $(npm --version)"

# Check Kaggle CLI
if ! command -v kaggle &> /dev/null; then
    echo "⚠️  Kaggle CLI not found. Installing..."
    pip install kaggle || pip3 install kaggle
    if ! command -v kaggle &> /dev/null; then
        echo "❌ Failed to install Kaggle CLI. Please run: pip install kaggle"
        exit 1
    fi
fi
echo "✓ Kaggle CLI installed"

echo ""
echo "Installing backend dependencies..."
npm install

echo ""
echo "========================================="
echo "Starting backend server..."
echo "========================================="
node server.js &

# Wait for server to boot
sleep 2

# Open browser
echo "Opening browser at http://localhost:3001 ..."
open http://localhost:3001 2>/dev/null || xdg-open http://localhost:3001
