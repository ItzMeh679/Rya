#!/bin/bash
# Quick restart script
echo "Stopping bot..."
pkill -f "node bot.js" 2>/dev/null

echo "Clearing Node.js cache..."
# Node.js will automatically clear require cache on restart

echo "Starting bot..."
npm start
