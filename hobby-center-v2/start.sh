#!/bin/bash
echo ""
echo "Installing dependencies..."
cd server && npm install && cd ..

echo ""
echo "Building frontend..."
cd frontend && npm install && npm run build && cd ..

echo ""
echo "Copying frontend build to server..."
cp -r frontend/dist server/public

echo ""
echo "Starting The Hobby Center..."
cd server && node index.js
