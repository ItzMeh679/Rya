require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = [
    'DISCORD_TOKEN',
    'DISCORD_CLIENT_ID',
    'SPOTIFY_CLIENT_ID',
    'SPOTIFY_CLIENT_SECRET',
    'OPENAI_API_KEY',
    'GEMINI_API_KEY'
];

const validateEnv = () => {
    const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
    if (missing.length > 0) {
        console.error('[CONFIG ERROR] Missing required environment variables:', missing);
        process.exit(1);
    }
};

validateEnv();

// Main configuration object
const config = {
    // Discord Configuration
    discord: {
        token: process.env.DISCORD_TOKEN,
        clientId: process.env.DISCORD_CLIENT_ID,
        permissions: '277025770560', // Optimized permissions for music bot
        maxGuilds: 1000, // Maximum guilds for scaling
        commandCooldown: 3000, // 3 seconds default cooldown
        embedColors: {
            primary: '#00d4ff', // Cyan blue
            success: '#00ff88', // Green
            error: '#ff4757', // Red
            warning: '#ffa502', // Orange
            info: '#3742fa', // Blue
            music: '#8b00ff', // Purple
            lyrics: '#ff6b9d', // Pink
            queue: '#1e90ff' // Dodger blue
        }
    },

    // Music Configuration - OPTIMIZED FOR SPEED
    music: {
        maxQueueSize: 2000,
        maxPlaylistSize: 500, // Much larger for big playlists
        defaultVolume: 50,
        maxVolume: 150,
        searchLimit: 10,
        autoLeaveTimeout: 300000, // 5 minutes
        maxSongDuration: 7200000, // 2 hours
        audioQuality: 'highestaudio',
        bufferSize: 1024 * 256, // 256KB buffer - 4x larger for smoother playback
        preBufferSeconds: 10, // Pre-buffer next track
        maxConcurrentStreams: 5, // Parallel playlist processing
        useYtDlpFallback: true, // Use yt-dlp when ytdl-core fails
        enableIPv6: true, // IPv6 for rate limit avoidance
        filters: {
            bass: [-2, -1, 0, 1, 2, 3, 4, 5],
            treble: [-2, -1, 0, 1, 2, 3, 4, 5]
        }
    },

    // API Configuration
    apis: {
        spotify: {
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
            redirectUri: process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:3000/callback',
            scopes: [
                'user-read-playback-state',
                'user-modify-playback-state',
                'user-read-currently-playing',
                'playlist-read-private',
                'playlist-read-collaborative'
            ],
            apiUrl: 'https://api.spotify.com/v1',
            tokenUrl: 'https://accounts.spotify.com/api/token',
            rateLimit: {
                requests: 100,
                window: 60000 // 1 minute
            }
        },

        youtube: {
            apiUrl: 'https://www.googleapis.com/youtube/v3',
            searchEndpoint: '/search',
            videoEndpoint: '/videos',
            maxResults: 50,
            safeSearch: 'moderate',
            order: 'relevance',
            rateLimit: {
                requests: 10000,
                window: 86400000 // 24 hours
            }
        },

        genius: {
            apiUrl: 'https://api.genius.com',
            accessToken: process.env.GENIUS_ACCESS_TOKEN,
            searchEndpoint: '/search',
            songEndpoint: '/songs',
            rateLimit: {
                requests: 1000,
                window: 3600000 // 1 hour
            }
        },

        lyricsApi: {
            baseUrl: 'https://api.lyrics.ovh/v1',
            fallbackUrl: 'https://some-random-api.ml/lyrics',
            timeout: 10000,
            maxRetries: 3
        },

        openai: {
            apiKey: process.env.OPENAI_API_KEY,
            model: 'gpt-3.5-turbo',
            maxTokens: 150,
            temperature: 0.7,
            apiUrl: 'https://api.openai.com/v1',
            rateLimit: {
                requests: 60,
                window: 60000 // 1 minute
            }
        },

        gemini: {
            apiKey: process.env.GEMINI_API_KEY,
            model: 'gemini-1.5-flash', // Updated to latest fast model
            apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
            maxTokens: 150,
            temperature: 0.7,
            rateLimit: {
                requests: 60,
                window: 60000 // 1 minute
            }
        },

        // Supabase Configuration for User Tracking
        supabase: {
            url: process.env.SUPABASE_URL,
            anonKey: process.env.SUPABASE_ANON_KEY,
            serviceKey: process.env.SUPABASE_SERVICE_KEY,
            trackingEnabled: process.env.ENABLE_TRACKING !== 'false'
        }
    },

    // Audio Effects Configuration
    audioEffects: {
        spatial3D: {
            name: '3D Spatial Sound',
            filter: 'apulsator=hz=0.125,chorus=0.7:0.9:55:0.4:0.25:2',
            description: 'Immersive 3D spatial audio experience'
        },

        speedUp: {
            name: 'Sped Up & Fast Beats',
            filter: 'atempo=1.25,bass=g=5,treble=g=3',
            description: 'Energetic sped up version with enhanced beats'
        },

        slowedReverb: {
            name: 'Slowed & Reverb',
            filter: 'atempo=0.85,aecho=0.8:0.9:1000:0.3,reverb=roomsize=0.8:damping=0.2',
            description: 'Chill slowed down version with atmospheric reverb'
        },

        bassBoost: {
            name: 'Bass Boost',
            filter: 'bass=g=8,compand=0.3|0.3:1|1:-90/-60|-60/-40|-40/-30|-20/-20:6:0:-90:0.2',
            description: 'Enhanced bass frequencies'
        },

        trebleBoost: {
            name: 'Treble Boost',
            filter: 'treble=g=6,highpass=f=200',
            description: 'Crisp high-frequency enhancement'
        }
    },

    // Cache Configuration
    cache: {
        ttl: 3600000, // 1 hour
        maxSize: 1000,
        cleanupInterval: 300000, // 5 minutes
        compressionLevel: 6,
        enablePersistence: false
    },

    // Performance Configuration
    performance: {
        maxConcurrentConnections: 100,
        connectionTimeout: 30000, // 30 seconds
        retryAttempts: 3,
        retryDelay: 1000, // 1 second
        enableMetrics: true,
        metricsInterval: 300000, // 5 minutes
        memoryThreshold: 512 * 1024 * 1024, // 512MB
        cpuThreshold: 80 // 80%
    },

    // Logging Configuration
    logging: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        enableFileLogging: true,
        logDirectory: './logs',
        maxFileSize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
        enableConsoleColors: true
    },

    // Feature Flags
    features: {
        aiRecommendations: true,
        liveKaraoke: true,
        audioEffects: true,
        spotifyIntegration: true,
        geniusLyrics: true,
        autoPlaylist: true,
        voiceActivityDetection: false,
        crossfade: false,
        lyrics: {
            enableTimestamps: true,
            enableKaraoke: true,
            autoScroll: true,
            fallbackSources: ['genius', 'lyricsapi']
        }
    },

    // Development Configuration
    development: {
        hotReload: process.env.NODE_ENV === 'development',
        debugMode: process.env.DEBUG === 'true',
        mockApis: process.env.MOCK_APIS === 'true',
        enableProfiler: process.env.ENABLE_PROFILER === 'true'
    }
};

