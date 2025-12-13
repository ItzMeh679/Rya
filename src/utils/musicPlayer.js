const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    getVoiceConnection,
    demuxProbe,
    entersState
} = require('@discordjs/voice');
const ytdl = require('@distube/ytdl-core');
const playDL = require('play-dl');
// Note: yt-dlp-exec removed - Lavalink handles streaming now
const { Readable } = require('stream');
const config = require('../config/config.js');
const AudioEffects = require('./audioEffects.js');
const SpotifyHelper = require('./spotifyHelper.js');
const LyricsHelper = require('./lyricsHelper.js');
const YouTubeHelper = require('./youtubeHelper.js');
const sessionManager = require('./sessionManager.js');
const { QUICK_EMOJIS, PREMIUM_COLORS, validateEmojiConfig } = require('../config/emojiConfig.js');

// Validate emoji configuration on import
validateEmojiConfig();

class MusicPlayer {
    constructor(guild, textChannel) {
        this.guild = guild;
        this.textChannel = textChannel;
        this.voiceChannel = null;
        this.connection = null;
        this.player = createAudioPlayer();
        this.queue = [];
        this.currentTrack = null;
        this.currentResource = null;
        this.volume = config.music.defaultVolume;
        this.isPlaying = false;
        this.isPaused = false;
        this.loop = 'off'; // 'off', 'track', 'queue'
        this.autoplay = false;
        this.currentController = null;

        // Cleanup management flags
        this.isDestroyed = false;
        this.cleanupInProgress = false;
        this.lastActivity = Date.now();

        // Advanced features
        this.audioEffects = new AudioEffects();
        this.currentEffect = null;
        this.bassLevel = 0;
        this.trebleLevel = 0;
        this.karaokeModeEnabled = false;
        this.liveKaraokeData = null;

        // Performance optimization - ULTRA FAST
        this.lastCleanup = Date.now();
        this.playbackHistory = [];
        this.maxHistorySize = 100; // Increased for better recommendations
        this.preBufferedTrack = null; // Pre-buffer next track
        this.preBuffering = false;

        // Background processing tracking - PARALLEL
        this.backgroundProcessing = false;
        this.processingProgress = { processed: 0, total: 0, failed: 0 };
        this.maxParallelProcessing = config.music.maxConcurrentStreams || 5;

        // Session tracking
        this.sessionId = null;
        this.sessionStats = {
            trackCount: 0,
            totalDuration: 0,
            skipCount: 0
        };

        // Set up player event handlers once
        this.setupPlayerEventHandlers();

        // Auto-cleanup timer
        this.idleTimer = null;
    }

    // Separate player event handlers (set up once)
    setupPlayerEventHandlers() {
        // Remove any existing listeners to prevent duplicates
        this.player.removeAllListeners();

        this.player.on(AudioPlayerStatus.Idle, async () => {
            this.updateActivity();
            if (this.currentTrack && !this.isDestroyed) {
                this.addToHistory(this.currentTrack);
                await this.handleTrackEnd();
            }
        });

        this.player.on(AudioPlayerStatus.Playing, () => {
            this.updateActivity();
            this.isPlaying = true;
            this.isPaused = false;
            this.updateController().catch(console.error);
        });

        this.player.on(AudioPlayerStatus.Paused, () => {
            this.updateActivity();
            this.isPaused = true;
            this.updateController().catch(console.error);
        });

        this.player.on('error', (error) => {
            console.error('[MUSIC PLAYER] Audio player error:', error);
            this.handleError(error);
        });
    }

