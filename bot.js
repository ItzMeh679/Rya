const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { token } = require('./src/config/config.js');
const LavalinkClient = require('./src/structures/LavalinkClient.js');
const fs = require('fs');
const path = require('path');
const http = require('http');

// HTTP Health Check Server for Render deployment
const PORT = process.env.PORT || 3000;
const SELF_PING_URL = process.env.SELF_PING_URL;
const ENABLE_SELF_PING = process.env.ENABLE_SELF_PING === 'true';


// Create Discord client with optimal intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ],
    // Optimize client settings for performance
    presence: {
        status: 'online',
        activities: [{
            name: 'Advanced Music Bot | /play',
            type: 2 // LISTENING
        }]
    }
});

// Initialize collections for commands and cooldowns
client.commands = new Collection();
client.cooldowns = new Collection();
client.musicPlayers = new Collection(); // Legacy - kept for compatibility
client.lavalink = null; // Lavalink client (Kazagumo)

// Performance monitoring
client.startTime = Date.now();
client.commandsExecuted = 0;

// Cleanup state tracking
client.isShuttingDown = false;
client.cleanupInProgress = false;

// Advanced error handling with logging
process.on('unhandledRejection', (reason, promise) => {
    console.error('[UNHANDLED REJECTION]', reason);
    // Don't crash on unhandled rejections in production
    if (process.env.NODE_ENV !== 'production') {
        console.error('Promise:', promise);
    }
});

process.on('uncaughtException', (error) => {
    console.error('[UNCAUGHT EXCEPTION]', error);
    // Attempt graceful shutdown on uncaught exceptions
    if (!client.isShuttingDown) {
        gracefulShutdown('UNCAUGHT_EXCEPTION');
    }
});

// Load commands dynamically with error handling
const loadCommands = () => {
    const commandsPath = path.join(__dirname, 'src', 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    let loadedCommands = 0;

    for (const file of commandFiles) {
        try {
            const filePath = path.join(commandsPath, file);
            delete require.cache[require.resolve(filePath)]; // Clear cache for hot reload
            const command = require(filePath);

            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                loadedCommands++;
            } else {
                console.warn(`[WARNING] Command ${file} missing required "data" or "execute" property.`);
            }
        } catch (error) {
            console.error(`[ERROR] Failed to load command ${file}:`, error);
        }
    }

    console.log(`[SUCCESS] Loaded ${loadedCommands} commands.`);
};

// Load events dynamically with error handling
const loadEvents = () => {
    const eventsPath = path.join(__dirname, 'src', 'events');
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

    let loadedEvents = 0;

    for (const file of eventFiles) {
        try {
            const filePath = path.join(eventsPath, file);
            delete require.cache[require.resolve(filePath)]; // Clear cache for hot reload
            const event = require(filePath);

            if (event.once) {
                client.once(event.name, (...args) => event.execute(...args));
            } else {
                client.on(event.name, (...args) => event.execute(...args));
            }
            loadedEvents++;
        } catch (error) {
            console.error(`[ERROR] Failed to load event ${file}:`, error);
        }
    }

    console.log(`[SUCCESS] Loaded ${loadedEvents} events.`);
};

