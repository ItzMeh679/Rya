// src/utils/spotifyHelper.js - Fixed version with proper logging
const axios = require('axios');
const config = require('../config/config');

// Create a logger object if config doesn't have logging methods
const logger = {
    error: (...args) => console.error('[SPOTIFY ERROR]', ...args),
    warn: (...args) => console.warn('[SPOTIFY WARN]', ...args),
    info: (...args) => console.info('[SPOTIFY INFO]', ...args),
    debug: (...args) => console.log('[SPOTIFY DEBUG]', ...args)
};

// Use config logging methods if they exist, otherwise use console
const log = {
    error: config.error || logger.error,
    warn: config.warn || logger.warn,
    info: config.info || logger.info,
    debug: config.debug || logger.debug
};

class SpotifyHelper {
    constructor() {
        this.accessToken = null;
        this.tokenExpiry = null;
        this.cache = new Map();
        this.cacheTimeout = 3600000; // 1 hour
        this.maxCacheSize = 1000; // Increased cache size
        this.requestQueue = [];
        this.isProcessingQueue = false;

        // Enhanced rate limiting
        this.lastRequestTime = 0;
        this.minRequestInterval = 50; // Reduced to 50ms for better performance
        this.requestsPerMinute = 150; // Increased limit
        this.requestTimestamps = [];

        // Request retry configuration
        this.retryConfig = {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 30000,
            backoffMultiplier: 2
        };

        // Initialize if enabled - check both config.spotify and config.apis.spotify
        const spotifyConfig = config.spotify || config.apis?.spotify;
        if (spotifyConfig && (spotifyConfig.enabled !== false) && spotifyConfig.clientId && spotifyConfig.clientSecret) {
            this.initializeToken();
            this.startCacheCleanup();
            this.startHealthMonitoring();
        }
    }

    startCacheCleanup() {
        setInterval(() => {
            this.cleanupCache();
        }, 300000); // Clean every 5 minutes
    }

    startHealthMonitoring() {
        setInterval(async () => {
            try {
                const health = await this.healthCheck();
                if (!health.healthy) {
                    log.warn(`Spotify API health check failed: ${health.reason}`);
                }
            } catch (error) {
                log.error('Health monitoring failed:', error.message);
            }
        }, 300000); // Check every 5 minutes
    }

    cleanupCache() {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [key, data] of this.cache) {
            if (now - data.timestamp > (data.timeout || this.cacheTimeout)) {
                this.cache.delete(key);
                cleanedCount++;
            }
        }

        // If cache is still too large, remove oldest entries
        if (this.cache.size > this.maxCacheSize) {
            const sortedEntries = Array.from(this.cache.entries())
                .sort(([, a], [, b]) => a.timestamp - b.timestamp);

            const entriesToRemove = this.cache.size - this.maxCacheSize;
            for (let i = 0; i < entriesToRemove; i++) {
                this.cache.delete(sortedEntries[i][0]);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            log.debug(`Cleaned ${cleanedCount} cached Spotify entries`);
        }
    }

    // Enhanced URL validation with better regex patterns
    static isSpotifyUrl(url) {
        if (!url || typeof url !== 'string') return false;

        const patterns = [
            // Standard URLs: https://open.spotify.com/track/xxx or with intl path
            /^https?:\/\/open\.spotify\.com\/(intl-[a-z]{2}\/)?(track|album|playlist|artist)\/[a-zA-Z0-9]+/,
            // URI format: spotify:track:xxx
            /^spotify:(track|album|playlist|artist):[a-zA-Z0-9]+$/,
            // Short links: https://spotify.link/xxx
            /^https?:\/\/spotify\.link\/[a-zA-Z0-9]+$/
        ];

        return patterns.some(pattern => pattern.test(url.trim()));
    }

    static getSpotifyType(url) {
        // Handle intl paths: /intl-xx/ before the type
        const match = url.match(/spotify\.com\/(?:intl-[a-z]{2}\/)?(track|album|playlist|artist)\/|spotify:(track|album|playlist|artist):/);
        return match ? match[1] || match[2] : null;
    }