// Environment-specific overrides
if (process.env.NODE_ENV === 'production') {
    config.logging.level = 'warn';
    config.cache.enablePersistence = true;
    config.performance.enableMetrics = true;
} else if (process.env.NODE_ENV === 'development') {
    config.music.autoLeaveTimeout = 60000; // 1 minute for development
    config.discord.commandCooldown = 1000; // 1 second for development
}

// Configuration validation
const validateConfig = () => {
    // Validate volume limits
    if (config.music.defaultVolume > config.music.maxVolume) {
        config.music.defaultVolume = config.music.maxVolume;
    }

    // Validate queue sizes
    if (config.music.maxPlaylistSize > config.music.maxQueueSize) {
        config.music.maxPlaylistSize = config.music.maxQueueSize;
    }

    // Validate API rate limits
    Object.values(config.apis).forEach(api => {
        if (api.rateLimit && api.rateLimit.requests <= 0) {
            api.rateLimit.requests = 10; // Default fallback
        }
    });
};

validateConfig();

// Export configuration with getter methods for dynamic access
module.exports = {
    ...config,

    // Getter methods for dynamic configuration
    getEmbedColor: (type = 'primary') => config.discord.embedColors[type] || config.discord.embedColors.primary,

    getApiConfig: (apiName) => config.apis[apiName] || null,

    getAudioEffect: (effectName) => config.audioEffects[effectName] || null,

    isFeatureEnabled: (featureName) => {
        const feature = featureName.split('.');
        let current = config.features;

        for (const key of feature) {
            if (current[key] === undefined) return false;
            current = current[key];
        }

        return current === true;
    },

    // Performance monitoring helpers
    shouldCleanup: () => {
        const memUsage = process.memoryUsage();
        return memUsage.heapUsed > config.performance.memoryThreshold;
    },

    // Environment helpers
    isDevelopment: () => process.env.NODE_ENV === 'development',
    isProduction: () => process.env.NODE_ENV === 'production',

    // Token getter (for security)
    get token() {
        return this.discord.token;
    }
};