// FIXED: Safe memory management and cache cleanup
const cleanupCache = async () => {
    if (client.cleanupInProgress || client.isShuttingDown) {
        console.log('[CLEANUP] Cleanup already in progress, skipping...');
        return;
    }

    client.cleanupInProgress = true;

    try {
        console.log('[CLEANUP] Starting cache cleanup...');

        // Clear unused music players with proper error handling
        const playersToCleanup = [];

        client.musicPlayers.forEach((player, guildId) => {
            try {
                // Check if player should be cleaned up
                const state = player.getPlaybackState();

                if (state.isDestroyed) {
                    // Player is already destroyed, just remove from collection
                    playersToCleanup.push({ guildId, player, reason: 'already_destroyed' });
                    return;
                }

                // Check if player is idle and should be cleaned up
                const idleTime = Date.now() - (player.lastActivity || 0);
                const shouldCleanup = !state.isPlaying &&
                    !state.isPaused &&
                    state.queueLength === 0 &&
                    idleTime > 300000; // 5 minutes

                if (shouldCleanup) {
                    playersToCleanup.push({ guildId, player, reason: 'idle_timeout' });
                }

            } catch (error) {
                console.warn(`[CLEANUP] Error checking player state for guild ${guildId}:`, error.message);
                playersToCleanup.push({ guildId, player, reason: 'error_state' });
            }
        });

        // Cleanup identified players
        let cleanedPlayers = 0;
        for (const { guildId, player, reason } of playersToCleanup) {
            try {
                console.log(`[CLEANUP] Cleaning up player for guild ${guildId} (reason: ${reason})`);

                // Use the safe cleanup method from the player
                if (typeof player.safeCleanup === 'function' && !player.isDestroyed) {
                    await player.safeCleanup();
                }

                // Remove from collection
                client.musicPlayers.delete(guildId);
                cleanedPlayers++;

            } catch (error) {
                console.warn(`[CLEANUP] Failed to cleanup player for guild ${guildId}:`, error.message);
                // Force remove from collection even if cleanup failed
                client.musicPlayers.delete(guildId);
                cleanedPlayers++;
            }
        }

        // Clear cooldowns older than 5 minutes
        const now = Date.now();
        let clearedCooldowns = 0;

        client.cooldowns.forEach((cooldown, userId) => {
            try {
                const filteredCooldown = new Collection();
                cooldown.forEach((timestamp, commandName) => {
                    if (now - timestamp < 300000) { // 5 minutes
                        filteredCooldown.set(commandName, timestamp);
                    }
                });

                if (filteredCooldown.size === 0) {
                    client.cooldowns.delete(userId);
                    clearedCooldowns++;
                } else {
                    client.cooldowns.set(userId, filteredCooldown);
                }
            } catch (error) {
                console.warn(`[CLEANUP] Error cleaning cooldowns for user ${userId}:`, error.message);
                client.cooldowns.delete(userId);
                clearedCooldowns++;
            }
        });

        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }

        console.log(`[CLEANUP] Cleanup completed. Cleaned players: ${cleanedPlayers}, Cleared cooldowns: ${clearedCooldowns}, Active players: ${client.musicPlayers.size}`);

    } catch (error) {
        console.error('[CLEANUP] Cache cleanup error:', error);
    } finally {
        client.cleanupInProgress = false;
    }
};

// Advanced health check system
const healthCheck = () => {
    try {
        const uptime = Date.now() - client.startTime;
        const memoryUsage = process.memoryUsage();

        console.log(`[HEALTH CHECK]`, {
            uptime: Math.floor(uptime / 1000) + 's',
            guilds: client.guilds.cache.size,
            users: client.users.cache.size,
            commands: client.commandsExecuted,
            memory: {
                rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
                heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
                heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB'
            },
            activePlayers: client.musicPlayers.size,
            cleanupInProgress: client.cleanupInProgress
        });
    } catch (error) {
        console.error('[HEALTH CHECK] Error:', error);
    }
};

// HTTP Health Server for Render deployment
const startHealthServer = () => {
    const server = http.createServer((req, res) => {
        const uptime = Date.now() - client.startTime;
        const memoryUsage = process.memoryUsage();

        if (req.url === '/health' || req.url === '/') {
            const healthData = {
                status: 'ok',
                bot: client.user ? 'online' : 'starting',
                uptime: Math.floor(uptime / 1000) + 's',
                guilds: client.guilds?.cache?.size || 0,
                memory: {
                    rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
                    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB'
                },
                timestamp: new Date().toISOString()
            };

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(healthData));
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
        }
    });

    server.listen(PORT, () => {
        console.log(`[HEALTH SERVER] Running on port ${PORT}`);
    });

    // Self-ping keep-alive mechanism
    if (ENABLE_SELF_PING && SELF_PING_URL) {
        const selfPingInterval = setInterval(async () => {
            if (client.isShuttingDown) return;

            try {
                const response = await fetch(SELF_PING_URL);
                if (response.ok) {
                    console.log('[SELF-PING] Keep-alive ping successful');
                }
            } catch (error) {
                console.warn('[SELF-PING] Ping failed:', error.message);
            }
        }, 600000); // Every 10 minutes

        client.intervals = client.intervals || {};
        client.intervals.selfPing = selfPingInterval;
        console.log('[SELF-PING] Keep-alive enabled, pinging every 10 minutes');
    }

    return server;
};

