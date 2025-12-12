# Lavalink Setup Guide for Rya Music Bot

This bot now uses **Lavalink** for audio processing, which is the industry standard for Discord music bots.

## Prerequisites
- **Java 17+** installed and in PATH (Verified: ✅)

## Starting the Bot

### Step 1: Start Lavalink Server
Open a **new terminal** and run:
```bash
cd lavalink
start-lavalink.bat
```
Wait until you see `Lavalink is ready to accept connections`.

### Step 2: Start the Bot
In your main terminal:
```bash
npm start
```

## Configuration (.env)
Make sure your `.env` has these Lavalink settings:
```
LAVALINK_HOST=localhost:2333
LAVALINK_PASSWORD=ryabot2024
```

## Troubleshooting

### "Lavalink is not connected"
- Ensure the Lavalink server is running (Step 1 above)
- Check that the password in `.env` matches `application.yml`

### "No tracks found"
- Lavalink handles YouTube directly; no cookies needed
- Try a different search term

### Audio is glitchy
- Increase `bufferDurationMs` in `lavalink/application.yml`
- Ensure good network connection

## Files Changed
- `bot.js` - Initializes LavalinkClient
- `src/structures/LavalinkClient.js` - Kazagumo wrapper
- `src/commands/music.js` - Uses Lavalink for playback
- `lavalink/` - Lavalink server files

## What's Next?
The interaction handler refactoring (`interactionCreate.js` split) is still pending.
You can use the bot now with `/play` commands.
