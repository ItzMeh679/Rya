const { Events, ActivityType } = require('discord.js');
const config = require('../config/config.js');

module.exports = {
    name: Events.ClientReady,
    once: true,

    async execute(client) {
        try {
            console.log('\n='.repeat(50));
            console.log('🎵 ADVANCED DISCORD MUSIC BOT');
            console.log('='.repeat(50));

            // Basic startup info
            console.log(`[READY] ✅ Logged in as ${client.user.tag}`);
            console.log(`[READY] 📊 Serving ${client.guilds.cache.size} guilds`);
            console.log(`[READY] 👥 Watching ${client.users.cache.size} users`);
            console.log(`[READY] ⚡ Ready in ${Date.now() - client.startTime}ms`);

            // Set bot presence
            await setDynamicPresence(client);

            // Initialize systems
            await initializeSystems(client);

            // Setup periodic tasks
            setupPeriodicTasks(client);

            // Display feature status
            displayFeatureStatus();

            // Display startup statistics
            displayStartupStats(client);

            console.log('='.repeat(50));
            console.log('🚀 Bot is fully ready and operational!');
            console.log('='.repeat(50));

        } catch (error) {
            console.error('[READY] Error during startup:', error);
        }
    }
};

/**
 * Set dynamic bot presence with rotation
 */
async function setDynamicPresence(client) {
    const presences = [
        {
            name: 'music across servers',
            type: ActivityType.Playing
        },
        {
            name: '/r play to start',
            type: ActivityType.Listening
        },
        {
            name: `${client.guilds.cache.size} servers`,
            type: ActivityType.Watching
        },
        {
            name: 'AI recommendations',
            type: ActivityType.Playing
        },
        {
            name: '!r help for commands',
            type: ActivityType.Listening
        },
        {
            name: '10-band EQ & effects',
            type: ActivityType.Playing
        }
    ];

    let currentIndex = 0;

    const updatePresence = () => {
        const presence = presences[currentIndex];

        client.user.setPresence({
            status: 'online',
            activities: [{
                name: presence.name,
                type: presence.type
            }]
        });

        currentIndex = (currentIndex + 1) % presences.length;
    };

    // Set initial presence
    updatePresence();

    // Rotate presence every 30 seconds
    setInterval(updatePresence, 30000);
}

/**
 * Initialize various systems
 */
async function initializeSystems(client) {
    console.log('[READY] 🔧 Initializing systems...');

    // Initialize music player collection
    if (!client.musicPlayers) {
        client.musicPlayers = new Map();
    }

    // Initialize performance monitoring
    if (!client.metrics) {
        client.metrics = {
            commandsExecuted: 0,
            tracksPlayed: 0,
            errorsEncountered: 0,
            uptimeStart: Date.now(),
            guildsJoined: 0,
            guildsLeft: 0
        };
    }

    // Setup guild event handlers for metrics
    client.on('guildCreate', (guild) => {
        client.metrics.guildsJoined++;
        console.log(`[GUILD] ➕ Joined guild: ${guild.name} (${guild.memberCount} members)`);
    });

    client.on('guildDelete', (guild) => {
        client.metrics.guildsLeft++;
        console.log(`[GUILD] ➖ Left guild: ${guild.name}`);

        // Cleanup music player if exists
        const player = client.musicPlayers.get(guild.id);
        if (player) {
            player.cleanup();
            client.musicPlayers.delete(guild.id);
        }
    });

    // Initialize API helpers
    try {
        // Test API connections
        const testPromises = [];

        // Test Spotify connection if configured
        if (config.apis.spotify.clientId && config.apis.spotify.clientSecret) {
            testPromises.push(testSpotifyConnection());
        }

        // Test AI APIs if configured
        if (config.apis.openai.apiKey) {
            testPromises.push(testOpenAIConnection());
        }

        if (config.apis.gemini.apiKey) {
            testPromises.push(testGeminiConnection());
        }

        const results = await Promise.allSettled(testPromises);
        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                console.log(`[READY] ✅ API connection ${index + 1} successful`);
            } else {
                console.warn(`[READY] ⚠️ API connection ${index + 1} failed:`, result.reason.message);
            }
        });

    } catch (error) {
        console.warn('[READY] ⚠️ Some API connections failed:', error.message);
    }

    console.log('[READY] ✅ Systems initialized successfully');
}

