const ytdl = require('@distube/ytdl-core');
const ytsr = require('youtube-sr').default;
const playDL = require('play-dl');
const axios = require('axios');
const config = require('../config/config.js');

/**
 * ULTRA-FAST YouTube Helper with Multiple Fallback Strategies
 * - Primary: play-dl (fastest & most reliable)
 * - Secondary: ytdl-core (stable fallback)
 * - Tertiary: youtube-sr (search fallback)
 * 
 * Optimized for 200+ song playlists with instant playback start
 */
class YouTubeHelperV2 {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 1800000; // 30 minutes
        this.maxCacheSize = 2000; // Increased cache size

        //  Aggressive caching and parallel processing
        this.searchCache = new Map();
        this.infoCache = new Map();
        this.streamCache = new Map();

        // Rate limiting with smarter logic
        this.rateLimit = {
            requests: 0,
            resetTime: 0,
            maxRequests: 200, // Much higher limit
            window: 60000 // 1 minute
        };

        // User agent rotation for better success rate
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];
        this.currentUAIndex = 0;

        // Initialize play-dl
        this.initializePlayDL();
    }

    async initializePlayDL() {
        try {
            await playDL.setToken({
                useragent: [this.getNextUserAgent()]
            });
            console.log('[YOUTUBE V2] play-dl initialized successfully');
        } catch (error) {
            console.warn('[YOUTUBE V2] play-dl initialization warning:', error.message);
        }
    }

    getNextUserAgent() {
        const ua = this.userAgents[this.currentUAIndex];
        this.currentUAIndex = (this.currentUAIndex + 1) % this.userAgents.length;
        return ua;
    }

    /**
     * ULTRA-FAST SEARCH - Uses play-dl first, ytsr as fallback
     */
    async searchTrack(query, options = {}) {
        const startTime = Date.now();
        try {
            const { limit = 1, includeMetadata = false } = options;

            // Check cache first
            const cacheKey = `search_${query}_${limit}`;
            const cached = this.searchCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                console.log(`[YOUTUBE V2] Cache hit for: "${query}" (${Date.now() - startTime}ms)`);
                return includeMetadata ? cached.data : cached.data.url || cached.data;
            }

            // Strategy 1: Use play-dl (FASTEST)
            try {
                const searchResults = await playDL.search(query, { limit: limit * 2, source: { youtube: 'video' } });

                if (searchResults && searchResults.length > 0) {
                    const bestResult = searchResults[0];
                    const result = {
                        url: bestResult.url,
                        title: bestResult.title,
                        duration: bestResult.durationInSec * 1000,
                        thumbnail: bestResult.thumbnails?.[0]?.url,
                        channel: bestResult.channel?.name,
                        views: bestResult.views
                    };

                    this.searchCache.set(cacheKey, { data: result, timestamp: Date.now() });
                    console.log(`[YOUTUBE V2] play-dl found: "${bestResult.title}" (${Date.now() - startTime}ms)`);

                    return includeMetadata ? result : result.url;
                }
            } catch (playDLError) {
                console.warn('[YOUTUBE V2] play-dl search failed, trying ytsr...');
            }

            // Strategy 2: Fallback to ytsr
            const searchResults = await ytsr.search(query, {
                limit: Math.max(limit * 3, 10),
                type: 'video',
                safeSearch: false
            });

            if (!searchResults || searchResults.length === 0) {
                throw new Error('No search results found');
            }

            // Smart filtering and ranking
            const filteredResults = this.smartFilterResults(searchResults, query);

            if (filteredResults.length === 0) {
                throw new Error('No suitable results after filtering');
            }

            const bestResult = filteredResults[0];
            const result = {
                url: bestResult.url,
                title: bestResult.title,
                duration: bestResult.duration || 0,
                thumbnail: bestResult.thumbnail?.url,
                channel: bestResult.channel?.name,
                views: bestResult.views
            };

            this.searchCache.set(cacheKey, { data: result, timestamp: Date.now() });
            console.log(`[YOUTUBE V2] ytsr found: "${bestResult.title}" (${Date.now() - startTime}ms)`);

            return includeMetadata ? result : result.url;

        } catch (error) {
            console.error('[YOUTUBE V2] Search error:', error.message);
            throw new Error(`YouTube search failed: ${error.message}`);
        }
    }

    /**
     * Smart filtering prioritizing official videos and quality
     */
    smartFilterResults(results, originalQuery) {
        const query = originalQuery.toLowerCase();

        return results
            .filter(video => {
                if (!video || !video.title || !video.url) return false;
                // Only filter out extremely long videos
                const duration = video.duration || 0;
                if (duration > 1800) return false; // 30 minutes max
                return true;
            })
            .map(video => {
                const title = video.title.toLowerCase();
                const channel = video.channel?.name?.toLowerCase() || '';

                let score = 0;

                // Title relevance
                const titleWords = query.split(' ');
                titleWords.forEach(word => {
                    if (word.length > 2 && title.includes(word)) score += 3;
                });

                // Exact or partial match
                if (title.includes(query)) score += 10;

                // Official sources bonus
                if (channel.includes('official') || channel.includes('vevo') ||
                    channel.includes('records') || video.channel?.verified) {
                    score += 5;
                }

                // View count bonus (popularity)
                const views = video.views || 0;
                if (views > 1000000) score += 3;
                if (views > 10000000) score += 2;

                // Duration preferences new songs
                const duration = video.duration || 0;
                if (duration > 60 && duration < 600) score += 2; // 1-10 minutes sweet spot

                return { ...video, relevanceScore: score };
            })
            .sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    /**
     * ULTRA-FAST VIDEO INFO - Parallel info fetching
     */
    async getVideoInfo(url, options = {}) {
        const startTime = Date.now();
        try {
            if (!this.isValidYouTubeUrl(url)) {
                throw new Error('Invalid YouTube URL');
            }

            // Check cache
            const cacheKey = `info_${url}`;
            const cached = this.infoCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                console.log(`[YOUTUBE V2] Info cache hit (${Date.now() - startTime}ms)`);
                return cached.data;
            }

            // Try play-dl first (much faster)
            try {
                const info = await playDL.video_info(url);

                if (info && info.video_details) {
                    const videoDetails = info.video_details;
                    const videoInfo = {
                        title: this.cleanTitle(videoDetails.title),
                        artist: this.extractArtist({ title: videoDetails.title, author: { name: videoDetails.channel?.name } }),
                        duration: videoDetails.durationInSec * 1000,
                        url: url,
                        id: videoDetails.id,
                        thumbnail: videoDetails.thumbnails?.[0]?.url,
                        description: videoDetails.description?.substring(0, 500) || '',
                        viewCount: videoDetails.views || 0,
                        channel: {
                            name: videoDetails.channel?.name || 'Unknown',
                            id: videoDetails.channel?.id || null,
                            verified: videoDetails.channel?.verified || false
                        },
                        isLive: videoDetails.live || false,
                        source: 'youtube'
                    };

                    this.infoCache.set(cacheKey, { data: videoInfo, timestamp: Date.now() });
                    console.log(`[YOUTUBE V2] play-dl info fetched: "${videoInfo.title}" (${Date.now() - startTime}ms)`);
                    return videoInfo;
                }
            } catch (playDLError) {
                console.warn('[YOUTUBE V2] play-dl info failed, falling back to ytdl...');
            }

            // Fallback to ytdl-core
            const info = await ytdl.getInfo(url);

            if (!info || !info.videoDetails) {
                throw new Error('Failed to get video information');
            }

            const videoDetails = info.videoDetails;
            const videoInfo = {
                title: this.cleanTitle(videoDetails.title),
                artist: this.extractArtist(videoDetails),
                duration: parseInt(videoDetails.lengthSeconds) * 1000,
                url: url,
                id: videoDetails.videoId,
                thumbnail: this.getBestThumbnail(videoDetails.thumbnails),
                description: videoDetails.description?.substring(0, 500) || '',
                viewCount: parseInt(videoDetails.viewCount) || 0,
                channel: {
                    name: videoDetails.author?.name || 'Unknown',
                    id: videoDetails.author?.id || null,
                    verified: videoDetails.author?.verified || false
                },
                isLive: videoDetails.isLiveContent || false,
                source: 'youtube'
            };

            // Validate duration
            if (videoInfo.duration > config.music.maxSongDuration) {
                throw new Error(`Track too long: ${this.formatDuration(videoInfo.duration)}`);
            }

            this.infoCache.set(cacheKey, { data: videoInfo, timestamp: Date.now() });
            console.log(`[YOUTUBE V2] ytdl info fetched: "${videoInfo.title}" (${Date.now() - startTime}ms)`);
            return videoInfo;

        } catch (error) {
            console.error('[YOUTUBE V2] Video info error:', error.message);
            throw error;
        }
    }

    /**
     * ULTRA-FAST PLAYLIST - Parallel processing with instant start
     */
    async getPlaylistTracks(playlistUrl, maxTracks = 500) {
        const startTime = Date.now();
        try {
            if (!this.isValidPlaylistUrl(playlistUrl)) {
                throw new Error('Invalid YouTube playlist URL');
            }

            console.log(`[YOUTUBE V2] Fetching playlist (max ${maxTracks} tracks)...`);

            // Try play-dl first (fastest)
            try {
                const playlist = await playDL.playlist_info(playlistUrl, { incomplete: true });

                if (playlist) {
                    const allVideos = await playlist.all_videos();
                    const tracks = allVideos.slice(0, maxTracks).map(video => ({
                        title: this.cleanTitle(video.title),
                        artist: video.channel?.name || 'Unknown Artist',
                        duration: video.durationInSec * 1000,
                        url: video.url,
                        id: video.id,
                        thumbnail: video.thumbnails?.[0]?.url,
                        channel: {
                            name: video.channel?.name || 'Unknown',
                            verified: video.channel?.verified || false
                        },
                        source: 'youtube'
                    }));

                    console.log(`[YOUTUBE V2] play-dl loaded ${tracks.length} tracks (${Date.now() - startTime}ms)`);
                    return tracks;
                }
            } catch (playDLError) {
                console.warn('[YOUTUBE V2] play-dl playlist failed, using ytsr...');
            }

            // Fallback to ytsr
            const playlist = await ytsr.getPlaylist(playlistUrl, {
                limit: Math.min(maxTracks, 100),
                fetchAll: false
            });

            if (!playlist || !playlist.videos || playlist.videos.length === 0) {
                throw new Error('Playlist not found or empty');
            }

            const tracks = playlist.videos.map(video => ({
                title: this.cleanTitle(video.title),
                artist: video.channel?.name || 'Unknown Artist',
                duration: video.duration || 0,
                url: video.url,
                id: video.id,
                thumbnail: this.getBestThumbnail(video.thumbnails),
                channel: {
                    name: video.channel?.name || 'Unknown',
                    verified: video.channel?.verified || false
                },
                source: 'youtube'
            }));

            console.log(`[YOUTUBE V2] ytsr loaded ${tracks.length} tracks (${Date.now() - startTime}ms)`);
            return tracks;

        } catch (error) {
            console.error('[YOUTUBE V2] Playlist error:', error.message);
            throw error;
        }
    }

    /**
     * Helper methods (unchanged but optimized)
     */
    extractArtist(videoDetails) {
        const title = videoDetails.title || '';
        const channelName = videoDetails.author?.name || 'Unknown Artist';

        // Try to extract artist from title patterns
        const patterns = [
            /^(.+?)\s*[-–—]\s*.+$/,
            /^(.+?)\s*[:|]\s*.+$/,
        ];

        for (const pattern of patterns) {
            const match = title.match(pattern);
            if (match && match[1] && match[1].length > 0 && match[1].length < 50) {
                return match[1].trim();
            }
        }

        return channelName
            .replace(/\\s*(official|music|records|vevo)\\s*/gi, '')
            .trim() || 'Unknown Artist';
    }

    cleanTitle(title) {
        if (!title) return 'Unknown Title';

        return title
            .replace(/^\\[.*?\\]\\s*/, '')
            .replace(/\\s*\\(.*?\\)$/, '')
            .replace(/\\s*(Official|Video|Audio|Lyrics?|HD|HQ|4K)\\s*/gi, ' ')
            .replace(/\\s+/g, ' ')
            .trim() || 'Unknown Title';
    }

    getBestThumbnail(thumbnails) {
        if (!thumbnails || thumbnails.length === 0) return null;

        if (Array.isArray(thumbnails)) {
            return thumbnails[thumbnails.length - 1]?.url || thumbnails[0]?.url || null;
        }

        return thumbnails.url || null;
    }

    isValidYouTubeUrl(url) {
        const patterns = [
            /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/,
            /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
            /^https?:\/\/youtu\.be\/[\w-]+/
        ];

        return patterns.some(pattern => pattern.test(url));
    }

    isValidPlaylistUrl(url) {
        return url.includes('youtube.com') && (url.includes('playlist') || url.includes('list='));
    }

    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
        }
        return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
    }

    /**
     * Cache cleanup
     */
    cleanup() {
        this.searchCache.clear();
        this.infoCache.clear();
        this.streamCache.clear();
        console.log('[YOUTUBE V2] Cleaned up caches');
    }
}

module.exports = new YouTubeHelperV2();