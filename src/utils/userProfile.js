// src/utils/userProfile.js - User taste profile system
// Builds personalized music profiles from listening history

const cacheManager = require('./cacheManager.js');

/**
 * User Music Profile System
 * Tracks and analyzes user preferences for better recommendations
 */
class UserProfile {
    constructor() {
        this.profiles = new Map();
        this.genreWeights = {
            'pop': 1.0,
            'rock': 1.0,
            'hip-hop': 1.0,
            'rap': 1.0,
            'electronic': 1.0,
            'edm': 1.0,
            'house': 1.0,
            'techno': 1.0,
            'jazz': 1.0,
            'classical': 1.0,
            'country': 1.0,
            'r&b': 1.0,
            'soul': 1.0,
            'indie': 1.0,
            'alternative': 1.0,
            'metal': 1.0,
            'punk': 1.0,
            'folk': 1.0,
            'blues': 1.0,
            'reggae': 1.0,
            'latin': 1.0,
            'kpop': 1.0,
            'jpop': 1.0,
            'anime': 1.0,
            'lofi': 1.0,
            'ambient': 1.0,
            'soundtrack': 1.0,
            'gaming': 1.0
        };
    }

    /**
     * Get or create user profile
     */
    getProfile(userId) {
        if (!this.profiles.has(userId)) {
            this.profiles.set(userId, this.createEmptyProfile(userId));
        }
        return this.profiles.get(userId);
    }

    /**
     * Create empty profile structure
     */
    createEmptyProfile(userId) {
        return {
            userId,
            createdAt: Date.now(),
            lastUpdated: Date.now(),

            // Genre preferences (0-1 scale)
            genres: {},

            // Artist preferences
            topArtists: [],
            artistPlays: {},

            // Listening patterns
            peakHours: Array(24).fill(0),
            weekdayPatterns: Array(7).fill(0),

            // Audio preferences
            tempoPreference: 'medium', // slow, medium, fast
            moodProfile: {
                energetic: 0.5,
                calm: 0.5,
                happy: 0.5,
                melancholic: 0.5
            },

            // Quality preferences  
            preferredQuality: 'high',
            acousticVsElectronic: 0.5, // 0 = acoustic, 1 = electronic

            // Stats
            totalTracks: 0,
            totalDuration: 0,
            avgSessionLength: 0,
            skipRate: 0,
            completionRate: 1.0,

            // Discovery
            discoveryScore: 0.5, // 0 = plays same, 1 = tries new
            newArtistsThisMonth: 0,

            // Favorite decades
            decades: {
                '1960s': 0,
                '1970s': 0,
                '1980s': 0,
                '1990s': 0,
                '2000s': 0,
                '2010s': 0,
                '2020s': 0
            }
        };
    }

    /**
     * Update profile from a played track
     */
    updateFromTrack(userId, track, completed = true, skipped = false) {
        const profile = this.getProfile(userId);
        profile.lastUpdated = Date.now();
        profile.totalTracks++;

        // Update time patterns
        const now = new Date();
        profile.peakHours[now.getHours()]++;
        profile.weekdayPatterns[now.getDay()]++;

        // Update artist plays
        if (track.author || track.artist) {
            const artist = track.author || track.artist;
            profile.artistPlays[artist] = (profile.artistPlays[artist] || 0) + 1;

            // Update top artists
            this.updateTopArtists(profile);
        }

        // Update duration
        if (track.length) {
            profile.totalDuration += track.length;
        }

        // Update completion/skip rates
        if (skipped) {
            profile.skipRate = (profile.skipRate * (profile.totalTracks - 1) + 1) / profile.totalTracks;
            profile.completionRate = (profile.completionRate * (profile.totalTracks - 1)) / profile.totalTracks;
        } else if (completed) {
            profile.completionRate = (profile.completionRate * (profile.totalTracks - 1) + 1) / profile.totalTracks;
        }

        // Detect genre from track title/artist
        this.detectAndUpdateGenre(profile, track);

        // Update decade preference
        this.detectDecade(profile, track);

        return profile;
    }

    /**
     * Update top artists list
     */
    updateTopArtists(profile) {
        const sorted = Object.entries(profile.artistPlays)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([artist, plays]) => ({ artist, plays }));

