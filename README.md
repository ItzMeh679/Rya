# Rya Music Bot

A feature-rich Discord music bot with Lavalink, Spotify integration, and Supabase stats tracking.

## Features
- 🎵 Music playback (YouTube, Spotify, SoundCloud)
- 📊 Personal listening stats and leaderboards
- 🎛️ Audio effects (nightcore, bass boost, 8D, etc.)
- 🎤 Lyrics search
- ⚙️ Custom prefix per server

## Commands
All commands use `/r` prefix:
- `/r play <song>` - Play music
- `/r skip` - Skip current track
- `/r queue` - View queue
- `/r mystats` - Your listening stats
- `/r leaderboard` - Server leaderboard
- `/r help` - All commands

## Deployment
See deployment guide for Railway hosting.

## Tech Stack
- Node.js + Discord.js
- Lavalink (music streaming)
- Supabase (stats storage)
- Spotify API (track metadata)