// Initialize bot
const initialize = async () => {
    try {
        console.log('[INIT] Starting Advanced Music Bot...');

        // Load commands and events
        loadCommands();
        loadEvents();

        // Set up periodic cleanup and health checks with error handling
        const cleanupInterval = setInterval(async () => {
            if (!client.isShuttingDown) {
                await cleanupCache();
            }
        }, 300000); // Every 5 minutes

        const healthInterval = setInterval(() => {
            if (!client.isShuttingDown) {
                healthCheck();
            }
        }, 600000); // Every 10 minutes

        // Store intervals for cleanup during shutdown
        client.intervals = {
            cleanup: cleanupInterval,
            health: healthInterval
        };

        // Start HTTP health server for Render deployment
        startHealthServer();

        // Login to Discord
        await client.login(token);

        // Initialize Lavalink after login (requires gateway connection)
        console.log('[INIT] Initializing Lavalink client...');
        client.lavalink = new LavalinkClient(client);
        await client.lavalink.initialize();
        console.log('[INIT] Lavalink client initialized!');

    } catch (error) {
        console.error('[FATAL ERROR] Failed to initialize bot:', error);
        process.exit(1);
    }
};

// FIXED: Enhanced graceful shutdown with timeout
const gracefulShutdown = async (signal = 'UNKNOWN') => {
    if (client.isShuttingDown) {
        console.log('[SHUTDOWN] Shutdown already in progress...');
        return;
    }

    console.log(`[SHUTDOWN] Graceful shutdown initiated by ${signal}...`);
    client.isShuttingDown = true;

    // Set a maximum shutdown time
    const shutdownTimeout = setTimeout(() => {
        console.log('[SHUTDOWN] Force exit due to timeout');
        process.exit(1);
    }, 10000); // 10 seconds max

    try {
        // Clear intervals
        if (client.intervals) {
            Object.values(client.intervals).forEach(interval => {
                if (interval) clearInterval(interval);
            });
        }

        // Cleanup all music players with individual error handling
        console.log(`[SHUTDOWN] Cleaning up ${client.musicPlayers.size} music players...`);

        const cleanupPromises = [];
        client.musicPlayers.forEach((player, guildId) => {
            cleanupPromises.push(
                new Promise(async (resolve) => {
                    try {
                        console.log(`[SHUTDOWN] Cleaning up player for guild ${guildId}`);

                        if (!player.isDestroyed && typeof player.safeCleanup === 'function') {
                            await Promise.race([
                                player.safeCleanup(),
                                new Promise(resolve => setTimeout(resolve, 2000)) // 2 second timeout per player
                            ]);
                        }

                        console.log(`[SHUTDOWN] Player cleanup completed for guild ${guildId}`);
                    } catch (error) {
                        console.warn(`[SHUTDOWN] Player cleanup failed for guild ${guildId}:`, error.message);
                    }
                    resolve();
                })
            );
        });

        // Wait for all player cleanups with timeout
        await Promise.race([
            Promise.all(cleanupPromises),
            new Promise(resolve => setTimeout(resolve, 5000)) // 5 second max for all players
        ]);

        // Clear the collection
        client.musicPlayers.clear();

        // Destroy client
        console.log('[SHUTDOWN] Destroying Discord client...');
        if (client.readyAt) {
            await Promise.race([
                client.destroy(),
                new Promise(resolve => setTimeout(resolve, 3000)) // 3 second timeout
            ]);
        }

        console.log('[SHUTDOWN] Bot shutdown complete.');

    } catch (error) {
        console.error('[SHUTDOWN] Error during shutdown:', error);
    } finally {
        clearTimeout(shutdownTimeout);
        process.exit(0);
    }
};

// Handle shutdown signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle Discord.js client errors
client.on('error', (error) => {
    console.error('[CLIENT ERROR]', error);
    // Don't shutdown on client errors, just log them
});

client.on('warn', (warning) => {
    console.warn('[CLIENT WARNING]', warning);
});

// Export client for external access
module.exports = client;

// Start the bot
initialize();