        profile.topArtists = sorted;
    }

    /**
     * Detect genre from track info
     */
    detectAndUpdateGenre(profile, track) {
        const title = (track.title || '').toLowerCase();
        const artist = (track.author || track.artist || '').toLowerCase();
        const combined = `${title} ${artist}`;

        // Genre keywords detection
        const genreKeywords = {
            'lofi': ['lofi', 'lo-fi', 'lo fi', 'chill beats'],
            'hip-hop': ['hip hop', 'hip-hop', 'rapper', 'rap'],
            'electronic': ['edm', 'electronic', 'dubstep', 'bass'],
            'house': ['house', 'deep house', 'tech house'],
            'pop': ['pop'],
            'rock': ['rock', 'guitar'],
            'metal': ['metal', 'heavy'],
            'jazz': ['jazz', 'swing'],
            'classical': ['classical', 'symphony', 'orchestra'],
            'anime': ['anime', 'opening', 'ending', 'op', 'ed'],
            'kpop': ['kpop', 'k-pop', 'bts', 'blackpink', 'twice'],
            'indie': ['indie'],
            'ambient': ['ambient', 'relaxing', 'meditation']
        };

        for (const [genre, keywords] of Object.entries(genreKeywords)) {
            if (keywords.some(kw => combined.includes(kw))) {
                profile.genres[genre] = (profile.genres[genre] || 0) + 1;
            }
        }
    }

    /**
     * Detect decade from track
     */
    detectDecade(profile, track) {
        // Try to extract year from title or other metadata
        const yearMatch = (track.title || '').match(/\b(19[6-9]\d|20[0-2]\d)\b/);
        if (yearMatch) {
            const year = parseInt(yearMatch[1]);
            const decade = `${Math.floor(year / 10) * 10}s`;
            if (profile.decades[decade] !== undefined) {
                profile.decades[decade]++;
            }
        }
    }

    /**
     * Get top genres for user
     */
    getTopGenres(userId, count = 5) {
        const profile = this.getProfile(userId);
        return Object.entries(profile.genres)
            .sort((a, b) => b[1] - a[1])
            .slice(0, count)
            .map(([genre, plays]) => ({ genre, plays }));
    }

    /**
     * Get peak listening hours
     */
    getPeakHours(userId) {
        const profile = this.getProfile(userId);
        const peaks = profile.peakHours
            .map((count, hour) => ({ hour, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);

        return peaks;
    }

    /**
     * Get recommendation context
     */
    getRecommendationContext(userId) {
        const profile = this.getProfile(userId);

        return {
            topGenres: this.getTopGenres(userId, 3).map(g => g.genre),
            topArtists: profile.topArtists.slice(0, 5).map(a => a.artist),
            moodProfile: profile.moodProfile,
            tempoPreference: profile.tempoPreference,
            discoveryScore: profile.discoveryScore,
            currentHour: new Date().getHours(),
            isWeekend: [0, 6].includes(new Date().getDay())
        };
    }

    /**
     * Generate personalization prompt for AI
     */
    generatePersonalizationPrompt(userId) {
        const context = this.getRecommendationContext(userId);
        const profile = this.getProfile(userId);

        const parts = [];

        if (context.topGenres.length > 0) {
            parts.push(`User's favorite genres: ${context.topGenres.join(', ')}`);
        }

        if (context.topArtists.length > 0) {
            parts.push(`User's top artists: ${context.topArtists.slice(0, 3).join(', ')}`);
        }

        if (profile.completionRate < 0.5) {
            parts.push('User tends to skip tracks - needs more engaging music');
        }

        if (context.discoveryScore > 0.7) {
            parts.push('User enjoys discovering new artists');
        } else if (context.discoveryScore < 0.3) {
            parts.push('User prefers familiar artists and songs');
        }

        // Time-based preference
        const hour = context.currentHour;
        if (hour >= 22 || hour < 6) {
            parts.push('Late night listening - consider calmer tracks');
        } else if (hour >= 6 && hour < 12) {
            parts.push('Morning listening - energetic or uplifting music');
        } else if (hour >= 17 && hour < 22) {
            parts.push('Evening listening - diverse preferences');
        }

        return parts.join('. ') + '.';
    }

    /**
     * Calculate similarity between two users
     */
    calculateUserSimilarity(userId1, userId2) {
        const profile1 = this.getProfile(userId1);
        const profile2 = this.getProfile(userId2);

        // Compare top artists
        const artists1 = new Set(profile1.topArtists.map(a => a.artist.toLowerCase()));
        const artists2 = new Set(profile2.topArtists.map(a => a.artist.toLowerCase()));

        let sharedArtists = 0;
        for (const artist of artists1) {
            if (artists2.has(artist)) sharedArtists++;
        }

        // Compare genres
        const genres1 = Object.keys(profile1.genres);
        const genres2 = Object.keys(profile2.genres);
        let sharedGenres = 0;
        for (const genre of genres1) {
            if (genres2.includes(genre)) sharedGenres++;
        }

        // Calculate similarity score
        const artistSimilarity = Math.min(artists1.size, artists2.size) > 0
            ? sharedArtists / Math.min(artists1.size, artists2.size)
            : 0;

        const genreSimilarity = Math.min(genres1.length, genres2.length) > 0
            ? sharedGenres / Math.min(genres1.length, genres2.length)
            : 0;

        return (artistSimilarity * 0.6 + genreSimilarity * 0.4);
    }

    /**
     * Export profile for storage
     */
    exportProfile(userId) {
        return JSON.stringify(this.getProfile(userId));
    }

    /**
     * Import profile from storage
     */
    importProfile(userId, profileJson) {
        try {
            const profile = JSON.parse(profileJson);
            this.profiles.set(userId, profile);
            return true;
        } catch (error) {
            console.error('[PROFILE] Import error:', error);
            return false;
        }
    }

    /**
     * Get profile summary for display
     */
    getProfileSummary(userId) {
        const profile = this.getProfile(userId);
        const topGenres = this.getTopGenres(userId, 3);
        const peakHours = this.getPeakHours(userId);

        return {
            totalTracks: profile.totalTracks,
            totalHours: Math.round(profile.totalDuration / 3600000 * 10) / 10,
            completionRate: Math.round(profile.completionRate * 100),
            topGenres: topGenres.map(g => g.genre),
            topArtists: profile.topArtists.slice(0, 3).map(a => a.artist),
            peakListeningHour: peakHours[0]?.hour ?? null,
            discoveryScore: Math.round(profile.discoveryScore * 100),
            preferredQuality: profile.preferredQuality
        };
    }
}

// Singleton instance
const userProfile = new UserProfile();

module.exports = userProfile;
