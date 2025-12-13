// src/structures/LavalinkClient.js - Shoukaku/Kazagumo wrapper for Discord.js
const { Kazagumo, Plugins } = require('kazagumo');
const { Connectors } = require('shoukaku');
const config = require('../config/config.js');
const SpotifyHelper = require('../utils/spotifyHelper.js');
const YouTubeHelper = require('../utils/youtubeHelper.js');
const { RYA_EMOJIS, RYA_COLORS } = require('../config/emojiConfig.js');

/**
 * LavalinkClient - Manages connection to Lavalink nodes and provides audio functionality
 */
class LavalinkClient {
    constructor(client) {
        this.client = client;
        this.kazagumo = null;
        this.isReady = false;
        this.nodes = [];
    }

    /**
     * Initialize Kazagumo with Lavalink nodes
     */
    async initialize() {
        // Support both local and Railway/public Lavalink servers
        const isSecure = process.env.LAVALINK_SECURE === 'true';
        const host = process.env.LAVALINK_HOST || 'localhost';
        const port = process.env.LAVALINK_PORT || '2333';
        const password = process.env.LAVALINK_PASSWORD || 'youshallnotpass';

        // Build URL - always include port for public servers
        // Only Railway's own Lavalink (secure + .railway.app domain) skips port
        const isRailwayHosted = host.includes('.railway.app') && isSecure;
        const url = isRailwayHosted ? host : `${host}:${port}`;

        // Determine node name based on environment
        const nodeName = host.includes('localhost') ? 'Local' :
            host.includes('railway.app') ? 'Railway' : 'Public';

        this.nodes = [
            {
                name: nodeName,
                url: url,
                auth: password,
                secure: isSecure
            }
        ];

        console.log(`[LAVALINK] Config: host=${host}, port=${port}, secure=${isSecure}`);
        console.log(`[LAVALINK] Connecting to: ${isSecure ? 'wss' : 'ws'}://${url} (node=${nodeName})`);


        // Create Kazagumo instance with Spotify plugin
        this.kazagumo = new Kazagumo({
            defaultSearchEngine: 'youtube',
            // Use Spotify plugin for Spotify URLs
            plugins: [],
            send: (guildId, payload) => {
                const guild = this.client.guilds.cache.get(guildId);
                if (guild) guild.shard.send(payload);
            }
        }, new Connectors.DiscordJS(this.client), this.nodes, {
            resume: true,
            resumeTimeout: 30,
            resumeByLibrary: true,
            reconnectTries: 5,
            reconnectInterval: 5000,
            restTimeout: 60000,
            moveOnDisconnect: false,
            voiceConnectionTimeout: 30000
        });

        // Set up event handlers
        this.setupEventHandlers();

        console.log('[LAVALINK] Kazagumo client initialized');
        return this;
    }

    /**
     * Set up Kazagumo event handlers
     */
    setupEventHandlers() {
        // Shoukaku events (connection level)
        this.kazagumo.shoukaku.on('ready', (name) => {
            console.log(`[LAVALINK] Node ${name} is ready!`);
            this.isReady = true;
        });

        this.kazagumo.shoukaku.on('error', (name, error) => {
            console.error(`[LAVALINK] Node ${name} error:`, error);
        });

        this.kazagumo.shoukaku.on('close', (name, code, reason) => {
            console.warn(`[LAVALINK] Node ${name} closed: ${code} - ${reason}`);
            this.isReady = false;
        });

        this.kazagumo.shoukaku.on('disconnect', (name, players, moved) => {
            console.log(`[LAVALINK] Node ${name} disconnected. Players: ${players.length}, Moved: ${moved}`);
        });

        this.kazagumo.shoukaku.on('reconnecting', (name, reconnectsLeft, reconnectInterval) => {
            console.log(`[LAVALINK] Node ${name} reconnecting... (${reconnectsLeft} attempts left)`);
        });

        // Kazagumo events (player level)
        this.kazagumo.on('playerStart', (player, track) => {
            console.log(`[LAVALINK] Started playing: ${track.title}`);
            this.onTrackStart(player, track);

            // PROACTIVE AUTOPLAY: Check if we should add autoplay tracks
            // Trigger when queue has 1 or fewer tracks to ensure continuity
            try {
                if (player.data?.autoplay && player.queue.length <= 1) {
                    console.log(`[AUTOPLAY] Proactively adding track (queue: ${player.queue.length} remaining)`);
                    this.addAutoplayTrack(player, track).catch(err => {
                        console.warn('[AUTOPLAY] Proactive autoplay failed:', err.message);
                    });
                }
            } catch (err) {
                console.warn('[AUTOPLAY] Error checking autoplay condition:', err.message);
            }
        });


        this.kazagumo.on('playerEnd', (player) => {
            try {
                console.log(`[LAVALINK] Track ended for guild ${player.guildId}`);
                this.onTrackEnd(player);
            } catch (err) {
                console.error('[LAVALINK] Error in playerEnd handler:', err.message);
            }
        });

        this.kazagumo.on('playerEmpty', (player) => {
            try {
                console.log(`[LAVALINK] Queue empty for guild ${player.guildId}`);
                this.onQueueEmpty(player).catch(err => {
                    console.error('[LAVALINK] Error in onQueueEmpty:', err.message);
                });
            } catch (err) {
                console.error('[LAVALINK] Error in playerEmpty handler:', err.message);
            }
        });

        this.kazagumo.on('playerError', (player, error) => {
            try {
                console.error(`[LAVALINK] Player error for guild ${player.guildId}:`, error);
                this.onPlayerError(player, error).catch(err => {
                    console.error('[LAVALINK] Error in onPlayerError:', err.message);
                });
            } catch (err) {
                console.error('[LAVALINK] Error in playerError handler:', err.message);
            }
        });

        this.kazagumo.on('playerClosed', (player, data) => {
            try {
                console.log(`[LAVALINK] Player closed for guild ${player.guildId}`);
            } catch (err) {
                console.error('[LAVALINK] Error in playerClosed handler:', err.message);
            }
        });

        this.kazagumo.on('playerStuck', (player, data) => {
            try {
                console.warn(`[LAVALINK] Player stuck for guild ${player.guildId}, skipping...`);
                player.skip();
            } catch (err) {
                console.error('[LAVALINK] Error in playerStuck handler:', err.message);
            }
        });
    }


