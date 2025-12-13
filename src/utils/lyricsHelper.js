const axios = require('axios');
const cheerio = require('cheerio');
const config = require('../config/config.js');
const SpotifyHelper = require('./spotifyHelper.js');

class LyricsHelper {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 3600000; // 1 hour
        this.maxCacheSize = 500;

        // Rate limiting
        this.rateLimits = {
            lrclib: { requests: 0, resetTime: 0 },
            genius: { requests: 0, resetTime: 0 },
            lyricsapi: { requests: 0, resetTime: 0 }
        };

        // Fallback sources - LRCLIB first (free, no scraping, synced lyrics)
        this.sources = [
            { name: 'lrclib', priority: 0, withTimestamps: true },
            { name: 'genius', priority: 1, withTimestamps: true },
            { name: 'lyricsapi', priority: 2, withTimestamps: false },
            { name: 'musixmatch', priority: 3, withTimestamps: true }
        ];
    }

    /**
     * Get lyrics for a track with multiple fallback sources
     * @param {Object} track - Track object with title and artist
     * @param {Object} options - Options for lyrics retrieval
     * @returns {String|null} - Lyrics text or null if not found
     */
    async getLyrics(track, options = {}) {
        try {
            const { preferTimestamps = false, source = 'auto' } = options;

            // Normalize track object - handle different property names
            const normalizedTrack = this.normalizeTrackObject(track);

            if (!normalizedTrack.title || !normalizedTrack.artist) {
                console.warn('[LYRICS] Invalid track object:', {
                    title: normalizedTrack.title,
                    artist: normalizedTrack.artist,
                    originalTrack: Object.keys(track)
                });
                return null;
            }

            // Generate cache key
            const cacheKey = this.generateCacheKey(normalizedTrack, { preferTimestamps });

            // Check cache first
            const cached = this.getFromCache(cacheKey);
            if (cached) {
                return cached;
            }

            let lyrics = null;
            const errors = [];

            // Try specific source if requested
            if (source !== 'auto') {
                try {
                    lyrics = await this.getLyricsFromSource(normalizedTrack, source, { preferTimestamps });
                } catch (error) {
                    errors.push(`${source}: ${error.message}`);
                }
            } else {
                // Try all sources in order of priority
                const sortedSources = this.sources
                    .filter(s => !preferTimestamps || s.withTimestamps)
                    .sort((a, b) => a.priority - b.priority);

                for (const sourceConfig of sortedSources) {
                    if (!this.checkRateLimit(sourceConfig.name)) {
                        console.warn(`[LYRICS] Rate limit exceeded for ${sourceConfig.name}`);
                        continue;
                    }

                    try {
                        lyrics = await this.getLyricsFromSource(normalizedTrack, sourceConfig.name, { preferTimestamps });

                        if (lyrics) {
                            console.log(`[LYRICS] Found lyrics using ${sourceConfig.name}`);
                            break;
                        }
                    } catch (error) {
                        errors.push(`${sourceConfig.name}: ${error.message}`);
                        console.warn(`[LYRICS] ${sourceConfig.name} failed:`, error.message);
                        continue;
                    }
                }
            }

            // Cache successful results
            if (lyrics) {
                this.setCache(cacheKey, lyrics);
            } else {
                console.warn(`[LYRICS] No lyrics found for "${normalizedTrack.title}" by ${normalizedTrack.artist}. Errors:`, errors);
            }

            return lyrics;

        } catch (error) {
            console.error('[LYRICS] Error getting lyrics:', error);
            return null;
        }
    }

    /**
     * Normalize track object to handle different property names
     */
    normalizeTrackObject(track) {
        if (!track || typeof track !== 'object') {
            return { title: '', artist: '' };
        }

        // Try to get clean data from Spotify first (better than YouTube channel names)
        let artist = '';
        if (track.spotifyData?.artists?.[0]?.name) {
            artist = track.spotifyData.artists[0].name;
        } else if (track.artists?.[0]?.name) {
            artist = track.artists[0].name;
        } else if (track.artist) {
            artist = track.artist;
        } else if (track.artistName) {
            artist = track.artistName;
        }

        // Fall back to uploader/channel only if no artist found
        if (!artist && (track.uploader || track.channel || track.author)) {
            artist = track.uploader || track.channel || track.author || '';
        }

        // Get title
        let title = track.spotifyData?.name || track.title || track.name || track.trackName || track.song || '';

        // Try to extract artist from title if it has "Artist - Song" format
        if ((!artist || artist.toLowerCase().includes('vevo') || artist.toLowerCase().includes('topic')) && title.includes(' - ')) {
            const parts = title.split(' - ');
            if (parts.length >= 2) {
                // First part is usually the artist
                const possibleArtist = parts[0].trim();
                const possibleTitle = parts.slice(1).join(' - ').trim();

                // Only use if the parts make sense
                if (possibleArtist.length > 2 && possibleTitle.length > 2) {
                    artist = possibleArtist;
                    title = possibleTitle;
                }
            }
        }

        return {
            title: this.cleanString(title),
            artist: this.cleanString(artist),
            originalTrack: track
        };
    }

    /**
     * Clean and normalize strings for better matching
     */
    cleanString(str) {
        if (!str || typeof str !== 'string') return '';

        return str
            .replace(/\([^)]*\)/g, '') // Remove content in parentheses like (Audio), (Official Video)
            .replace(/\[[^\]]*\]/g, '') // Remove content in brackets like [Official]
            .replace(/feat\.|ft\.|featuring/gi, '') // Remove featuring
            .replace(/official|video|audio|lyrics|lyric|hd|hq|4k|1080p|720p/gi, '') // Remove common keywords
            .replace(/vevo|topic|records|music|entertainment/gi, '') // Remove YouTube channel suffixes
            .replace(/\s*-\s*$/g, '') // Remove trailing dash
            .replace(/[^\w\s]/g, ' ') // Replace special chars with spaces
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
    }

    /**
     * Get timed lyrics for karaoke mode
     * @param {Object} track - Track object
     * @returns {Object|null} - Timed lyrics object or null
     */
    async getTimedLyrics(track) {
        try {
            if (!config.isFeatureEnabled('lyrics.enableKaraoke')) {
                return null;
            }

            // Get track duration in ms
            let trackDuration = null;
            if (track.duration) {
                // Duration could be in seconds or ms
                trackDuration = track.duration > 1000 ? track.duration : track.duration * 1000;
            } else if (track.durationMs) {
                trackDuration = track.durationMs;
            }

            // Try to get Spotify track analysis first
            let spotifyData = null;
            if (track.source === 'spotify' || track.spotifyId) {
                try {
                    spotifyData = await SpotifyHelper.getTrackAnalysis(track.spotifyId || track.id);
                } catch (error) {
                    console.warn('[LYRICS] Failed to get Spotify analysis:', error.message);
                }
            }

            // Get lyrics with timestamps preference
            const lyrics = await this.getLyrics(track, { preferTimestamps: true });

            if (!lyrics) {
                return null;
            }

            // Parse timed lyrics with duration
            const timedLyrics = this.parseTimedLyrics(lyrics, spotifyData, trackDuration);

            if (timedLyrics) {
                console.log(`[KARAOKE] Prepared ${timedLyrics.lineCount} lines, synced: ${timedLyrics.syncedToDuration}`);
            }

            return timedLyrics;

        } catch (error) {
            console.error('[LYRICS] Error getting timed lyrics:', error);
            return null;
        }
    }

    /**
     * Get lyrics from specific source
     */
    async getLyricsFromSource(track, source, options = {}) {
        this.updateRateLimit(source);

        switch (source) {
            case 'lrclib':
                return await this.getLyricsFromLRCLIB(track, options);
            case 'genius':
                return await this.getLyricsFromGenius(track, options);
            case 'lyricsapi':
                return await this.getLyricsFromLyricsAPI(track, options);
            case 'musixmatch':
                return await this.getLyricsFromMusixmatch(track, options);
            default:
                throw new Error(`Unknown lyrics source: ${source}`);
        }
    }

    /**
     * Get lyrics from LRCLIB (free, no API key, synced lyrics support)
     * https://lrclib.net/docs
     */
    async getLyricsFromLRCLIB(track, options = {}) {
        try {
            const { title, artist } = track;

            if (!title || !artist) {
                throw new Error('Missing title or artist for LRCLIB search');
            }

            console.log(`[LYRICS] LRCLIB: Searching for "${title}" by "${artist}"`);

            // LRCLIB API endpoint - simple GET request
            const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;

            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Rya-Discord-Bot/2.0 (https://github.com/ItzMeh679/Rya)'
                },
                timeout: 8000,
                validateStatus: (status) => status < 500 // Don't throw on 404
            });

            // Handle 404 (not found)
            if (response.status === 404 || !response.data) {
                console.log(`[LYRICS] LRCLIB: No lyrics found for "${title}"`);
                return null;
            }

            // Prefer synced lyrics (LRC format with timestamps), fall back to plain
            const lyrics = response.data.syncedLyrics || response.data.plainLyrics;

            if (!lyrics || lyrics.trim().length < 10) {
                console.log(`[LYRICS] LRCLIB: Empty or too short lyrics for "${title}"`);
                return null;
            }

            // If we got synced lyrics, strip the timestamps for display
            // (they look like [00:12.34] at the start of each line)
            let cleanLyrics = lyrics;
            if (response.data.syncedLyrics) {
                cleanLyrics = lyrics
                    .split('\n')
                    .map(line => line.replace(/^\[\d{2}:\d{2}\.\d{2,3}\]\s*/, ''))
                    .filter(line => line.trim())
                    .join('\n');
                console.log(`[LYRICS] LRCLIB: Got synced lyrics for "${title}"`);
            } else {
                console.log(`[LYRICS] LRCLIB: Got plain lyrics for "${title}"`);
            }

            return cleanLyrics;

        } catch (error) {
            console.error('[LYRICS] LRCLIB error:', error.message);
            throw new Error(`LRCLIB API error: ${error.message}`);
        }
    }

    /**
     * Get lyrics from Genius API with web scraping
     */
    async getLyricsFromGenius(track, options = {}) {
        try {
            const geniusConfig = config.getApiConfig('genius');
            if (!geniusConfig?.accessToken) {
                throw new Error('Genius access token not configured');
            }

            // Search for song on Genius
            const searchUrl = `${geniusConfig.apiUrl}${geniusConfig.searchEndpoint}`;
            const searchQuery = `${track.artist} ${track.title}`.trim();

            if (!searchQuery || searchQuery.length < 3) {
                throw new Error('Search query too short or empty');
            }

            const searchResponse = await axios.get(searchUrl, {
                params: { q: searchQuery },
                headers: {
                    'Authorization': `Bearer ${geniusConfig.accessToken}`,
                    'User-Agent': 'Advanced-Discord-Music-Bot/1.0'
                },
                timeout: 10000
            });

            const hits = searchResponse.data?.response?.hits;
            if (!hits || hits.length === 0) {
                throw new Error('No search results found');
            }

            // Find best match
            const bestMatch = this.findBestMatch(hits, track);
            if (!bestMatch) {
                throw new Error('No suitable match found');
            }

            // Get song details
            const songUrl = `${geniusConfig.apiUrl}${geniusConfig.songEndpoint}/${bestMatch.result.id}`;
            const songResponse = await axios.get(songUrl, {
                headers: {
                    'Authorization': `Bearer ${geniusConfig.accessToken}`,
                    'User-Agent': 'Advanced-Discord-Music-Bot/1.0'
                },
                timeout: 10000
            });

            const songData = songResponse.data?.response?.song;
            if (!songData?.url) {
                throw new Error('No song URL found');
            }

            // Scrape lyrics from Genius website
            const lyrics = await this.scrapeLyricsFromGenius(songData.url, options);

            return lyrics;

        } catch (error) {
            console.error('[LYRICS] Genius error:', error);
            throw new Error(`Genius API error: ${error.message}`);
        }
    }

    /**
     * Scrape lyrics directly from Genius website
     */
    async scrapeLyricsFromGenius(url, options = {}) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                },
                timeout: 15000
            });

            const $ = cheerio.load(response.data);

            // Try multiple selectors for lyrics container
            const selectors = [
                '[data-lyrics-container="true"]',
                '.Lyrics__Container-sc-1ynbvzw-1',
                '.lyrics',
                '[class*="Lyrics__Container"]'
            ];

            let lyricsHtml = '';

            for (const selector of selectors) {
                const elements = $(selector);
                if (elements.length > 0) {
                    elements.each((i, elem) => {
                        lyricsHtml += $(elem).html() + '\n';
                    });
                    break;
                }
            }

            if (!lyricsHtml) {
                throw new Error('Could not find lyrics container on page');
            }

            // Clean up and format lyrics
            let lyrics = lyricsHtml
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/?[^>]+(>|$)/g, '')
                .replace(/\[([^\]]+)\]/g, '\n[$1]\n')
                .replace(/\n\s*\n/g, '\n\n')
                .trim();

            // Decode HTML entities
            lyrics = this.decodeHtmlEntities(lyrics);

            if (!lyrics || lyrics.length < 10) {
                throw new Error('Extracted lyrics appear to be empty or too short');
            }

            return lyrics;

        } catch (error) {
            console.error('[LYRICS] Genius scraping error:', error);
            throw new Error(`Failed to scrape Genius: ${error.message}`);
        }
    }

    /**
     * Get lyrics from LyricsAPI with fallback
     */
    async getLyricsFromLyricsAPI(track, options = {}) {
        const lyricsConfig = config.getApiConfig('lyricsApi');

        // Updated working API endpoints
        const urls = [
            'https://api.lyrics.ovh/v1',
            'https://lyrist.vercel.app/api',
            'https://lyrics-api.vercel.app/api'
        ].filter(Boolean);

        for (const baseUrl of urls) {
            try {
                let url;

                if (baseUrl.includes('lyrics.ovh')) {
                    url = `${baseUrl}/${encodeURIComponent(track.artist)}/${encodeURIComponent(track.title)}`;
                } else {
                    // For other APIs that might have different formats
                    url = `${baseUrl}/lyrics?artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(track.title)}`;
                }

                const response = await axios.get(url, {
                    timeout: lyricsConfig?.timeout || 10000,
                    headers: {
                        'User-Agent': 'Advanced-Discord-Music-Bot/1.0'
                    }
                });

                let lyrics = null;

                if (response.data && response.data.lyrics) {
                    lyrics = response.data.lyrics;
                } else if (response.data && typeof response.data === 'string') {
                    lyrics = response.data;
                }

                if (lyrics && lyrics.trim().length > 10) {
                    // Clean up common artifacts
                    lyrics = lyrics
                        .replace(/\r\n/g, '\n')
                        .replace(/\n\s*\n/g, '\n\n')
                        .trim();

                    return lyrics;
                }

            } catch (error) {
                console.warn(`[LYRICS] LyricsAPI failed for ${baseUrl}:`, error.message);
                continue;
            }
        }

        throw new Error('All LyricsAPI sources failed');
    }

    /**
     * Get lyrics from Musixmatch (with timestamps support)
     */
    async getLyricsFromMusixmatch(track, options = {}) {
        try {
            // This is a placeholder for Musixmatch integration
            // Musixmatch requires API key and has specific terms of service
            throw new Error('Musixmatch integration not implemented - requires API key');
        } catch (error) {
            throw new Error(`Musixmatch error: ${error.message}`);
        }
    }

    /**
     * Parse timed lyrics for karaoke mode with improved timing
     */
    parseTimedLyrics(lyrics, spotifyData = null, trackDuration = null) {
        try {
            const lines = lyrics.split('\n').filter(line => line.trim() && !line.match(/^\[[^\]]+\]$/)); // Filter empty lines and section headers
            const timestamps = [];

            // Get track duration in ms (from Spotify data or passed directly)
            let durationMs = trackDuration;
            if (!durationMs && spotifyData?.track?.duration) {
                durationMs = spotifyData.track.duration;
            }

            // If we have actual duration, distribute lines evenly across the song
            if (durationMs && durationMs > 0) {
                // Account for intro (first 10% of song usually no lyrics)
                const introTime = durationMs * 0.05; // 5% intro
                const outroTime = durationMs * 0.02; // 2% outro
                const lyricsTime = durationMs - introTime - outroTime;
                const lineTime = lyricsTime / lines.length;

                let currentTime = introTime;

                lines.forEach((line, index) => {
                    if (line.trim()) {
                        // Vary line duration slightly based on word count
                        const wordCount = line.split(' ').length;
                        const baseDuration = lineTime;
                        const adjustment = Math.min(wordCount * 100, baseDuration * 0.3); // Up to 30% adjustment
                        const duration = baseDuration + (wordCount > 5 ? adjustment * 0.5 : -adjustment * 0.3);

                        timestamps.push({
                            time: currentTime,
                            text: line.trim(),
                            duration: Math.max(duration, 1500), // Min 1.5 seconds
                            confidence: 0.85, // Higher confidence with duration sync
                            lineIndex: index
                        });
                        currentTime += lineTime;
                    }
                });

                console.log(`[KARAOKE] Synced ${lines.length} lines to ${Math.round(durationMs / 1000)}s track`);

            } else if (spotifyData && spotifyData.segments) {
                // Use Spotify segments for timing
                const avgSegmentDuration = spotifyData.track?.duration / spotifyData.segments.length || 3000;
                let currentTime = 0;

                lines.forEach((line, index) => {
                    if (line.trim()) {
                        timestamps.push({
                            time: currentTime,
                            text: line.trim(),
                            duration: avgSegmentDuration,
                            confidence: 0.8,
                            lineIndex: index
                        });
                        currentTime += avgSegmentDuration;
                    }
                });
            } else {
                // Fallback: Better estimation with musical pacing
                // Average song is 3:30 = 210s, average lines = 40-60
                const estimatedSongDuration = 210000; // 3:30 in ms
                const introTime = 15000; // 15 second intro estimate
                const lineTime = (estimatedSongDuration - introTime) / Math.max(lines.length, 1);
                let currentTime = introTime;

                lines.forEach((line, index) => {
                    if (line.trim()) {
                        const wordCount = line.split(' ').length;
                        // Faster for shorter lines, slower for longer
                        const adjustedDuration = lineTime * (0.7 + (wordCount / 20));

                        timestamps.push({
                            time: currentTime,
                            text: line.trim(),
                            duration: Math.max(Math.min(adjustedDuration, 5000), 2000), // 2-5 seconds
                            confidence: 0.6,
                            lineIndex: index
                        });

                        currentTime += adjustedDuration;
                    }
                });
            }

            return {
                lyrics: lyrics,
                timestamps: timestamps,
                totalDuration: timestamps.reduce((acc, t) => acc + t.duration, 0),
                lineCount: timestamps.length,
                hasRealTimestamps: !!spotifyData || !!durationMs,
                syncedToDuration: !!durationMs
            };

        } catch (error) {
            console.error('[LYRICS] Error parsing timed lyrics:', error);
            return null;
        }
    }

    /**
     * Find best match from search results - FIXED VERSION
     */
    findBestMatch(hits, track) {
        if (!hits || !Array.isArray(hits) || hits.length === 0) {
            return null;
        }

        const trackTitle = (track.title || '').toLowerCase();
        const trackArtist = (track.artist || '').toLowerCase();

        if (!trackTitle && !trackArtist) {
            console.warn('[LYRICS] No title or artist to match against');
            return null;
        }

        let bestMatch = null;
        let bestScore = 0;

        for (const hit of hits) {
            try {
                const result = hit?.result;
                if (!result) continue;

                const title = (result.title || result.full_title || '').toLowerCase();
                const artist = (result.primary_artist?.name || result.artist || '').toLowerCase();

                // Skip if we don't have basic info
                if (!title && !artist) continue;

                // Calculate similarity score
                const titleScore = trackTitle ? this.calculateSimilarity(trackTitle, title) : 0;
                const artistScore = trackArtist ? this.calculateSimilarity(trackArtist, artist) : 0;

                // Weight title more heavily, but require some artist match if available
                let totalScore;
                if (trackTitle && trackArtist) {
                    totalScore = (titleScore * 0.7) + (artistScore * 0.3);
                } else if (trackTitle) {
                    totalScore = titleScore * 0.9; // Slightly penalize missing artist
                } else {
                    totalScore = artistScore * 0.5; // Much lower score for artist-only match
                }

                if (totalScore > bestScore && totalScore > 0.4) { // Lower threshold since we're more lenient
                    bestScore = totalScore;
                    bestMatch = hit;
                }
            } catch (error) {
                console.warn('[LYRICS] Error processing search result:', error);
                continue;
            }
        }

        if (bestMatch) {
            console.log(`[LYRICS] Best match found with score ${bestScore.toFixed(2)}: ${bestMatch.result.title} by ${bestMatch.result.primary_artist?.name}`);
        }

        return bestMatch;
    }

    /**
     * Calculate string similarity using Levenshtein distance
     */
    calculateSimilarity(str1, str2) {
        if (!str1 || !str2 || typeof str1 !== 'string' || typeof str2 !== 'string') {
            return 0;
        }

        // Normalize strings for better comparison
        str1 = str1.toLowerCase().trim();
        str2 = str2.toLowerCase().trim();

        if (str1 === str2) return 1;
        if (str1.length === 0 || str2.length === 0) return 0;

        const matrix = [];
        const len1 = str1.length;
        const len2 = str2.length;

        for (let i = 0; i <= len2; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= len1; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= len2; i++) {
            for (let j = 1; j <= len1; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        const distance = matrix[len2][len1];
        const maxLen = Math.max(len1, len2);
        return maxLen === 0 ? 1 : (maxLen - distance) / maxLen;
    }

    /**
     * Decode HTML entities
     */
    decodeHtmlEntities(text) {
        if (!text || typeof text !== 'string') return '';

        const entities = {
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&#039;': "'",
            '&#39;': "'",
            '&nbsp;': ' ',
            '&mdash;': '—',
            '&ndash;': '–',
            '&hellip;': '…'
        };

        return text.replace(/&[^;]+;/g, match => entities[match] || match);
    }

    /**
     * Cache management
     */
    generateCacheKey(track, options = {}) {
        const key = `${track.artist || 'unknown'}-${track.title || 'unknown'}-${JSON.stringify(options)}`;
        return key.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
    }

    getFromCache(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }

        this.cache.delete(key);
        return null;
    }

    setCache(key, data) {
        // Clean cache if it gets too large
        if (this.cache.size >= this.maxCacheSize) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }

        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Rate limiting
     */
    checkRateLimit(source) {
        const sourceConfig = config.getApiConfig(source);
        if (!sourceConfig?.rateLimit) return true;

        const limit = this.rateLimits[source];
        const now = Date.now();

        if (now > limit.resetTime) {
            limit.requests = 0;
            limit.resetTime = now + sourceConfig.rateLimit.window;
        }

        return limit.requests < sourceConfig.rateLimit.requests;
    }

    updateRateLimit(source) {
        if (!this.rateLimits[source]) {
            this.rateLimits[source] = { requests: 0, resetTime: 0 };
        }
        this.rateLimits[source].requests++;
    }

    /**
     * Get lyrics statistics
     */
    getStats() {
        return {
            cacheSize: this.cache.size,
            maxCacheSize: this.maxCacheSize,
            cacheTimeout: this.cacheTimeout,
            availableSources: this.sources.map(s => s.name),
            rateLimits: Object.entries(this.rateLimits).map(([source, data]) => ({
                source,
                requests: data.requests,
                resetTime: new Date(data.resetTime).toISOString()
            }))
        };
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        this.cache.clear();
        console.log('[LYRICS] Cleaned up lyrics resources');
    }
}

module.exports = new LyricsHelper();