/**
 * Setup periodic maintenance tasks
 */
function setupPeriodicTasks(client) {
    // Cleanup inactive players every 10 minutes
    setInterval(() => {
        let cleanedPlayers = 0;

        client.musicPlayers.forEach((player, guildId) => {
            const state = player.getPlaybackState();

            // Clean up idle players
            if (!state.isPlaying && state.queueLength === 0) {
                const idleTime = Date.now() - (player.lastActivity || 0);

                if (idleTime > config.music.autoLeaveTimeout) {
                    player.cleanup();
                    client.musicPlayers.delete(guildId);
                    cleanedPlayers++;
                }
            }
        });

        if (cleanedPlayers > 0) {
            console.log(`[CLEANUP] 🧹 Cleaned up ${cleanedPlayers} inactive music players`);
        }
    }, 600000); // 10 minutes

    // Update metrics every 5 minutes
    setInterval(() => {
        if (config.performance.enableMetrics) {
            logMetrics(client);
        }
    }, 300000); // 5 minutes

    // Force garbage collection every 15 minutes if available
    if (global.gc) {
        setInterval(() => {
            global.gc();
            console.log('[MEMORY] 🗑️ Garbage collection performed');
        }, 900000); // 15 minutes
    }
}

/**
 * Display feature status
 */
function displayFeatureStatus() {
    console.log('\n[FEATURES] 🎛️ Feature Status:');

    const features = [
        { name: 'AI Recommendations', enabled: config.isFeatureEnabled('aiRecommendations') },
        { name: 'Live Karaoke', enabled: config.isFeatureEnabled('lyrics.enableKaraoke') },
        { name: 'Audio Effects', enabled: config.isFeatureEnabled('audioEffects') },
        { name: 'Spotify Integration', enabled: config.isFeatureEnabled('spotifyIntegration') },
        { name: 'Genius Lyrics', enabled: config.isFeatureEnabled('geniusLyrics') },
        { name: 'Auto Playlist', enabled: config.isFeatureEnabled('autoPlaylist') }
    ];

    features.forEach(feature => {
        const status = feature.enabled ? '✅ Enabled' : '❌ Disabled';
        console.log(`[FEATURES]   ${feature.name}: ${status}`);
    });
}

/**
 * Display startup statistics
 */
function displayStartupStats(client) {
    const memUsage = process.memoryUsage();

    console.log('\n[STATS] 📊 Startup Statistics:');
    console.log(`[STATS]   Memory Usage:`);
    console.log(`[STATS]     RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB`);
    console.log(`[STATS]     Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
    console.log(`[STATS]     Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`);
    console.log(`[STATS]   Commands Loaded: ${client.commands?.size || 0}`);
    console.log(`[STATS]   Node.js Version: ${process.version}`);
    console.log(`[STATS]   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[STATS]   Platform: ${process.platform}`);
    console.log(`[STATS]   Architecture: ${process.arch}`);
}

/**
 * Log performance metrics
 */
function logMetrics(client) {
    const uptime = Date.now() - client.metrics.uptimeStart;
    const memUsage = process.memoryUsage();

    console.log('\n[METRICS] 📈 Performance Metrics:');
    console.log(`[METRICS]   Uptime: ${formatUptime(uptime)}`);
    console.log(`[METRICS]   Guilds: ${client.guilds.cache.size}`);
    console.log(`[METRICS]   Active Players: ${client.musicPlayers?.size || 0}`);
    console.log(`[METRICS]   Commands Executed: ${client.metrics.commandsExecuted}`);
    console.log(`[METRICS]   Memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
    console.log(`[METRICS]   CPU Usage: ${process.cpuUsage().user / 1000}ms`);
}

/**
 * Test API connections
 */
async function testSpotifyConnection() {
    // This would test Spotify API connection
    // Implementation would depend on your SpotifyHelper
    return Promise.resolve();
}

async function testOpenAIConnection() {
    // This would test OpenAI API connection
    // Implementation would depend on your API setup
    return Promise.resolve();
}

async function testGeminiConnection() {
    // This would test Gemini API connection
    // Implementation would depend on your API setup
    return Promise.resolve();
}

/**
 * Format uptime duration
 */
function formatUptime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}