    /**
     * Create or get a player for a guild
     */
    async createPlayer(options) {
        const { guildId, textChannel, voiceChannel } = options;

        // Check if player already exists
        let player = this.kazagumo.players.get(guildId);

        if (player) {
            // Update channels if needed
            player.textId = textChannel.id;
            return player;
        }

        // Create new player
        player = await this.kazagumo.createPlayer({
            guildId: guildId,
            textId: textChannel.id,
            voiceId: voiceChannel.id,
            deaf: true,
            volume: config.music?.defaultVolume || 50
        });

        return player;
    }

    /**
     * Search for tracks (handles YouTube, Spotify, etc.)
     */
    async search(query, options = {}) {
        const { requester, source = 'youtube' } = options;

        try {
            // Handle Spotify URLs by converting to YouTube search
            if (this.isSpotifyUrl(query)) {
                console.log(`[LAVALINK] Detected Spotify URL: ${query}`);
                console.log(`[LAVALINK] Attempting to fetch Spotify data...`);

                let spotifyData;
                try {
                    spotifyData = await SpotifyHelper.getTrackInfo(query);
                    console.log(`[LAVALINK] Spotify data fetched successfully: type=${spotifyData?.type}, name=${spotifyData?.name}`);
                } catch (spotifyError) {
                    console.error(`[LAVALINK] Spotify fetch error:`, spotifyError.message);
                    throw new Error(`Spotify error: ${spotifyError.message}`);
                }

                if (spotifyData.type === 'playlist' || spotifyData.type === 'album') {
                    // Return multiple tracks for playlists/albums
                    const tracks = spotifyData.tracks || [];
                    console.log(`[LAVALINK] Processing Spotify ${spotifyData.type}: ${spotifyData.name} with ${tracks.length} tracks`);

                    const searchPromises = tracks.slice(0, 250).map(async (track) => {
                        const foundTrack = await this.findBestMatchingTrack(track, requester);
                        if (foundTrack) {
                            foundTrack.spotifyData = track;
                        }
                        return foundTrack;
                    });

                    const results = await Promise.all(searchPromises);
                    const validTracks = results.filter(t => t !== null);
                    console.log(`[LAVALINK] Found ${validTracks.length} tracks from Spotify ${spotifyData.type}`);

                    return {
                        type: 'PLAYLIST',
                        playlistName: spotifyData.name,
                        tracks: validTracks
                    };
                } else {
                    // Single track - need precise matching
                    console.log(`[LAVALINK] Searching for Spotify track: "${spotifyData.artist} - ${spotifyData.name}"`);

                    const foundTrack = await this.findBestMatchingTrack(spotifyData, requester);

                    if (foundTrack) {
                        foundTrack.spotifyData = spotifyData;
                        console.log(`[LAVALINK] Found matching track: ${foundTrack.title}`);
                        return {
                            type: 'TRACK',
                            tracks: [foundTrack]
                        };
                    }

                    // Fallback to regular search
                    console.log(`[LAVALINK] Precise match failed, using fallback search...`);
                    const result = await this.kazagumo.search(`${spotifyData.artist} ${spotifyData.name}`, { requester, engine: 'youtube' });
                    if (result.tracks && result.tracks.length > 0) {
                        result.tracks[0].spotifyData = spotifyData;
                    }
                    return result;
                }
            }

            // For URLs or regular searches
            // Try to load the URL/query first, then fallback to SoundCloud if it fails
            const isYouTubeUrl = query.includes('youtube.com') || query.includes('youtu.be');

            if (isYouTubeUrl) {
                console.log(`[LAVALINK] Detected YouTube URL: ${query}`);

                // Try to load YouTube URL directly first
                try {
                    const result = await this.kazagumo.search(query, { requester });

                    if (result?.tracks?.length > 0) {
                        console.log(`[LAVALINK] YouTube URL loaded successfully: ${result.tracks[0].title}`);
                        return result;
                    }
                } catch (ytError) {
                    console.warn(`[LAVALINK] YouTube URL failed: ${ytError.message}`);
                }

                // YouTube failed - extract video ID and search on SoundCloud
                console.log(`[LAVALINK] Falling back to SoundCloud search...`);

                // Try to get video info from YouTube to get the title
                const videoId = this.extractYouTubeVideoId(query);
                if (videoId) {
                    // Search YouTube for the title, then search that on SoundCloud
                    try {
                        const ytSearch = await this.kazagumo.search(`ytsearch:${videoId}`, { requester, engine: 'youtube' });
                        if (ytSearch?.tracks?.length > 0) {
                            const title = ytSearch.tracks[0].title;
                            const author = ytSearch.tracks[0].author;
                            console.log(`[LAVALINK] Found video title: "${title}" by ${author}`);

                            // Now search this on SoundCloud
                            const scResult = await this.kazagumo.search(`${author} ${title}`, { requester, engine: 'soundcloud' });
                            if (scResult?.tracks?.length > 0) {
                                console.log(`[LAVALINK] Found on SoundCloud: ${scResult.tracks[0].title}`);
                                return scResult;
                            }
                        }
                    } catch (e) {
                        console.warn(`[LAVALINK] Fallback search failed:`, e.message);
                    }
                }

                // Final fallback - return empty result
                console.log(`[LAVALINK] All fallbacks failed for YouTube URL`);
                return { type: 'SEARCH', tracks: [] };
            }

            // For regular text searches, use YouTube for full tracks (SoundCloud often returns previews)
            const result = await this.kazagumo.search(query, {
                requester,
                engine: this.isUrl(query) ? undefined : 'youtube'
            });

            console.log(`[LAVALINK] Search result for "${query}": type=${result?.type}, tracks=${result?.tracks?.length || 0}`);

            return result;

        } catch (error) {
            console.error('[LAVALINK] Search error:', error);
            throw error;
        }
    }