    // Separate connection event handlers (set up per connection)
    setupConnectionEventHandlers() {
        if (!this.connection) return;

        // Remove existing listeners to prevent duplicates
        this.connection.removeAllListeners();

        this.connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
            try {
                console.log('[CONNECTION] Disconnected, attempting to reconnect...');

                // Wait 5 seconds to see if it reconnects automatically
                await entersState(this.connection, VoiceConnectionStatus.Connecting, 5000);
                await entersState(this.connection, VoiceConnectionStatus.Ready, 20000);

                console.log('[CONNECTION] Reconnected successfully');
            } catch (error) {
                console.log('[CONNECTION] Failed to reconnect, cleaning up...');
                this.safeCleanup();
            }
        });

        this.connection.on(VoiceConnectionStatus.Destroyed, () => {
            console.log('[CONNECTION] Voice connection destroyed');
            this.connection = null;
            this.safeCleanup();
        });

        this.connection.on('error', (error) => {
            console.error('[CONNECTION] Voice connection error:', error);
            this.safeCleanup();
        });
    }

    updateActivity() {
        this.lastActivity = Date.now();
        this.stopIdleTimer();
        this.startIdleTimer();
    }

    shouldCleanup() {
        if (this.isDestroyed || this.cleanupInProgress) return false;

        const idleTime = Date.now() - this.lastActivity;
        const isIdle = idleTime > (config.music.autoLeaveTimeout || 300000); // 5 minutes default
        const hasNoActivity = !this.isPlaying && this.queue.length === 0;

        return isIdle && hasNoActivity;
    }

    async connect(voiceChannel) {
        try {
            if (this.isDestroyed) {
                throw new Error('Player is destroyed');
            }

            this.voiceChannel = voiceChannel;
            this.updateActivity();

            // Check if already connected to the same channel
            const existingConnection = getVoiceConnection(this.guild.id);
            if (existingConnection && existingConnection.joinConfig.channelId === voiceChannel.id) {
                if (existingConnection.state.status === VoiceConnectionStatus.Ready) {
                    this.connection = existingConnection;
                    this.setupConnectionEventHandlers();
                    this.connection.subscribe(this.player);
                    return true;
                } else if (existingConnection.state.status === VoiceConnectionStatus.Destroyed) {
                    // Clean up the destroyed connection
                    existingConnection.destroy();
                }
            }

            // Create new connection with optimized settings
            this.connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: this.guild.id,
                adapterCreator: this.guild.voiceAdapterCreator,
                selfDeaf: true,
                selfMute: false
            });

            // Wait for connection to be ready
            await entersState(this.connection, VoiceConnectionStatus.Ready, 30000);

            // Set up event handlers for this connection
            this.setupConnectionEventHandlers();

            // Subscribe player to connection
            this.connection.subscribe(this.player);

            console.log(`[CONNECTION] Successfully connected to ${voiceChannel.name}`);
            return true;

        } catch (error) {
            console.error('[MUSIC PLAYER] Connection error:', error);
            this.safeCleanup();
            throw new Error(`Failed to connect to voice channel: ${error.message}`);
        }
    }

    async addTrack(query, requestedBy, options = {}) {
        try {
            if (this.isDestroyed) {
                throw new Error('Player is destroyed');
            }

            this.updateActivity();
            let trackInfo = null;

            // Determine source and get track info
            if (this.isSpotifyUrl(query)) {
                trackInfo = await SpotifyHelper.getTrackInfo(query);
                // Convert to YouTube for playback
                const youtubeUrl = await YouTubeHelper.searchTrack(
                    `${trackInfo.artist} ${trackInfo.name}`
                );
                trackInfo.url = youtubeUrl;
                trackInfo.source = 'spotify';
            } else if (this.isYouTubeUrl(query)) {
                trackInfo = await YouTubeHelper.getVideoInfo(query);
                trackInfo.source = 'youtube';
            } else {
                // Search YouTube
                const searchResult = await YouTubeHelper.searchTrack(query);
                trackInfo = await YouTubeHelper.getVideoInfo(searchResult);
                trackInfo.source = 'youtube';
            }

            // Create enhanced track object
            const track = {
                ...trackInfo,
                requestedBy,
                addedAt: Date.now(),
                id: this.generateTrackId(),
                ...options
            };

            // Add to queue
            if (options.next) {
                this.queue.unshift(track);
            } else {
                this.queue.push(track);
            }

            // Auto-play if nothing is playing
            if (!this.isPlaying && !this.isPaused) {
                await this.playNext();
            }

            await this.updateController();
            return track;

        } catch (error) {
            console.error('[MUSIC PLAYER] Add track error:', error);
            throw new Error(`Failed to add track: ${error.message}`);
        }
    }

    // OPTIMIZED playlist processing with instant playback
    async addPlaylist(playlistUrl, requestedBy) {
        try {
            if (this.isDestroyed) {
                throw new Error('Player is destroyed');
            }

            this.updateActivity();
            let tracks = [];

            if (this.isSpotifyPlaylist(playlistUrl)) {
                const spotifyData = await SpotifyHelper.getTrackInfo(playlistUrl);

                // Start playing immediately with first track
                if (spotifyData.tracks && spotifyData.tracks.length > 0) {
                    const firstTrack = spotifyData.tracks[0];

                    // Add first track and start playing immediately
                    try {
                        const firstYouTubeUrl = await YouTubeHelper.searchTrack(`${firstTrack.artist} ${firstTrack.name}`);
                        const firstProcessedTrack = {
                            ...firstTrack,
                            url: firstYouTubeUrl,
                            source: 'spotify',
                            requestedBy,
                            addedAt: Date.now(),
                            id: this.generateTrackId()
                        };

                        this.queue.push(firstProcessedTrack);

                        // Start playing first track immediately
                        if (!this.isPlaying && !this.isPaused) {
                            await this.playNext();
                        }

                        await this.updateController();

                        // Send immediate feedback with premium emojis
                        if (this.textChannel) {
                            await this.textChannel.send({
                                content: `${QUICK_EMOJIS.play()} Started playing **${firstTrack.name}** by **${firstTrack.artist}**\n${QUICK_EMOJIS.queue()} Processing ${spotifyData.tracks.length - 1} remaining tracks in background...`
                            });
                        }

                    } catch (error) {
                        console.warn(`Failed to add first track: ${firstTrack.name}`, error);
                    }

                    // Process remaining tracks asynchronously in the background
                    if (spotifyData.tracks.length > 1) {
                        this.processPlaylistBackground(
                            spotifyData.tracks.slice(1),
                            requestedBy,
                            'spotify'
                        );
                    }

                    return [{
                        name: spotifyData.name,
                        totalTracks: spotifyData.totalTracks,
                        processingInBackground: true,
                        message: `Started playing first track. Processing ${spotifyData.totalTracks - 1} remaining tracks in background...`
                    }];
                }

            } else if (this.isYouTubePlaylist(playlistUrl)) {
                // For YouTube playlists, we can be more aggressive since no conversion needed
                tracks = await YouTubeHelper.getPlaylistTracks(playlistUrl, 50); // Get first 50 quickly

                tracks = tracks.map(track => ({
                    ...track,
                    source: 'youtube',
                    requestedBy,
                    addedAt: Date.now(),
                    id: this.generateTrackId()
                }));

                // Add first batch to queue
                this.queue.push(...tracks.slice(0, 10)); // Add first 10 immediately

                // Start playing if nothing is playing
                if (!this.isPlaying && !this.isPaused && tracks.length > 0) {
                    await this.playNext();
                }

                // Process remaining tracks in background if there are more
                if (tracks.length > 10) {
                    this.processPlaylistBackground(tracks.slice(10), requestedBy, 'youtube');
                }

                await this.updateController();
                return tracks;
            }

        } catch (error) {
            console.error('[MUSIC PLAYER] Add playlist error:', error);
            throw new Error(`Failed to add playlist: ${error.message}`);
        }
    }

    // Background processing method that doesn't block the main thread
    async processPlaylistBackground(tracks, requestedBy, source) {
        if (this.backgroundProcessing || this.isDestroyed) {
            console.log('[PLAYLIST] Background processing already in progress or player destroyed');
            return;
        }

        this.backgroundProcessing = true;
        this.processingProgress = { processed: 0, total: tracks.length, failed: 0 };

        console.log(`[PLAYLIST] Processing ${tracks.length} tracks in background...`);

        const concurrentLimit = 3;
        const delayBetweenBatches = 800;
        let processed = 0;
        let failed = 0;

        try {
            for (let i = 0; i < tracks.length && !this.isDestroyed; i += concurrentLimit) {
                const batch = tracks.slice(i, i + concurrentLimit);

                const batchPromises = batch.map(async (track, index) => {
                    try {
                        if (this.isDestroyed) return null;

                        if (source === 'spotify') {
                            await new Promise(resolve => setTimeout(resolve, index * 150));

                            const youtubeUrl = await YouTubeHelper.searchTrack(`${track.artist} ${track.name}`);
                            return {
                                ...track,
                                url: youtubeUrl,
                                source: 'spotify',
                                requestedBy,
                                addedAt: Date.now(),
                                id: this.generateTrackId()
                            };
                        } else {
                            return {
                                ...track,
                                source: 'youtube',
                                requestedBy,
                                addedAt: Date.now(),
                                id: this.generateTrackId()
                            };
                        }
                    } catch (error) {
                        console.warn(`Failed to process track: ${track.name || track.title}`, error);
                        return null;
                    }
                });

                const batchResults = await Promise.all(batchPromises);
                const validTracks = batchResults.filter(track => track !== null);

                if (validTracks.length > 0 && !this.isDestroyed) {
                    this.queue.push(...validTracks);
                    processed += validTracks.length;
                    this.processingProgress.processed = processed;

                    if (processed % 3 === 0) {
                        await this.updateController();
                    }
                }

                failed += batch.length - validTracks.length;
                this.processingProgress.failed = failed;

                if (i + concurrentLimit < tracks.length && !this.isDestroyed) {
                    await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
                }

                if (processed > 0 && processed % 15 === 0 && this.textChannel && !this.isDestroyed) {
                    try {
                        await this.textChannel.send({
                            content: `${QUICK_EMOJIS.queue()} Playlist progress: ${processed}/${tracks.length} tracks processed (${failed} failed)...`
                        });
                    } catch (error) {
                        // Ignore message send errors
                    }
                }
            }

        } catch (error) {
            console.error('[PLAYLIST] Background processing error:', error);
        }

        this.backgroundProcessing = false;

        if (!this.isDestroyed) {
            await this.updateController();
            console.log(`[PLAYLIST] Background processing complete: ${processed} processed, ${failed} failed`);

            if (this.textChannel && processed > 0) {
                try {
                    await this.textChannel.send({
                        content: `${QUICK_EMOJIS.queue()} Playlist processing complete! Added **${processed}** tracks to queue.${failed > 0 ? ` (${failed} tracks failed to load)` : ''}`
                    });
                } catch (error) {
                    // Ignore message send errors
                }
            }
        }
    }

    async play() {
        if (this.isDestroyed) {
            throw new Error('Player is destroyed');
        }

        this.updateActivity();

        if (this.isPaused) {
            this.player.unpause();
            await this.updateController();
            return;
        }

        if (this.queue.length === 0) {
            throw new Error('Queue is empty');
        }

        await this.playNext();
    }

    async playNext() {
        try {
            if (this.isDestroyed) return;

            this.updateActivity();

            if (this.queue.length === 0) {
                if (this.loop === 'queue' && this.playbackHistory.length > 0) {
                    this.queue = [...this.playbackHistory];
                    this.playbackHistory = [];
                } else if (this.autoplay && this.currentTrack) {
                    await this.addAutoplayTrack();
                } else {
                    this.currentTrack = null;
                    await this.updateController();
                    return;
                }
            }

            let nextTrack = null;

            if (this.loop === 'track' && this.currentTrack) {
                nextTrack = { ...this.currentTrack };
            } else {
                nextTrack = this.queue.shift();
            }

            // LAZY LOADING: Convert Spotify track to YouTube URL just-in-time
            if (nextTrack.source === 'spotify' && !nextTrack.url) {
                try {
                    console.log(`[LAZY LOAD] Converting Spotify track: ${nextTrack.name}`);
                    nextTrack.url = await YouTubeHelper.searchTrack(`${nextTrack.artist} ${nextTrack.name}`);
                } catch (error) {
                    console.warn(`Failed to convert track during playback: ${nextTrack.name}`, error);
                    if (this.queue.length > 0) {
                        await this.playNext();
                    }
                    return;
                }
            }

            this.currentTrack = nextTrack;

            // Create audio resource with effects
            const stream = await this.createAudioStream(nextTrack);

            // Clean up old resource
            if (this.currentResource) {
                try {
                    this.currentResource.playStream?.destroy();
                } catch (error) {
                    // Ignore cleanup errors
                }
            }

            this.currentResource = createAudioResource(stream, {
                inputType: stream.type,
                metadata: nextTrack
            });

            // Start karaoke mode if enabled
            if (this.karaokeModeEnabled) {
                await this.startKaraokeMode(nextTrack);
            }

            this.player.play(this.currentResource);
            await this.updateController();

            // Send now playing message with premium emojis
            if (this.textChannel && !nextTrack.suppressMessage) {
                await this.sendNowPlayingMessage(nextTrack);
            }

        } catch (error) {
            console.error('[MUSIC PLAYER] Play next error:', error);
            // Skip to next track on error
            if (this.queue.length > 0 && !this.isDestroyed) {
                await this.playNext();
            }
        }
    }

    async sendNowPlayingMessage(track) {
        try {
            if (this.isDestroyed || !this.textChannel) return;

            const embed = {
                color: PREMIUM_COLORS.MUSIC,
                author: {
                    name: `${QUICK_EMOJIS.play()} Now Playing`,
                    icon_url: track.thumbnail
                },
                title: track.title,
                description: `**by** ${track.artist}\n${track.duration ? `**Duration:** \`${this.formatDuration(track.duration)}\`` : ''}`,
                thumbnail: { url: track.thumbnail },
                fields: [
                    {
                        name: `${QUICK_EMOJIS.sound()} Audio Quality`,
                        value: `**Volume:** ${this.volume}%\n**Source:** ${track.source.charAt(0).toUpperCase() + track.source.slice(1)}`,
                        inline: true
                    },
                    {
                        name: `${QUICK_EMOJIS.queue()} Queue Status`,
                        value: `**Next:** ${this.queue.length} tracks\n**Loop:** ${this.loop === 'off' ? 'Off' : this.loop.charAt(0).toUpperCase() + this.loop.slice(1)}`,
                        inline: true
                    }
                ],
                footer: {
                    text: `Requested by ${track.requestedBy.username} • Rya Music Premium`,
                    icon_url: track.requestedBy.displayAvatarURL()
                },
                timestamp: new Date().toISOString()
            };

            if (this.karaokeModeEnabled) {
                embed.fields.push({
                    name: `${QUICK_EMOJIS.lyrics()} Karaoke Mode`,
                    value: '*Live lyrics synchronized with playback*',
                    inline: false
                });
            }

            await this.textChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('[MUSIC PLAYER] Send now playing error:', error);
        }
    }

    async createAudioStream(track) {
        try {
            console.log(`[MUSIC PLAYER] Creating stream for: ${track.title}`);
            console.log(`[MUSIC PLAYER] Track URL: ${track.url}`);

            // Validate and fix URL
            let videoUrl = track.url;

            // Extract video ID if URL is malformed
            const videoIdMatch = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
            if (videoIdMatch) {
                videoUrl = `https://www.youtube.com/watch?v=${videoIdMatch[1]}`;
            } else if (track.id) {
                videoUrl = `https://www.youtube.com/watch?v=${track.id}`;
            }

            // Use play-dl for streaming (Lavalink is primary, this is fallback)
            console.log(`[MUSIC PLAYER] Using play-dl for: ${videoUrl}`);
            const videoInfo = await playDL.video_info(videoUrl);

            if (videoInfo && videoInfo.video_details) {
                const playStream = await playDL.stream_from_info(videoInfo, {
                    quality: 2,
                    discordPlayerCompatibility: true
                });

                console.log(`[MUSIC PLAYER] play-dl stream created successfully`);

                // Apply audio effects if any are set
                if (this.currentEffect || this.bassLevel !== 0 || this.trebleLevel !== 0) {
                    const processedStream = await this.audioEffects.applyEffects(playStream.stream, {
                        effect: this.currentEffect,
                        bass: this.bassLevel,
                        treble: this.trebleLevel,
                        volume: this.volume / 100
                    });

                    const { stream: finalStream, type } = await demuxProbe(processedStream);
                    finalStream.type = type;
                    return finalStream;
                }

                return playStream.stream;
            }

            throw new Error('Failed to get video info');

        } catch (error) {
            console.error('[MUSIC PLAYER] Stream creation error:', error);
            throw error;
        }
    }

    pause() {
        if (!this.isDestroyed) {
            this.updateActivity();
            this.player.pause();
        }
    }

    resume() {
        if (!this.isDestroyed) {
            this.updateActivity();
            this.player.unpause();
        }
    }

    async skip() {
        if (this.isDestroyed) return;

        this.updateActivity();

        if (this.currentResource) {
            try {
                this.currentResource.playStream?.destroy();
            } catch (error) {
                // Ignore cleanup errors
            }
        }
        this.player.stop(true); // Force stop
    }

    async previous() {
        if (this.isDestroyed) return;

        if (this.playbackHistory.length === 0) {
            throw new Error('No previous track available');
        }

        this.updateActivity();
        const previousTrack = this.playbackHistory.pop();
        this.queue.unshift(previousTrack);

        if (this.currentTrack) {
            this.queue.unshift(this.currentTrack);
        }

        await this.skip();
    }

    async setVolume(volume) {
        if (this.isDestroyed) return this.volume;

        this.updateActivity();
        const clampedVolume = Math.max(0, Math.min(volume, config.music.maxVolume));
        this.volume = clampedVolume;

        if (this.currentResource) {
            this.currentResource.volume?.setVolume(clampedVolume / 100);
        }

        await this.updateController();
        return clampedVolume;
    }

    async setLoop(mode) {
        if (this.isDestroyed) return;

        const validModes = ['off', 'track', 'queue'];
        if (!validModes.includes(mode)) {
            throw new Error('Invalid loop mode');
        }

        this.updateActivity();
        this.loop = mode;
        await this.updateController();
    }

    async toggleAutoplay() {
        if (this.isDestroyed) return this.autoplay;

        this.updateActivity();
        this.autoplay = !this.autoplay;
        await this.updateController();
        return this.autoplay;
    }

    // Continue with the rest of the methods... (truncated for space)
    // [Include all other methods from the original class with similar safety checks]

    // Safe cleanup method that prevents double-cleanup
    safeCleanup() {
        if (this.isDestroyed || this.cleanupInProgress) {
            return;
        }

        this.cleanupInProgress = true;

        try {
            console.log(`[MUSIC PLAYER] Starting safe cleanup for guild ${this.guild.id}`);

            // Mark as destroyed first
            this.isDestroyed = true;

            // Stop background processing
            this.backgroundProcessing = false;

            // Stop karaoke updates
            this.stopKaraokeMode();

            // Stop timers
            this.stopIdleTimer();

            // Stop audio player with force
            if (this.player) {
                try {
                    this.player.stop(true);
                    this.player.removeAllListeners();
                } catch (error) {
                    console.warn('[CLEANUP] Player stop error:', error.message);
                }
            }

            // Destroy audio resource
            if (this.currentResource) {
                try {
                    this.currentResource.playStream?.destroy();
                    this.currentResource = null;
                } catch (error) {
                    console.warn('[CLEANUP] Resource cleanup error:', error.message);
                }
            }

            // Destroy voice connection safely
            if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
                try {
                    this.connection.removeAllListeners();
                    this.connection.destroy();
                } catch (error) {
                    console.warn('[CLEANUP] Connection destroy error:', error.message);
                }
            }
            this.connection = null;

            // Clear data
            this.queue = [];
            this.playbackHistory = [];
            this.currentTrack = null;
            this.isPlaying = false;
            this.isPaused = false;

            // Delete controller message
            if (this.currentController) {
                this.currentController.delete().catch(() => { });
                this.currentController = null;
            }

            // Send cleanup message
            if (this.textChannel) {
                this.textChannel.send({
                    content: `${QUICK_EMOJIS.stop()} **Rya Music disconnected.** Thanks for listening! Use \`/play\` to start a new session.`
                }).catch(() => { });
            }

            console.log(`[MUSIC PLAYER] Safe cleanup completed for guild ${this.guild.id}`);

        } catch (error) {
            console.error('[MUSIC PLAYER] Cleanup error:', error.message);
        } finally {
            this.cleanupInProgress = false;
        }
    }

    // Enhanced idle timer management
    startIdleTimer() {
        if (this.idleTimer || this.isDestroyed) return;

        this.idleTimer = setTimeout(() => {
            if (this.shouldCleanup()) {
                console.log(`[IDLE] Auto-cleanup triggered for guild ${this.guild.id}`);
                this.safeCleanup();
            }
        }, config.music.autoLeaveTimeout || 1000000);
    }

    stopIdleTimer() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
    }

    // Utility methods and getters
    isConnected() {
        return this.connection &&
            this.connection.state.status === VoiceConnectionStatus.Ready &&
            !this.isDestroyed;
    }

    getQueue() {
        return this.isDestroyed ? [] : this.queue;
    }

    getCurrentTrack() {
        return this.isDestroyed ? null : this.currentTrack;
    }

    getVolume() {
        return this.volume;
    }

    getLoopMode() {
        return this.loop;
    }

    generateTrackId() {
        return `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    isSpotifyUrl(url) {
        return url.includes('spotify.com');
    }

    isSpotifyPlaylist(url) {
        return url.includes('spotify.com') && url.includes('playlist');
    }

    isYouTubeUrl(url) {
        return url.includes('youtube.com') || url.includes('youtu.be');
    }

    isYouTubePlaylist(url) {
        return this.isYouTubeUrl(url) && url.includes('playlist');
    }

    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
        }
    }

    addToHistory(track) {
        if (this.isDestroyed) return;

        this.playbackHistory.push({ ...track });

        if (this.playbackHistory.length > this.maxHistorySize) {
            this.playbackHistory.shift();
        }
    }

    async updateController() {
        if (this.isDestroyed || !this.textChannel || !this.currentController) return;

        try {
            const { createMusicEmbed, createMusicActionRow } = require('../events/interactionCreate.js');

            const embed = createMusicEmbed(this);
            const actionRows = createMusicActionRow(this);

            await this.currentController.edit({
                embeds: [embed],
                components: actionRows
            });

        } catch (error) {
            console.error('[MUSIC PLAYER] Controller update error:', error);
            if (error.code === 10008 || error.code === 50001) {
                await this.sendNewController();
            }
        }
    }

    async sendNewController() {
        if (this.isDestroyed || !this.textChannel) return null;

        try {
            if (this.currentController) {
                try {
                    await this.currentController.delete();
                } catch (error) {
                    // Ignore deletion errors
                }
            }

            const { createMusicEmbed, createMusicActionRow } = require('../events/interactionCreate.js');

            const embed = createMusicEmbed(this);
            const actionRows = createMusicActionRow(this);

            this.currentController = await this.textChannel.send({
                embeds: [embed],
                components: actionRows
            });

            return this.currentController;

        } catch (error) {
            console.error('[MUSIC PLAYER] New controller error:', error);
            return null;
        }
    }

    async handleTrackEnd() {
        if (this.isDestroyed) return;

        this.updateActivity();

        if (this.loop === 'track') {
            await this.playNext();
            return;
        }

        if (this.queue.length > 0) {
            await this.playNext();
            return;
        }

        if (this.loop === 'queue' && this.playbackHistory.length > 0) {
            this.queue = [...this.playbackHistory];
            this.playbackHistory = [];
            await this.playNext();
            return;
        }

        if (this.autoplay && this.currentTrack) {
            console.log('[AUTOPLAY] Queue empty, adding autoplay track...');
            try {
                await this.addAutoplayTrack();

                // Wait a moment then check if we need to start playing
                setTimeout(async () => {
                    if (!this.isPlaying && this.queue.length > 0 && !this.isDestroyed) {
                        console.log('[AUTOPLAY] Starting playback of autoplay track...');
                        await this.playNext();
                    }
                }, 1000);
            } catch (error) {
                console.error('[AUTOPLAY] Error in autoplay:', error);
                this.currentTrack = null;
                this.isPlaying = false;
                await this.updateController();
            }
            return;
        }

        // No more tracks and no autoplay
        this.currentTrack = null;
        this.isPlaying = false;
        this.stopKaraokeMode();
        await this.updateController();

        if (this.textChannel) {
            await this.textChannel.send({
                content: `${QUICK_EMOJIS.stop()} **Music session ended.** Use \`/play\` to start listening again!`
            });
        }
    }

    handleError(error) {
        if (this.isDestroyed) return;

        console.error('[MUSIC PLAYER] Playback error:', error);
        this.updateActivity();

        if (this.queue.length > 0) {
            this.playNext().catch(console.error);
        } else {
            this.currentTrack = null;
            this.isPlaying = false;
            this.updateController().catch(console.error);
        }
    }

    // Karaoke methods with safety checks
    async toggleKaraokeMode() {
        if (this.isDestroyed) return false;

        this.updateActivity();
        this.karaokeModeEnabled = !this.karaokeModeEnabled;

        if (this.karaokeModeEnabled && this.currentTrack) {
            await this.startKaraokeMode(this.currentTrack);
        } else {
            this.stopKaraokeMode();
        }

        await this.updateController();
        return this.karaokeModeEnabled;
    }

    async startKaraokeMode(track) {
        if (this.isDestroyed) return;

        try {
            if (!config.isFeatureEnabled('lyrics.enableKaraoke')) return;

            this.liveKaraokeData = await LyricsHelper.getTimedLyrics(track);

            if (this.liveKaraokeData && this.liveKaraokeData.timestamps) {
                this.startLiveKaraokeUpdates();

                if (this.textChannel) {
                    await this.textChannel.send({
                        content: `${QUICK_EMOJIS.lyrics()} **Karaoke Mode Activated!** Live lyrics will appear as the song plays.`
                    });
                }
            }

        } catch (error) {
            console.warn('[KARAOKE] Failed to start karaoke mode:', error);
        }
    }

    startLiveKaraokeUpdates() {
        if (this.karaokeInterval || this.isDestroyed) {
            clearInterval(this.karaokeInterval);
        }

        const startTime = Date.now();

        this.karaokeInterval = setInterval(async () => {
            if (!this.isPlaying || !this.liveKaraokeData || this.isDestroyed) {
                return;
            }

            const currentTime = Date.now() - startTime;
            const currentLine = this.getCurrentLyricLine(currentTime);

            if (currentLine && currentLine !== this.lastKaraokeLine) {
                this.lastKaraokeLine = currentLine;
                await this.updateKaraokeDisplay(currentLine);
            }
        }, 200); // Faster updates for smoother karaoke (was 500ms)
    }

    getCurrentLyricLine(currentTime) {
        if (!this.liveKaraokeData?.timestamps || this.isDestroyed) return null;

        const timestamps = this.liveKaraokeData.timestamps;
        let currentLine = null;

        for (const timestamp of timestamps) {
            if (currentTime >= timestamp.time && currentTime < timestamp.time + timestamp.duration) {
                currentLine = {
                    text: timestamp.text,
                    timeRemaining: timestamp.time + timestamp.duration - currentTime,
                    progress: (currentTime - timestamp.time) / timestamp.duration
                };
                break;
            }
        }

        return currentLine;
    }

    async updateKaraokeDisplay(currentLine) {
        if (this.isDestroyed || !this.textChannel || !currentLine) return;

        try {
            const progressBar = this.createProgressBar(currentLine.progress, 20);
            const embed = {
                color: PREMIUM_COLORS.LYRICS,
                title: `${QUICK_EMOJIS.lyrics()} Live Karaoke`,
                description: `**${currentLine.text}**\n\`${progressBar}\``,
                footer: {
                    text: `${Math.ceil(currentLine.timeRemaining / 1000)}s remaining • Rya Karaoke`,
                    icon_url: this.currentTrack?.thumbnail
                },
                timestamp: new Date().toISOString()
            };

            if (this.karaokeMessage) {
                await this.karaokeMessage.edit({ embeds: [embed] });
            } else {
                this.karaokeMessage = await this.textChannel.send({ embeds: [embed] });
            }
        } catch (error) {
            // Ignore karaoke display errors
        }
    }

    createProgressBar(progress, length = 20) {
        const filled = Math.floor(progress * length);
        const empty = length - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    }

    stopKaraokeMode() {
        if (this.karaokeInterval) {
            clearInterval(this.karaokeInterval);
            this.karaokeInterval = null;
        }

        if (this.karaokeMessage && !this.isDestroyed) {
            this.karaokeMessage.delete().catch(() => { });
            this.karaokeMessage = null;
        }

        this.liveKaraokeData = null;
        this.lastKaraokeLine = null;
    }

    // Additional utility methods with safety checks
    shuffle() {
        if (this.isDestroyed) return;

        this.updateActivity();

        for (let i = this.queue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
        }

        if (this.textChannel) {
            this.textChannel.send({
                content: `${QUICK_EMOJIS.shuffle()} **Queue shuffled!** Mixed up ${this.queue.length} tracks for variety.`
            }).catch(() => { });
        }
    }

    clear() {
        if (this.isDestroyed) return;

        this.updateActivity();
        const clearedCount = this.queue.length;
        this.queue = [];
        this.updateController();

        if (this.textChannel && clearedCount > 0) {
            this.textChannel.send({
                content: `${QUICK_EMOJIS.queue()} **Queue cleared!** Removed ${clearedCount} tracks.`
            }).catch(() => { });
        }
    }

    remove(index) {
        if (this.isDestroyed || index < 0 || index >= this.queue.length) {
            throw new Error('Invalid queue index or player destroyed');
        }

        this.updateActivity();
        const removed = this.queue.splice(index, 1);
        this.updateController();

        if (this.textChannel) {
            this.textChannel.send({
                content: `${QUICK_EMOJIS.queue()} **Removed:** ${removed[0].title} by ${removed[0].artist}`
            }).catch(() => { });
        }

        return removed[0];
    }

    move(from, to) {
        if (this.isDestroyed || from < 0 || from >= this.queue.length || to < 0 || to >= this.queue.length) {
            throw new Error('Invalid queue indices or player destroyed');
        }

        this.updateActivity();
        const track = this.queue.splice(from, 1)[0];
        this.queue.splice(to, 0, track);
        this.updateController();

        if (this.textChannel) {
            this.textChannel.send({
                content: `${QUICK_EMOJIS.queue()} **Moved:** ${track.title} to position ${to + 1}`
            }).catch(() => { });
        }
    }

    async addAutoplayTrack() {
        if (this.isDestroyed) return;

        try {
            this.updateActivity();

            // Create a comprehensive prompt for AI-based recommendations
            const currentTrack = this.currentTrack;
            const recentHistory = this.playbackHistory.slice(-5);

            const aiPrompt = `Based on the current track "${currentTrack.title}" by "${currentTrack.artist}" and recent listening history: ${recentHistory.map(t => `"${t.title}" by "${t.artist}"`).join(', ')}, recommend a similar song that matches the genre, mood, energy level, and musical style. Consider factors like:
        - Musical genre and subgenre
        - Tempo and energy level  
        - Vocal style and instrumentation
        - Era and cultural context
        - Emotional tone and lyrical themes
        - Harmonic progressions and musical structure
        
        Recommend something that would naturally flow well after the current track, not just from the same artist. Focus on musical similarity and listener experience rather than artist repetition.`;

            // Use RecommendationsHelper with enhanced AI prompt and Supabase history
            const RecommendationsHelper = require('./recommendationsHelper.js');

            // Get user ID from current track requester for personalized recommendations
            const requesterId = this.currentTrack?.requester?.id;

            const recommendations = await RecommendationsHelper.getRecommendations(
                currentTrack,
                recentHistory,
                {
                    count: 5,
                    mood: 'similar',
                    aiPrompt: aiPrompt,
                    userId: requesterId  // Enable Supabase history for personalized autoplay
                }
            );

            if (recommendations && recommendations.length > 0) {
                const selectedTrack = recommendations[0]; // Take the best recommendation

                // Add track with autoplay flag and proper error handling
                try {
                    const addedTrack = await this.addTrack(selectedTrack.query, {
                        username: 'Autoplay AI',
                        displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png'
                    }, {
                        autoplay: true,
                        suppressMessage: false // Allow message to show what was added
                    });

                    // Always try to play if we're not currently playing
                    if (!this.isPlaying) {
                        console.log('[AUTOPLAY] Starting playback of autoplay track...');
                        await this.playNext();
                    }

                    if (this.textChannel) {
                        await this.textChannel.send({
                            content: `${QUICK_EMOJIS.autoplay()} **AI Autoplay:** Added **${selectedTrack.title}** by **${selectedTrack.artist}**\n*${selectedTrack.reason || 'Similar vibe and energy to your current track'}*`
                        });
                    }

                    // Update controller to reflect new state
                    await this.updateController();
                    return addedTrack;

                } catch (addError) {
                    console.warn('[AUTOPLAY] Failed to add recommended track:', addError);
                    // Try with a fallback search
                    try {
                        const fallbackQuery = `${currentTrack.artist} similar songs`;
                        await this.addTrack(fallbackQuery, {
                            username: 'Autoplay',
                            displayAvatarURL: () => null
                        }, { autoplay: true });
                    } catch (fallbackError) {
                        console.error('[AUTOPLAY] Fallback also failed:', fallbackError);
                    }
                }
            } else {
                // Fallback to genre-based search if no AI recommendations
                const fallbackQueries = [
                    `${currentTrack.artist} type songs`,
                    `similar to ${currentTrack.title}`,
                    `${this.extractGenre(currentTrack)} music`,
                    'popular songs 2024'
                ];

                for (const query of fallbackQueries) {
                    try {
                        await this.addTrack(query, {
                            username: 'Autoplay',
                            displayAvatarURL: () => null
                        }, { autoplay: true, suppressMessage: true });
                        break;
                    } catch (error) {
                        continue; // Try next fallback
                    }
                }
            }

        } catch (error) {
            console.warn('[AUTOPLAY] Failed to add autoplay track:', error);

            // Final fallback - add a popular track
            try {
                await this.addTrack('popular music 2024', {
                    username: 'Autoplay',
                    displayAvatarURL: () => null
                }, { autoplay: true, suppressMessage: true });
            } catch (finalError) {
                console.error('[AUTOPLAY] All autoplay attempts failed:', finalError);
            }
        }
    }

    getPlaybackState() {
        return {
            isPlaying: this.isPlaying,
            isPaused: this.isPaused,
            volume: this.volume,
            loop: this.loop,
            autoplay: this.autoplay,
            currentEffect: this.currentEffect,
            bassLevel: this.bassLevel,
            trebleLevel: this.trebleLevel,
            karaokeModeEnabled: this.karaokeModeEnabled,
            queueLength: this.queue.length,
            historyLength: this.playbackHistory.length,
            backgroundProcessing: this.backgroundProcessing,
            processingProgress: this.processingProgress,
            isDestroyed: this.isDestroyed,
            isConnected: this.isConnected()
        };
    }

    getDetailedStats() {
        if (this.isDestroyed) {
            return { error: 'Player is destroyed' };
        }

        const totalPlayTime = this.playbackHistory.reduce((total, track) => {
            return total + (track.duration || 180000);
        }, 0);

        const artistCounts = {};
        this.playbackHistory.forEach(track => {
            artistCounts[track.artist] = (artistCounts[track.artist] || 0) + 1;
        });

        const topArtist = Object.entries(artistCounts)
            .sort(([, a], [, b]) => b - a)[0];

        return {
            totalTracks: this.playbackHistory.length,
            totalPlayTime,
            queueLength: this.queue.length,
            currentVolume: this.volume,
            loopMode: this.loop,
            autoplayEnabled: this.autoplay,
            karaokeMode: this.karaokeModeEnabled,
            audioEffect: this.currentEffect,
            bassLevel: this.bassLevel,
            trebleLevel: this.trebleLevel,
            topArtist: topArtist ? { name: topArtist[0], plays: topArtist[1] } : null,
            isPlaying: this.isPlaying,
            isPaused: this.isPaused,
            isDestroyed: this.isDestroyed
        };
    }

    getPerformanceMetrics() {
        return {
            uptime: Date.now() - this.lastCleanup,
            memoryUsage: {
                queue: this.queue.length,
                history: this.playbackHistory.length,
                backgroundProcessing: this.backgroundProcessing
            },
            connectionStatus: this.isConnected(),
            playerStatus: {
                playing: this.isPlaying,
                paused: this.isPaused,
                volume: this.volume,
                destroyed: this.isDestroyed
            },
            lastActivity: this.lastActivity,
            timeSinceLastActivity: Date.now() - this.lastActivity
        };
    }

    /**
     * Apply an audio effect preset
     */
    async setAudioEffect(effectName) {
        if (this.isDestroyed) return;

        this.currentEffect = effectName === 'none' ? null : effectName;

        if (this.currentTrack && this.isPlaying) {
            try {
                const stream = await this.createAudioStream(this.currentTrack);

                if (this.currentResource) {
                    try {
                        this.currentResource.playStream?.destroy();
                    } catch (e) {
                        console.warn('[MUSIC PLAYER] Old stream cleanup error:', e.message);
                    }
                }

                this.currentResource = createAudioResource(stream, {
                    inputType: stream.type,
                    metadata: this.currentTrack
                });

                this.player.play(this.currentResource);
                await this.updateController();
            } catch (error) {
                console.error('[MUSIC PLAYER] Failed to apply audio effect:', error);
            }
        }
    }

    /**
     * Adjust bass level
     */
    async setBass(level) {
        if (this.isDestroyed) return;

        this.bassLevel = level;

        if (this.currentTrack && this.isPlaying) {
            try {
                const stream = await this.createAudioStream(this.currentTrack);

                if (this.currentResource) {
                    try {
                        this.currentResource.playStream?.destroy();
                    } catch (e) {
                        console.warn('[MUSIC PLAYER] Old stream cleanup error:', e.message);
                    }
                }

                this.currentResource = createAudioResource(stream, {
                    inputType: stream.type,
                    metadata: this.currentTrack
                });

                this.player.play(this.currentResource);
                await this.updateController();
            } catch (error) {
                console.error('[MUSIC PLAYER] Failed to apply bass adjustment:', error);
            }
        }
    }

    /**
     * Adjust treble level
     */
    async setTreble(level) {
        if (this.isDestroyed) return;

        this.trebleLevel = level;

        if (this.currentTrack && this.isPlaying) {
            try {
                const stream = await this.createAudioStream(this.currentTrack);

                if (this.currentResource) {
                    try {
                        this.currentResource.playStream?.destroy();
                    } catch (e) {
                        console.warn('[MUSIC PLAYER] Old stream cleanup error:', e.message);
                    }
                }

                this.currentResource = createAudioResource(stream, {
                    inputType: stream.type,
                    metadata: this.currentTrack
                });

                this.player.play(this.currentResource);
                await this.updateController();
            } catch (error) {
                console.error('[MUSIC PLAYER] Failed to apply treble adjustment:', error);
            }
        }
    }
}

module.exports = MusicPlayer;