    static extractSpotifyId(url) {
        const patterns = [
            // Handle intl paths and query params
            /spotify\.com\/(?:intl-[a-z]{2}\/)?(?:track|album|playlist|artist)\/([a-zA-Z0-9]+)/,
            /spotify:(?:track|album|playlist|artist):([a-zA-Z0-9]+)/
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        return null;
    }

    // Enhanced token management with better error handling
    async initializeToken() {
        const spotifyConfig = config.spotify || config.apis?.spotify;

        if (!spotifyConfig || (!spotifyConfig.enabled && spotifyConfig.enabled !== undefined)) {
            log.warn('Spotify integration is disabled in config');
            return false;
        }

        if (!spotifyConfig.clientId || !spotifyConfig.clientSecret) {
            log.error('Spotify credentials are incomplete');
            return false;
        }

        try {
            await this.refreshAccessToken();

            // Set up automatic token refresh with better timing
            const refreshInterval = Math.max(1800000, (spotifyConfig.refreshTokenInterval || 3300000)); // Min 30 minutes
            setInterval(async () => {
                try {
                    await this.refreshAccessToken();
                } catch (error) {
                    log.error('Automatic token refresh failed:', error.message);
                    // Try again in 5 minutes on failure
                    setTimeout(async () => {
                        try {
                            await this.refreshAccessToken();
                        } catch (retryError) {
                            log.error('Token refresh retry failed:', retryError.message);
                        }
                    }, 300000);
                }
            }, refreshInterval);

            log.info('Spotify API initialized successfully');
            return true;
        } catch (error) {
            log.error('Spotify initialization failed:', error.message);
            return false;
        }
    }

    async refreshAccessToken() {
        const spotifyConfig = config.spotify || config.apis?.spotify;

        try {
            const response = await axios.post('https://accounts.spotify.com/api/token',
                'grant_type=client_credentials',
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Basic ${Buffer.from(`${spotifyConfig.clientId}:${spotifyConfig.clientSecret}`).toString('base64')}`
                    },
                    timeout: spotifyConfig?.requestTimeout || 10000
                }
            );

            this.accessToken = response.data.access_token;
            this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 300000; // 5 minute buffer

            log.debug('Spotify access token refreshed');
            return true;
        } catch (error) {
            const errorMessage = error.response?.data?.error_description || error.response?.data?.error || error.message;
            log.error('Token refresh failed:', errorMessage);
            throw new Error(`Spotify authentication failed: ${error.response?.status || errorMessage}`);
        }
    }

    // Enhanced rate limiting with adaptive delays
    async respectRateLimit() {
        const now = Date.now();

        // Clean old timestamps
        this.requestTimestamps = this.requestTimestamps.filter(
            timestamp => now - timestamp < 60000
        );

        // Check if we're hitting rate limits
        if (this.requestTimestamps.length >= this.requestsPerMinute) {
            const oldestRequest = Math.min(...this.requestTimestamps);
            const waitTime = 60000 - (now - oldestRequest) + 200; // Increased buffer

            if (waitTime > 0) {
                log.debug(`Rate limiting: waiting ${waitTime}ms`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }

        // Ensure minimum interval between requests
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minRequestInterval) {
            await new Promise(resolve =>
                setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest)
            );
        }

        this.requestTimestamps.push(Date.now());
        this.lastRequestTime = Date.now();
    }

    // Enhanced API request with better retry logic and error handling
    async makeSpotifyRequest(endpoint, options = {}) {
        const spotifyConfig = config.spotify || config.apis?.spotify;

        if (!spotifyConfig || (!spotifyConfig.enabled && spotifyConfig.enabled !== undefined)) {
            throw new Error('Spotify integration is disabled');
        }

        // Check and refresh token if needed with better timing
        if (!this.accessToken || Date.now() >= (this.tokenExpiry - 300000)) { // Refresh 5 minutes before expiry
            await this.refreshAccessToken();
        }

        await this.respectRateLimit();

        const { retries = this.retryConfig.maxRetries, timeout = spotifyConfig?.requestTimeout || 15000 } = options;

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await axios.get(`https://api.spotify.com/v1${endpoint}`, {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json',
                        'User-Agent': 'Discord-Music-Bot/1.0'
                    },
                    timeout,
                    validateStatus: status => status < 500, // Don't throw on 4xx errors
                    ...options.axiosOptions
                });

                if (response.status >= 400) {
                    throw new Error(`HTTP ${response.status}: ${response.data?.error?.message || 'Unknown error'}`);
                }

                return response.data;
            } catch (error) {
                log.debug(`Spotify API attempt ${attempt}/${retries} failed:`, error.response?.status || error.message);

                if (error.response?.status === 401 && attempt === 1) {
                    // Token expired, refresh and retry
                    try {
                        await this.refreshAccessToken();
                        continue;
                    } catch (refreshError) {
                        throw new Error(`Token refresh failed: ${refreshError.message}`);
                    }
                } else if (error.response?.status === 429) {
                    // Rate limited - respect Retry-After header
                    const retryAfter = parseInt(error.response.headers['retry-after']) || Math.pow(2, attempt);
                    log.warn(`Rate limited, waiting ${retryAfter} seconds`);
                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                    continue;
                } else if (error.response?.status === 404) {
                    // Not found - don't retry
                    throw new Error('Spotify resource not found or unavailable in your region');
                } else if (error.response?.status >= 500 || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
                    // Server error or network issue - retry with backoff
                    if (attempt === retries) throw error;

                    const delay = Math.min(
                        this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
                        this.retryConfig.maxDelay
                    );

                    log.debug(`Retrying in ${delay}ms due to server error`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                } else if (attempt === retries) {
                    throw error;
                }

                // Default exponential backoff for other errors
                const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // COMPATIBILITY METHOD: For backward compatibility with existing code
    async getPlaylistTracks(playlistUrl) {
        try {
            const playlistData = await this.getTrackInfo(playlistUrl);

            if (playlistData.type !== 'playlist') {
                throw new Error('URL is not a playlist');
            }

            // Return tracks in the format expected by old code
            return playlistData.tracks.map(track => ({
                title: track.name,
                artist: track.artist,
                duration: track.durationMs,
                url: track.url,
                image: track.image || playlistData.image,
                spotifyData: {
                    id: track.id,
                    name: track.name,
                    artist: track.artist,
                    album: track.album,
                    duration: track.durationMs,
                    explicit: track.explicit,
                    popularity: track.popularity,
                    preview: track.preview,
                    url: track.url
                }
            }));
        } catch (error) {
            log.error('getPlaylistTracks error:', error.message);
            throw new Error(`Failed to get playlist tracks: ${error.message}`);
        }
    }

    // Enhanced track info fetching with better error handling
    async getTrackInfo(url) {
        if (!SpotifyHelper.isSpotifyUrl(url)) {
            throw new Error('Invalid Spotify URL format');
        }

        const spotifyId = SpotifyHelper.extractSpotifyId(url);
        const type = SpotifyHelper.getSpotifyType(url);

        if (!spotifyId || !type) {
            throw new Error('Could not extract Spotify ID or type from URL');
        }

        // Validate ID format
        if (!/^[a-zA-Z0-9]{22}$/.test(spotifyId)) {
            throw new Error('Invalid Spotify ID format');
        }

        const cacheKey = `${type}:${spotifyId}`;

        // Check cache
        const cached = this.getCachedResult(cacheKey);
        if (cached) {
            log.debug(`Cache hit for Spotify ${type}: ${spotifyId}`);
            return cached.data;
        }

        try {
            let data;

            switch (type) {
                case 'track':
                    data = await this.getTrackById(spotifyId);
                    break;
                case 'album':
                    data = await this.getAlbumById(spotifyId);
                    break;
                case 'playlist':
                    data = await this.getPlaylistById(spotifyId);
                    break;
                case 'artist':
                    data = await this.getArtistTopTracks(spotifyId);
                    break;
                default:
                    throw new Error(`Unsupported Spotify type: ${type}`);
            }

            // Cache the result with appropriate timeout
            const cacheTimeout = type === 'track' ? this.cacheTimeout : this.cacheTimeout / 2; // Cache playlists for less time
            this.setCachedResult(cacheKey, data, cacheTimeout);
            return data;
        } catch (error) {
            log.error(`Spotify ${type} fetch error:`, error.message);

            // Return more specific error messages
            if (error.message.includes('not found')) {
                throw new Error(`Spotify ${type} not found or unavailable in your region`);
            } else if (error.message.includes('401')) {
                throw new Error('Spotify authentication failed - please try again');
            } else if (error.message.includes('429')) {
                throw new Error('Spotify rate limit exceeded - please wait a moment');
            } else {
                throw new Error(`Failed to fetch Spotify ${type}: ${error.message}`);
            }
        }
    }

    async getTrackById(trackId) {
        const endpoint = `/tracks/${trackId}`;
        const track = await this.makeSpotifyRequest(endpoint);

        // Enhanced track data with additional metadata
        return {
            type: 'track',
            name: this.sanitizeString(track.name),
            artist: track.artists.map(a => this.sanitizeString(a.name)).join(', '),
            album: this.sanitizeString(track.album.name),
            duration: this.formatDuration(track.duration_ms),
            durationMs: track.duration_ms,
            explicit: track.explicit,
            popularity: track.popularity,
            preview: track.preview_url,
            image: this.getBestImage(track.album.images),
            url: track.external_urls.spotify,
            id: track.id,
            isrc: track.external_ids?.isrc,
            releaseDate: this.formatReleaseDate(track.album.release_date),
            genres: [], // Tracks don't have genres, get from artist if needed
            albumType: track.album.album_type,
            discNumber: track.disc_number,
            trackNumber: track.track_number,
            artistIds: track.artists.map(a => a.id),
            albumId: track.album.id,
            markets: track.available_markets?.length || 0
        };
    }

    async getAlbumById(albumId) {
        const endpoint = `/albums/${albumId}`;
        const album = await this.makeSpotifyRequest(endpoint);

        const tracks = album.tracks.items.map((track, index) => ({
            name: this.sanitizeString(track.name),
            artist: track.artists.map(a => this.sanitizeString(a.name)).join(', '),
            duration: this.formatDuration(track.duration_ms),
            durationMs: track.duration_ms,
            explicit: track.explicit,
            trackNumber: track.track_number,
            discNumber: track.disc_number,
            id: track.id,
            preview: track.preview_url,
            url: track.external_urls.spotify
        }));

        // Calculate total duration
        const totalDurationMs = tracks.reduce((sum, track) => sum + track.durationMs, 0);

        return {
            type: 'album',
            name: this.sanitizeString(album.name),
            artist: album.artists.map(a => this.sanitizeString(a.name)).join(', '),
            totalTracks: album.total_tracks,
            releaseDate: this.formatReleaseDate(album.release_date),
            image: this.getBestImage(album.images),
            url: album.external_urls.spotify,
            id: album.id,
            genres: album.genres || [],
            label: album.label,
            popularity: album.popularity,
            albumType: album.album_type,
            copyrights: album.copyrights?.map(c => c.text) || [],
            totalDuration: this.formatDuration(totalDurationMs),
            totalDurationMs,
            tracks: tracks,
            artistIds: album.artists.map(a => a.id)
        };
    }

    async getPlaylistById(playlistId) {
        const endpoint = `/playlists/${playlistId}`;
        const playlist = await this.makeSpotifyRequest(endpoint);

        // Get all tracks with better pagination handling
        let allTracks = [];
        let nextUrl = playlist.tracks.href;
        let pageCount = 0;
        const maxPages = 20; // Prevent infinite loops

        while (nextUrl && allTracks.length < 1000 && pageCount < maxPages) { // Increased track limit
            try {
                const tracksData = await this.makeSpotifyRequest(
                    nextUrl.replace('https://api.spotify.com/v1', '')
                );

                const tracks = tracksData.items
                    .filter(item => item?.track && item.track.type === 'track' && item.track.id)
                    .map(item => ({
                        name: this.sanitizeString(item.track.name),
                        artist: item.track.artists.map(a => this.sanitizeString(a.name)).join(', '),
                        album: this.sanitizeString(item.track.album.name),
                        duration: this.formatDuration(item.track.duration_ms),
                        durationMs: item.track.duration_ms,
                        explicit: item.track.explicit,
                        popularity: item.track.popularity,
                        addedAt: new Date(item.added_at).toLocaleDateString(),
                        id: item.track.id,
                        preview: item.track.preview_url,
                        url: item.track.external_urls.spotify,
                        addedBy: item.added_by?.id,
                        isLocal: item.is_local,
                        image: this.getBestImage(item.track.album.images)
                    }));

                allTracks.push(...tracks);
                nextUrl = tracksData.next;
                pageCount++;

                // Small delay between pages to be respectful
                if (nextUrl) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } catch (error) {
                log.warn(`Failed to fetch playlist page ${pageCount + 1}:`, error.message);
                break;
            }
        }

        // Calculate statistics
        const totalDurationMs = allTracks.reduce((sum, track) => sum + (track.durationMs || 0), 0);
        const explicitCount = allTracks.filter(track => track.explicit).length;

        return {
            type: 'playlist',
            name: this.sanitizeString(playlist.name),
            description: this.sanitizeString(playlist.description) || '',
            owner: this.sanitizeString(playlist.owner.display_name),
            public: playlist.public,
            collaborative: playlist.collaborative,
            totalTracks: playlist.tracks.total,
            fetchedTracks: allTracks.length,
            followers: playlist.followers.total,
            image: this.getBestImage(playlist.images),
            url: playlist.external_urls.spotify,
            id: playlist.id,
            tracks: allTracks,
            totalDuration: this.formatDuration(totalDurationMs),
            totalDurationMs,
            explicitCount,
            averagePopularity: Math.round(allTracks.reduce((sum, t) => sum + (t.popularity || 0), 0) / allTracks.length),
            lastModified: new Date().toISOString()
        };
    }

    async getArtistTopTracks(artistId, country = 'US') {
        // Get both top tracks and artist info in parallel
        const [topTracksData, artistData] = await Promise.all([
            this.makeSpotifyRequest(`/artists/${artistId}/top-tracks?market=${country}`),
            this.makeSpotifyRequest(`/artists/${artistId}`)
        ]);

        const tracks = topTracksData.tracks.map(track => ({
            name: this.sanitizeString(track.name),
            artist: track.artists.map(a => this.sanitizeString(a.name)).join(', '),
            album: this.sanitizeString(track.album.name),
            duration: this.formatDuration(track.duration_ms),
            durationMs: track.duration_ms,
            explicit: track.explicit,
            popularity: track.popularity,
            preview: track.preview_url,
            id: track.id,
            url: track.external_urls.spotify,
            releaseDate: this.formatReleaseDate(track.album.release_date),
            image: this.getBestImage(track.album.images)
        }));

        return {
            type: 'artist',
            name: this.sanitizeString(artistData.name),
            genres: artistData.genres,
            popularity: artistData.popularity,
            followers: artistData.followers.total,
            image: this.getBestImage(artistData.images),
            url: artistData.external_urls.spotify,
            id: artistData.id,
            tracks: tracks,
            topTrackCount: tracks.length,
            averagePopularity: Math.round(tracks.reduce((sum, t) => sum + t.popularity, 0) / tracks.length),
            totalDuration: this.formatDuration(tracks.reduce((sum, t) => sum + t.durationMs, 0))
        };
    }

    // Utility methods
    getBestImage(images) {
        if (!images || !Array.isArray(images) || images.length === 0) {
            return 'https://via.placeholder.com/300x300/1DB954/FFFFFF?text=Spotify'; // Spotify-themed placeholder
        }

        // Prefer 300x300 or closest to it
        const preferredSize = 300;
        let bestImage = images[0];
        let bestSizeDiff = Math.abs((bestImage.width || 0) - preferredSize);

        for (const image of images) {
            const sizeDiff = Math.abs((image.width || 0) - preferredSize);
            if (sizeDiff < bestSizeDiff) {
                bestImage = image;
                bestSizeDiff = sizeDiff;
            }
        }

        return bestImage.url;
    }

    formatDuration(ms) {
        if (!ms || ms < 0) return '0:00';

        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    formatReleaseDate(dateString) {
        if (!dateString) return 'Unknown';

        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } catch {
            return dateString; // Return original if parsing fails
        }
    }

    sanitizeString(str) {
        if (!str || typeof str !== 'string') return '';

        return str
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim()
            .substring(0, 256); // Limit length for Discord embeds
    }

    // Cache management with improved performance
    getCachedResult(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;

        const isExpired = Date.now() - cached.timestamp > (cached.timeout || this.cacheTimeout);
        if (isExpired) {
            this.cache.delete(key);
            return null;
        }

        // Update access time for LRU-like behavior
        cached.lastAccessed = Date.now();
        return cached;
    }

    setCachedResult(key, data, customTimeout = null) {
        // Implement LRU eviction if cache is full
        if (this.cache.size >= this.maxCacheSize) {
            const entries = Array.from(this.cache.entries());
            entries.sort(([, a], [, b]) => (a.lastAccessed || a.timestamp) - (b.lastAccessed || b.timestamp));

            // Remove oldest 10% of entries
            const entriesToRemove = Math.ceil(this.maxCacheSize * 0.1);
            for (let i = 0; i < entriesToRemove; i++) {
                this.cache.delete(entries[i][0]);
            }
        }

        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            lastAccessed: Date.now(),
            timeout: customTimeout || this.cacheTimeout
        });
    }