    /**
     * Extract YouTube video ID from URL
     */
    extractYouTubeVideoId(url) {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
            /^([a-zA-Z0-9_-]{11})$/  // Just the video ID
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        return null;
    }

    /**
     * Event handler: Track started playing
     */
    async onTrackStart(player, track) {
        try {
            const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const textChannel = this.client.channels.cache.get(player.textId);
            if (!textChannel) return;

            console.log(`[LAVALINK] Now playing: ${track.title}`);

            // Track this play in Supabase for stats
            try {
                const statsManager = require('../utils/statsManager.js');
                const userId = track.requester?.id || track.requester;
                const username = track.requester?.username || track.requester?.globalName;
                console.log(`[STATS] Attempting to track: userId=${userId}, username=${username}, track=${track.title}`);
                if (userId) {
                    const result = await statsManager.trackPlay(userId, player.guildId, track, username);
                    console.log(`[STATS] Track result: ${result ? 'SUCCESS' : 'FAILED'}`);
                } else {
                    console.warn('[STATS] No userId found for track requester');
                }
            } catch (statsError) {
                console.error('[STATS] Tracking error:', statsError);
            }

            // Get loop mode display
            const loopDisplay = player.loop === 'track' ? 'Track' : player.loop === 'queue' ? 'Queue' : 'Off';

            // Send now playing message with action buttons
            const embed = {
                color: RYA_COLORS?.MUSIC || 0x6366F1,
                author: {
                    name: `🎵 Now Playing`,
                    icon_url: this.client.user.displayAvatarURL()
                },
                title: track.title,
                url: track.uri,
                description: `**by** ${track.author}\n**Duration:** \`${this.formatDuration(track.length)}\``,
                thumbnail: { url: track.thumbnail },
                image: { url: track.thumbnail },
                fields: [
                    {
                        name: '🔊 Volume',
                        value: `\`${player.volume}%\``,
                        inline: true
                    },
                    {
                        name: '📑 Queue',
                        value: `\`${player.queue.length} tracks\``,
                        inline: true
                    },
                    {
                        name: '🔁 Loop',
                        value: `\`${loopDisplay}\``,
                        inline: true
                    }
                ],
                footer: {
                    text: `Requested by ${track.requester?.username || track.requester?.globalName || 'Unknown'} • Rya Music (Lavalink)`,
                    icon_url: track.requester?.displayAvatarURL?.() || track.requester?.avatarURL || undefined
                },
                timestamp: new Date().toISOString()
            };

            // Helper function to safely create emoji - uses custom if available, fallback otherwise
            const safeEmoji = (customId, customName, fallback) => {
                try {
                    // Check if bot has access to the emoji
                    const emoji = this.client.emojis.cache.get(customId);
                    if (emoji) {
                        return { id: customId, name: customName };
                    }
                } catch (e) { }
                return fallback;
            };

            // Create action buttons - Row 1: Playback controls
            const row1 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('music_previous')
                        .setEmoji(safeEmoji('1412039878744608909', 'Ryaprevious', '⏮️'))
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('music_pause')
                        .setEmoji(player.paused ? safeEmoji('1412037694221058058', 'Ryaplay', '▶️') : safeEmoji('1412037507935240235', 'Ryapause', '⏸️'))
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('music_skip')
                        .setEmoji(safeEmoji('1412037603556986921', 'Ryaskip', '⏭️'))
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('music_stop')
                        .setEmoji(safeEmoji('1412037767352815696', 'Ryastop', '⏹️'))
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('music_shuffle')
                        .setEmoji(safeEmoji('1412037787582206062', 'Ryashuffle', '🔀'))
                        .setStyle(ButtonStyle.Secondary)
                );

            // Row 2: Queue and info controls
            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('music_loop')
                        .setEmoji(safeEmoji('1412036841783296131', 'Ryaloop', '🔁'))
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('music_queue')
                        .setEmoji(safeEmoji('1412037265353609286', 'Ryaqueue', '📑'))
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('music_lyrics')
                        .setEmoji(safeEmoji('1412037852551708772', 'Ryalyrics', '📝'))
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('music_voldown')
                        .setEmoji(safeEmoji('1449360491896897578', 'volDown', '🔉'))
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('music_volup')
                        .setEmoji(safeEmoji('1449360526957215827', 'volUp', '🔊'))
                        .setStyle(ButtonStyle.Secondary)
                );

            // Row 3: Additional features
            const row3 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('music_autoplay')
                        .setEmoji(safeEmoji('1412037745240707215', 'Ryaautoplay', '🎲'))
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('music_equalizer')
                        .setEmoji(safeEmoji('1449318106534121493', 'equilizer', '🎚️'))
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('music_effects')
                        .setEmoji(safeEmoji('1412388390602674326', 'Ryaeffects', '🎛️'))
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('music_history')
                        .setEmoji(safeEmoji('1412037449110261780', 'Ryahistory', '🕐'))
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('music_stats')
                        .setEmoji(safeEmoji('1412037427044024400', 'Ryastats', 'ℹ️'))
                        .setStyle(ButtonStyle.Secondary)
                );

            await textChannel.send({ embeds: [embed], components: [row1, row2, row3] });
            console.log('[LAVALINK] Now Playing embed sent successfully');
        } catch (error) {
            console.error('[LAVALINK] Error sending now playing message:', error);
        }
    }

    /**
     * Event handler: Track ended
     */
    async onTrackEnd(player) {
        // The queue is automatically handled by Kazagumo
        // This is just for logging or custom behavior
    }

    /**
     * Event handler: Queue is empty
     */
    async onQueueEmpty(player) {
        try {
            const textChannel = this.client.channels.cache.get(player.textId);

            // AUTOPLAY BACKUP: If proactive autoplay missed, try now
            if (player.data?.autoplay && player.queue.current) {
                console.log('[AUTOPLAY] Queue empty backup - attempting to add track');
                try {
                    await this.addAutoplayTrack(player, player.queue.current);
                    // If autoplay succeeded and added tracks, don't schedule auto-leave yet
                    if (player.queue.length > 0) {
                        console.log('[AUTOPLAY] Backup succeeded, continuing playback');
                        return;
                    }
                } catch (err) {
                    console.warn('[AUTOPLAY] Backup autoplay failed:', err.message);
                }
            }

            // Auto-leave after timeout
            if (!textChannel) return;

            setTimeout(() => {
                try {
                    const currentPlayer = this.kazagumo?.players?.get(player.guildId);
                    if (currentPlayer && currentPlayer.queue.length === 0 && !currentPlayer.playing) {
                        currentPlayer.destroy();
                        textChannel.send({
                            content: '👋 Queue finished! Disconnecting due to inactivity.'
                        }).catch(() => { });
                    }
                } catch (err) {
                    console.warn('[LAVALINK] Error in auto-leave timeout:', err.message);
                }
            }, config.music?.autoLeaveTimeout || 300000);
        } catch (error) {
            console.error('[LAVALINK] Error in onQueueEmpty:', error);
        }
    }


    /**
     * Event handler: Player error
     */
    async onPlayerError(player, error) {
        const textChannel = this.client.channels.cache.get(player.textId);
        if (!textChannel) return;

        try {
            await textChannel.send({
                content: `❌ **Playback Error:** ${error.message || 'Unknown error'}. Skipping to next track...`
            });
        } catch (err) {
            console.warn('[LAVALINK] Could not send error message:', err.message);
        }

        // Try to skip to next track
        if (player.queue.length > 0) {
            player.skip();
        }
    }

    /**
     * Add an autoplay track using AI recommendations with multiple fallbacks
     * @param {Object} player - The Kazagumo player
     * @param {Object} currentTrack - The currently playing track
     */
    async addAutoplayTrack(player, currentTrack) {
        // Debounce mechanism - prevent multiple rapid calls
        const now = Date.now();
        if (!player.data) player.data = {};
        if (player.data.lastAutoplayTime && now - player.data.lastAutoplayTime < 5000) {
            console.log('[AUTOPLAY] Debounced - too soon since last autoplay');
            return;
        }
        player.data.lastAutoplayTime = now;

        // Track history to avoid duplicates
        if (!player.data.autoplayHistory) {
            player.data.autoplayHistory = [];
        }

        try {
            const textChannel = this.client.channels.cache.get(player.textId);

            // Build track info for recommendations
            const trackInfo = {
                title: currentTrack.title || currentTrack.spotifyData?.name || 'Unknown',
                artist: currentTrack.author || currentTrack.spotifyData?.artist || 'Unknown',
                genre: currentTrack.spotifyData?.genre || null
            };

            // Get AI recommendations with Supabase history for better personalization
            let recommendations = [];
            try {
                const recommendationsHelper = require('../utils/recommendationsHelper.js');
                // Get the user ID from the last real user (not autoplay)
                const requesterId = currentTrack.requester?.id !== 'autoplay'
                    ? currentTrack.requester?.id
                    : player.data.autoplayHistory?.find(t => t.requesterId)?.requesterId || null;

                recommendations = await recommendationsHelper.getRecommendations(
                    trackInfo,
                    player.data.autoplayHistory.slice(-5), // Last 5 played tracks
                    {
                        count: 3,
                        userId: requesterId  // Enable Supabase history for personalized autoplay
                    }
                );
                console.log(`[AUTOPLAY] Got ${recommendations?.length || 0} AI recommendations (userId: ${requesterId || 'none'})`);
            } catch (recError) {
                console.warn('[AUTOPLAY] AI recommendations failed:', recError.message);
                recommendations = [];
            }

            // Filter out tracks we've recently played
            const recentTitles = new Set(
                player.data.autoplayHistory.slice(-10).map(t =>
                    `${t.title || t.name}`.toLowerCase()
                )
            );
            recentTitles.add(currentTrack.title?.toLowerCase());

            recommendations = (recommendations || []).filter(rec =>
                !recentTitles.has((rec.title || rec.name || '').toLowerCase())
            );

            // Try each recommendation
            for (const rec of recommendations.slice(0, 3)) {
                try {
                    const query = rec.query || `${rec.artist} ${rec.title}`;
                    console.log(`[AUTOPLAY] Searching for: "${query}"`);

                    const result = await this.search(query, {
                        requester: {
                            id: 'autoplay',
                            username: 'Autoplay',
                            displayAvatarURL: () => null
                        }
                    });

                    if (result?.tracks?.length > 0) {
                        const track = result.tracks[0];
                        player.queue.add(track);

                        // Add to history
                        player.data.autoplayHistory.push({
                            title: track.title,
                            artist: track.author
                        });

                        // Keep history manageable
                        if (player.data.autoplayHistory.length > 50) {
                            player.data.autoplayHistory = player.data.autoplayHistory.slice(-30);
                        }

                        console.log(`[AUTOPLAY] Added: ${track.title} by ${track.author}`);

                        // Send notification
                        if (textChannel) {
                            textChannel.send({
                                content: `🎲 **Autoplay:** Added **${track.title}** by **${track.author}**\n*${rec.reason || 'Similar to current track'}*`
                            }).catch(() => { });
                        }

                        return; // Success!
                    }
                } catch (searchError) {
                    console.warn(`[AUTOPLAY] Failed to search "${rec.title}":`, searchError.message);
                    continue;
                }
            }

            // FALLBACK 1: Search for similar artist
            try {
                const artistSearch = `${trackInfo.artist} popular`;
                console.log(`[AUTOPLAY] Fallback: Searching artist "${artistSearch}"`);

                const result = await this.search(artistSearch, {
                    requester: { id: 'autoplay', username: 'Autoplay', displayAvatarURL: () => null }
                });

                if (result?.tracks?.length > 0) {
                    // Find a track we haven't played
                    const newTrack = result.tracks.find(t =>
                        !recentTitles.has(t.title?.toLowerCase())
                    ) || result.tracks[0];

                    player.queue.add(newTrack);
                    player.data.autoplayHistory.push({ title: newTrack.title, artist: newTrack.author });

                    console.log(`[AUTOPLAY] Fallback added: ${newTrack.title}`);
                    if (textChannel) {
                        textChannel.send({
                            content: `🎲 **Autoplay:** Added **${newTrack.title}** by **${newTrack.author}**\n*More from ${trackInfo.artist}*`
                        }).catch(() => { });
                    }
                    return;
                }
            } catch (fallbackError) {
                console.warn('[AUTOPLAY] Artist fallback failed:', fallbackError.message);
            }

            // FALLBACK 2: Popular tracks
            try {
                const popularQueries = [
                    'top hits 2024',
                    'popular songs',
                    'trending music'
                ];
                const randomQuery = popularQueries[Math.floor(Math.random() * popularQueries.length)];
                console.log(`[AUTOPLAY] Final fallback: "${randomQuery}"`);

                const result = await this.search(randomQuery, {
                    requester: { id: 'autoplay', username: 'Autoplay', displayAvatarURL: () => null }
                });

                if (result?.tracks?.length > 0) {
                    const track = result.tracks[Math.floor(Math.random() * Math.min(5, result.tracks.length))];
                    player.queue.add(track);
                    player.data.autoplayHistory.push({ title: track.title, artist: track.author });

                    console.log(`[AUTOPLAY] Popular fallback added: ${track.title}`);
                    if (textChannel) {
                        textChannel.send({
                            content: `🎲 **Autoplay:** Added **${track.title}** by **${track.author}**`
                        }).catch(() => { });
                    }
                    return;
                }
            } catch (popularError) {
                console.warn('[AUTOPLAY] Popular fallback failed:', popularError.message);
            }

            console.error('[AUTOPLAY] All autoplay attempts failed');

        } catch (error) {
            console.error('[AUTOPLAY] Critical error in addAutoplayTrack:', error);
            // Never throw - autoplay failure should not crash the bot
        }
    }

    /**
     * Find the best matching track for a Spotify song
     * Uses intelligent matching to avoid remixes, covers, and wrong versions
     */
    async findBestMatchingTrack(spotifyTrack, requester) {
        const { artist, name, durationMs } = spotifyTrack;
        const spotifyDuration = durationMs || spotifyTrack.duration;

        // Clean the song name for matching
        const cleanName = name
            .replace(/\s*\(.*?\)\s*/g, '') // Remove parenthetical content
            .replace(/\s*\[.*?\]\s*/g, '') // Remove bracketed content
            .replace(/\s*-\s*.*$/, '')     // Remove everything after dash
            .trim()
            .toLowerCase();

        // Original title words (for detecting extra words in results)
        const originalTitleWords = name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const artistWords = artist.toLowerCase().split(/[,&]/)[0].trim().split(/\s+/).filter(w => w.length > 2);


        // Words that indicate a remix/cover/wrong version - EXPANDED LIST
        const excludePatterns = [
            /\bslowed\b/i, /\breverb\b/i, /\bremix\b/i, /\bcover\b/i,
            /\bbootleg\b/i, /\bedit\b/i, /\bspeed\s*up\b/i, /\b8d\b/i,
            /\bbass\s*boost/i, /\bnightcore\b/i, /\bflipped\b/i,
            /\blofi\b/i, /\blo-fi\b/i, /\blo fi\b/i, // ADDED: lofi variations
            /\bmashup\b/i, /\bmash-up\b/i, /\bmix\b/i, // ADDED: mashup
            /\blyrics?\b/i, /\bkaraoke\b/i, /\binstrumental\b/i,
            /\bacoustic\b/i, /\bunplugged\b/i, /\blive\b/i,
            /\bextended\b/i, /\bshort\b/i, /\bfull\s*version\b/i,
            /\bslomo\b/i, /\bslow\s*motion\b/i, /\bpitched\b/i,
            /\bchill\b/i, /\btrap\b/i, /\bbeats?\b/i // ADDED: "chill trap beats" etc.
        ];

        // Build search queries
        const searchQueries = [
            `${artist.split(',')[0].trim()} ${name}`, // First artist + name
            `${name} ${artist.split(',')[0].trim()}`, // Reversed
        ];

        let allTracks = [];
        let hasYouTubeTracks = false;

        // YOUTUBE FIRST - More reliable for actual playback (SoundCloud often has 404 errors)
        console.log(`[LAVALINK] Searching YouTube first (more reliable)...`);
        const playDL = require('play-dl');
        const artistList = artist.split(/[,&]/).map(a => a.trim()).filter(a => a.length > 0);
        const ytQueries = [
            `${name} ${artistList[1] || artistList[0]} official audio`,
            `${name} ${artistList[0]} song`,
        ];

        for (const ytQuery of ytQueries) {
            try {
                const searchResults = await playDL.search(ytQuery, { limit: 5, source: { youtube: 'video' } });

                if (searchResults && searchResults.length > 0) {
                    console.log(`[LAVALINK] play-dl found ${searchResults.length} YouTube videos`);

                    // Load each video through Lavalink
                    for (const video of searchResults.slice(0, 3)) {
                        try {
                            const videoUrl = video.url || `https://www.youtube.com/watch?v=${video.id}`;
                            const result = await this.kazagumo.search(videoUrl, { requester });
                            if (result?.tracks?.length > 0) {
                                allTracks.push(result.tracks[0]);
                                hasYouTubeTracks = true;
                            }
                        } catch (loadErr) {
                            // Skip if can't load
                        }
                    }

                    if (hasYouTubeTracks) break;
                }
            } catch (e) {
                console.warn(`[LAVALINK] YouTube search failed: ${e.message}`);
            }
        }

        // SoundCloud as fallback only if YouTube didn't find enough
        if (allTracks.length < 3) {
            console.log(`[LAVALINK] Also searching SoundCloud...`);
            for (const query of searchQueries) {
                try {
                    const result = await this.kazagumo.search(query, { requester, engine: 'soundcloud' });
                    if (result.tracks && result.tracks.length > 0) {
                        allTracks.push(...result.tracks.slice(0, 5));
                    }
                    if (allTracks.length >= 10) break;
                } catch (e) {
                    console.warn(`[LAVALINK] SoundCloud search failed: ${e.message}`);
                }
            }
        }

        // Check if we have clean results (without remix keywords)
        const hasCleanTracks = allTracks.some(t => {
            const title = (t.title || '').toLowerCase();
            return !excludePatterns.some(p => p.test(title));
        });

        // Remove duplicates based on title
        const seenTitles = new Set();
        allTracks = allTracks.filter(track => {
            const key = track.title?.toLowerCase().slice(0, 50);
            if (seenTitles.has(key)) return false;
            seenTitles.add(key);
            return true;
        });

        if (allTracks.length === 0) {
            console.log(`[LAVALINK] No tracks found for "${artist} - ${name}"`);
            return null;
        }

        // Score and filter tracks - IMPROVED VERSION
        const scoredTracks = allTracks.map(track => {
            let score = 100;
            const title = (track.title || '').toLowerCase();
            const author = (track.author || '').toLowerCase();
            const source = (track.sourceName || track.source || '').toLowerCase();
            const isSoundCloud = source.includes('soundcloud') || (track.uri && track.uri.includes('soundcloud'));
            const isYouTube = source.includes('youtube') || (track.uri && track.uri.includes('youtube'));

            // YouTube gets a penalty (playback may not work) but not as severe
            // A clean YouTube track is better than a remix SoundCloud track
            if (isYouTube) {
                score -= 30; // Moderate penalty - try SoundCloud first but allow YouTube
            }

            // CRITICAL: Penalize tracks with exclude patterns (remixes, lofi, etc.)
            // Each match is a heavy penalty
            let excludeMatches = 0;
            for (const pattern of excludePatterns) {
                if (pattern.test(title)) {
                    excludeMatches++;
                    score -= 60; // Heavy penalty per match - remix is worse than YouTube
                }
            }

            // IMPORTANT: Penalize tracks with EXTRA words not in original
            // "Tera Hone Laga Hoon lofi" has "lofi" extra - should be penalized
            const titleWords = title.split(/[\s\-_.,|()[\]]+/).filter(w => w.length > 2);
            const combinedOriginal = [...originalTitleWords, ...artistWords];
            for (const word of titleWords) {
                // Skip common words and file extensions
                if (['the', 'and', 'mp3', 'wav', 'flac', 'official', 'audio', 'video', 'full', 'hd', 'hq'].includes(word)) continue;

                // If this word isn't in original title or artist name, penalize
                const isInOriginal = combinedOriginal.some(orig =>
                    word.includes(orig) || orig.includes(word)
                );
                if (!isInOriginal) {
                    // Check if it's a bad word (remix indicator)
                    const isBadWord = excludePatterns.some(p => p.test(word));
                    if (isBadWord) {
                        score -= 40; // Extra penalty for remix indicators
                    } else {
                        score -= 10; // Small penalty for unknown extra words
                    }
                }
            }

            // BONUS: Exact or near-exact title match
            const searchName = name.toLowerCase();
            const cleanTitle = title
                .replace(/[\s\-_]+/g, ' ')
                .replace(/\.(mp3|wav|flac|m4a)$/i, '')
                .trim();

            if (cleanTitle === searchName || cleanTitle.includes(searchName)) {
                score += 20; // Basic match bonus
                // NOTE: Removed "clean minimal title" bonus - clean titles are often covers!
            }

            // CRITICAL: Check ALL artist names - boost if ANY artist appears in title/author
            // This helps identify original tracks vs covers
            const allArtists = artist.toLowerCase().split(/[,&]/).map(a => a.trim()).filter(a => a.length > 2);
            let artistMatchBonus = 0;
            for (const artistName of allArtists) {
                // Skip very short names
                const isShortName = artistName.length < 6;

                if (title.includes(artistName) || author.includes(artistName)) {
                    // Singer name in title/author is a STRONG indicator of original
                    artistMatchBonus += isShortName ? 20 : 45; // Increased bonus!
                }
            }
            score += artistMatchBonus;

            // MAJOR BOOST for movie/album names - indicates ORIGINAL soundtrack
            // Common patterns for Bollywood: "Song - Movie Name", "Song (from Movie)"
            const movieIndicators = ['jab', 'dil', 'kuch', 'from', 'ost', 'soundtrack', 'movie', 'film', 'we met', 'hai'];
            for (const indicator of movieIndicators) {
                if (title.includes(indicator) && !searchName.includes(indicator)) {
                    score += 35; // BIG boost for movie names - this is likely original!
                    break;
                }
            }

            // PENALIZE tracks that look like covers (artist name NOT matching original)
            // If track has a different artist name, it's probably a cover
            const hasUnknownArtist = author.length > 0 &&
                !allArtists.some(a => author.includes(a)) &&
                !author.includes('topic') && // YouTube auto-generated channels
                !author.includes('official');
            if (hasUnknownArtist && artistMatchBonus === 0) {
                score -= 25; // Probably a cover by different artist
            }

            // STRICT duration matching - this is crucial for finding the right version
            if (spotifyDuration && track.length) {
                const durationDiff = Math.abs(track.length - spotifyDuration);
                if (durationDiff < 5000) {
                    score += 40; // Almost exact match - very good!
                } else if (durationDiff < 15000) {
                    score += 25; // Within 15 seconds - good
                } else if (durationDiff < 30000) {
                    score += 5; // Within 30 seconds - acceptable
                } else if (durationDiff > 45000) {
                    score -= 30; // More than 45s different - probably wrong version
                }
            }

            // Penalize very short or very long tracks
            if (track.length && (track.length < 60000 || track.length > 600000)) {
                score -= 20;
            }

            return { track, score, source: isSoundCloud ? 'SC' : (isYouTube ? 'YT' : 'other'), excludeMatches };
        });

        // Sort by score descending
        scoredTracks.sort((a, b) => b.score - a.score);

        // Log top matches for debugging
        console.log(`[LAVALINK] Track matching for "${artist} - ${name}" (duration: ${this.formatDuration(spotifyDuration)}):`);
        scoredTracks.slice(0, 5).forEach((st, i) => {
            const warn = st.excludeMatches > 0 ? ` ⚠️${st.excludeMatches}` : '';
            console.log(`  ${i + 1}. [${st.score}] [${st.source}]${warn} ${st.track.title} (${this.formatDuration(st.track.length)})`);
        });

        // Find the best CLEAN match (no exclude patterns)
        const cleanMatches = scoredTracks.filter(st => st.excludeMatches === 0);
        const bestClean = cleanMatches[0];

        // If we have a clean match with decent score, use it (prefer this!)
        if (bestClean && bestClean.score >= 40) {
            const src = bestClean.source;
            console.log(`[LAVALINK] ✓ Selected (clean ${src}): ${bestClean.track.title}`);
            return bestClean.track;
        }

        // Check if ALL SoundCloud results have warnings (common for Bollywood songs)
        const scTracks = scoredTracks.filter(st => st.source === 'SC');
        const ytTracks = scoredTracks.filter(st => st.source === 'YT');
        const allSCHaveWarnings = scTracks.length === 0 || scTracks.every(st => st.excludeMatches > 0);

        // If SoundCloud only has remixes but we have YouTube, try YouTube
        if (allSCHaveWarnings && ytTracks.length > 0) {
            const bestYT = ytTracks.filter(st => st.excludeMatches === 0)[0] || ytTracks[0];
            if (bestYT && bestYT.score >= 20) {
                console.log(`[LAVALINK] 🎬 Using YouTube: ${bestYT.track.title}`);
                return bestYT.track;
            }
        }

        // LENIENT MODE: If we have ANY results, use the best one
        // Better to play something than nothing!
        const bestMatch = scoredTracks[0];
        if (bestMatch) {
            if (bestMatch.excludeMatches > 0) {
                console.warn(`[LAVALINK] ⚠️ Using remix/cover (no original found): ${bestMatch.track.title}`);
            } else {
                console.log(`[LAVALINK] ✓ Selected: ${bestMatch.track.title}`);
            }
            return bestMatch.track;
        }

        console.log(`[LAVALINK] ✗ No tracks found at all`);
        return null;
    }

    /**
     * Utility: Check if URL is Spotify
     */
    isSpotifyUrl(url) {
        return url && (url.includes('spotify.com') || url.includes('spotify:'));
    }

    /**
     * Utility: Check if string is a URL
     */
    isUrl(query) {
        try {
            new URL(query);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Utility: Format duration from ms
     */
    formatDuration(ms) {
        if (!ms || ms < 0) return '0:00';

        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
        }
        return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
    }

    /**
     * Get health status
     */
    getHealthStatus() {
        return {
            ready: this.isReady,
            nodes: this.kazagumo?.shoukaku?.nodes?.size || 0,
            players: this.kazagumo?.players?.size || 0,
            nodeStatus: Array.from(this.kazagumo?.shoukaku?.nodes?.values() || []).map(node => ({
                name: node.name,
                state: node.state,
                stats: node.stats
            }))
        };
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        console.log('[LAVALINK] Shutting down...');

        // Destroy all players
        for (const [guildId, player] of this.kazagumo.players) {
            try {
                player.destroy();
            } catch (error) {
                console.warn(`[LAVALINK] Error destroying player for ${guildId}:`, error.message);
            }
        }

        console.log('[LAVALINK] Shutdown complete');
    }
}

module.exports = LavalinkClient;