    // Enhanced health check with detailed status
    async healthCheck() {
        const spotifyConfig = config.spotify || config.apis?.spotify;

        try {
            if (!spotifyConfig || (!spotifyConfig.enabled && spotifyConfig.enabled !== undefined)) {
                return {
                    healthy: false,
                    reason: 'Spotify integration disabled in config',
                    timestamp: new Date().toISOString()
                };
            }

            if (!spotifyConfig.clientId || !spotifyConfig.clientSecret) {
                return {
                    healthy: false,
                    reason: 'Missing Spotify credentials',
                    timestamp: new Date().toISOString()
                };
            }

            if (!this.accessToken) {
                await this.refreshAccessToken();
            }

            // Test API with a minimal request
            const startTime = Date.now();
            await this.makeSpotifyRequest('/browse/categories?limit=1');
            const responseTime = Date.now() - startTime;

            return {
                healthy: true,
                tokenValid: !!this.accessToken,
                tokenExpiry: new Date(this.tokenExpiry).toISOString(),
                responseTime,
                cacheSize: this.cache.size,
                lastRequest: new Date(this.lastRequestTime).toISOString(),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                healthy: false,
                reason: error.message,
                tokenValid: !!this.accessToken,
                timestamp: new Date().toISOString(),
                errorType: error.name || 'Unknown'
            };
        }
    }

    // Graceful shutdown
    async shutdown() {
        log.info('Shutting down Spotify helper...');

        // Clear cache
        this.cache.clear();

        // Reset tokens
        this.accessToken = null;
        this.tokenExpiry = null;

        log.info('Spotify helper shutdown complete');
    }
}

// Create a singleton instance
const spotifyHelper = new SpotifyHelper();

// Graceful shutdown handling
process.on('SIGINT', async () => {
    await spotifyHelper.shutdown();
});

process.on('SIGTERM', async () => {
    await spotifyHelper.shutdown();
});

// Export both the instance and the class
module.exports = spotifyHelper;
module.exports.SpotifyHelper = SpotifyHelper;