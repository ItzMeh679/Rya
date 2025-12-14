// src/utils/adminCommands.js - Admin command handlers for .r prefix
// Only users with ManageGuild permission can use these commands

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { formatUptime, formatBytes, formatDuration } = require('./formatUtils.js');
const config = require('../config/config.js');

/**
 * Admin Commands Handler
 * Format: .r <command> [args]
 */
class AdminCommands {
    constructor() {
        this.commands = {
            'stats': this.handleStats.bind(this),
            'prefix': this.handlePrefix.bind(this),
            'node': this.handleNode.bind(this),
            'cache': this.handleCache.bind(this),
            'debug': this.handleDebug.bind(this),
            'config': this.handleConfig.bind(this),
            'help': this.handleHelp.bind(this)
        };
    }

    /**
     * Check if user has admin permissions
     */
    hasPermission(member) {
        if (!member) return false;

        // Bot owner always has permission
        const ownerId = process.env.BOT_OWNER_ID;
        if (ownerId && member.id === ownerId) return true;

        // Check for ManageGuild permission
        return member.permissions.has(PermissionFlagsBits.ManageGuild);
    }

    /**
     * Execute an admin command
     */
    async execute(message, commandName, args) {
        // Check permissions
        if (!this.hasPermission(message.member)) {
            const embed = new EmbedBuilder()
                .setColor(0xEF4444)
                .setTitle('❌ Permission Denied')
                .setDescription('You need **Manage Server** permission to use admin commands.');
            return message.reply({ embeds: [embed] });
        }

        // Get command handler
        const handler = this.commands[commandName.toLowerCase()];
        if (!handler) {
            const embed = new EmbedBuilder()
                .setColor(0xF59E0B)
                .setTitle('⚠️ Unknown Command')
                .setDescription(`Unknown admin command: \`${commandName}\`\n\nUse \`.r help\` to see available commands.`);
            return message.reply({ embeds: [embed] });
        }

        try {
            await handler(message, args);
        } catch (error) {
            console.error(`[ADMIN] Error executing ${commandName}:`, error);
            const embed = new EmbedBuilder()
                .setColor(0xEF4444)
                .setTitle('❌ Error')
                .setDescription(`An error occurred: ${error.message}`);
            return message.reply({ embeds: [embed] });
        }
    }

    /**
     * .r stats - Bot statistics
     */
    async handleStats(message) {
        const client = message.client;
        const memUsage = process.memoryUsage();
        const uptime = process.uptime() * 1000;

        // Lavalink stats
        const lavalink = client.lavalink;
        const kazagumo = lavalink?.kazagumo;
        const activePlayers = kazagumo?.players?.size || 0;
        const nodes = kazagumo?.shoukaku?.nodes || new Map();

        // Node info
        let nodeInfo = '';
        nodes.forEach((node, name) => {
            const stats = node.stats;
            if (stats) {
                nodeInfo += `**${name}**: ${stats.players || 0} players, ${Math.round(stats.cpu?.systemLoad * 100) || 0}% CPU\n`;
            } else {
                nodeInfo += `**${name}**: Connecting...\n`;
            }
        });

        const embed = new EmbedBuilder()
            .setColor(0x6366F1)
            .setTitle('📊 Bot Statistics')
            .setThumbnail(client.user.displayAvatarURL())
            .addFields([
                {
                    name: '🤖 Bot Info',
                    value: [
                        `**Latency:** ${client.ws.ping}ms`,
                        `**Uptime:** ${formatUptime(uptime)}`,
                        `**Guilds:** ${client.guilds.cache.size}`,
                        `**Users:** ${client.users.cache.size}`
                    ].join('\n'),
                    inline: true
                },
                {
                    name: '🎵 Music',
                    value: [
                        `**Active Players:** ${activePlayers}`,
                        `**Lavalink Nodes:** ${nodes.size}`,
                        `**Commands Run:** ${client.commandsExecuted || 0}`
                    ].join('\n'),
                    inline: true
                },
                {
                    name: '💾 Memory',
                    value: [
                        `**Heap Used:** ${formatBytes(memUsage.heapUsed)}`,
                        `**Heap Total:** ${formatBytes(memUsage.heapTotal)}`,
                        `**RSS:** ${formatBytes(memUsage.rss)}`,
                        `**External:** ${formatBytes(memUsage.external)}`
                    ].join('\n'),
                    inline: true
                }
            ])
            .setTimestamp()
            .setFooter({ text: `Node.js ${process.version} • Rya Music Bot` });

        if (nodeInfo) {
            embed.addFields({
                name: '🌐 Lavalink Nodes',
                value: nodeInfo || 'No nodes connected',
                inline: false
            });
        }

        return message.reply({ embeds: [embed] });
    }

    /**
     * .r prefix <new_prefix> - Set server prefix
     */
    async handlePrefix(message, args) {
        const statsManager = require('./statsManager.js');

        if (!args || args.length === 0) {
            // Show current prefix
            const currentPrefix = await statsManager.getPrefix(message.guild.id);
            const embed = new EmbedBuilder()
                .setColor(0x6366F1)
                .setTitle('📝 Server Prefix')
                .setDescription(`Current prefix: \`${currentPrefix}\`\n\nTo change: \`.r prefix <new_prefix>\``)
                .addFields({
                    name: '💡 Examples',
                    value: '`.r prefix !`\n`.r prefix music!`\n`.r prefix >>`'
                });
            return message.reply({ embeds: [embed] });
        }

        const newPrefix = args.join(' ').trim();

        // Validate prefix
        if (newPrefix.length < 1 || newPrefix.length > 5) {
            const embed = new EmbedBuilder()
                .setColor(0xEF4444)
                .setTitle('❌ Invalid Prefix')
                .setDescription('Prefix must be 1-5 characters long.');
            return message.reply({ embeds: [embed] });
        }

        if (newPrefix.includes(' ')) {
            const embed = new EmbedBuilder()
                .setColor(0xEF4444)
                .setTitle('❌ Invalid Prefix')
                .setDescription('Prefix cannot contain spaces.');
            return message.reply({ embeds: [embed] });
        }

        try {
            await statsManager.setPrefix(message.guild.id, newPrefix);

            const embed = new EmbedBuilder()
                .setColor(0x10B981)
                .setTitle('✅ Prefix Updated')
                .setDescription(`Server prefix changed to: \`${newPrefix}\`\n\nText commands now use: \`${newPrefix} play <song>\``)
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setColor(0xEF4444)
                .setTitle('❌ Error')
                .setDescription(`Failed to update prefix: ${error.message}`);
            return message.reply({ embeds: [embed] });
        }
    }

    /**
     * .r node - Lavalink node status
     */
    async handleNode(message) {
        const client = message.client;
        const kazagumo = client.lavalink?.kazagumo;
        const nodes = kazagumo?.shoukaku?.nodes || new Map();

        if (nodes.size === 0) {
            const embed = new EmbedBuilder()
                .setColor(0xEF4444)
                .setTitle('🌐 Lavalink Nodes')
                .setDescription('❌ No Lavalink nodes connected.');
            return message.reply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
            .setColor(0x6366F1)
            .setTitle('🌐 Lavalink Node Status')
            .setTimestamp();

        nodes.forEach((node, name) => {
            const stats = node.stats;
            const state = node.state;

            let statusEmoji = '🟢';
            if (state === 1) statusEmoji = '🟡'; // Connecting
            if (state === 0) statusEmoji = '🔴'; // Disconnected

            if (stats) {
                embed.addFields({
                    name: `${statusEmoji} ${name}`,
                    value: [
                        `**Players:** ${stats.players || 0} (${stats.playingPlayers || 0} playing)`,
                        `**CPU:** ${(stats.cpu?.systemLoad * 100).toFixed(1)}% system, ${(stats.cpu?.lavalinkLoad * 100).toFixed(1)}% lavalink`,
                        `**Memory:** ${formatBytes(stats.memory?.used || 0)} / ${formatBytes(stats.memory?.reservable || 0)}`,
                        `**Uptime:** ${formatUptime((stats.uptime || 0))}`,
                        `**Frames:** Sent: ${stats.frameStats?.sent || 0}, Nulled: ${stats.frameStats?.nulled || 0}`
                    ].join('\n'),
                    inline: true
                });
            } else {
                embed.addFields({
                    name: `${statusEmoji} ${name}`,
                    value: 'Connecting to node...',
                    inline: true
                });
            }
        });

        return message.reply({ embeds: [embed] });
    }

    /**
     * .r cache - Cache statistics
     */
    async handleCache(message) {
        const client = message.client;

        // Collect cache sizes from various sources
        const caches = {
            'Discord Guilds': client.guilds.cache.size,
            'Discord Users': client.users.cache.size,
            'Discord Channels': client.channels.cache.size,
            'Cooldowns': client.cooldowns?.size || 0,
            'Commands': client.commands?.size || 0
        };

        // Try to get helper caches
        try {
            const SpotifyHelper = require('./spotifyHelper.js');
            caches['Spotify Cache'] = SpotifyHelper.cache?.size || 0;
        } catch (e) { /* ignore */ }

        try {
            const LyricsHelper = require('./lyricsHelper.js');
            caches['Lyrics Cache'] = LyricsHelper.cache?.size || 0;
        } catch (e) { /* ignore */ }

        try {
            const RecommendationsHelper = require('./recommendationsHelper.js');
            caches['Recommendations Cache'] = RecommendationsHelper.cache?.size || 0;
        } catch (e) { /* ignore */ }

        const embed = new EmbedBuilder()
            .setColor(0x6366F1)
            .setTitle('📦 Cache Statistics')
            .setDescription(Object.entries(caches)
                .map(([name, size]) => `**${name}:** ${size.toLocaleString()} items`)
                .join('\n'))
            .addFields({
                name: '💾 Memory Usage',
                value: `Heap: ${formatBytes(process.memoryUsage().heapUsed)}`,
                inline: true
            })
            .setTimestamp()
            .setFooter({ text: 'Use periodic cleanup to manage cache size' });

        return message.reply({ embeds: [embed] });
    }

    /**
     * .r debug - Debug information
     */
    async handleDebug(message) {
        const client = message.client;
        const guild = message.guild;

        // Get player for this guild
        const player = client.lavalink?.kazagumo?.players?.get(guild.id);

        const embed = new EmbedBuilder()
            .setColor(0x8B5CF6)
            .setTitle('🔧 Debug Information')
            .addFields([
                {
                    name: '🏠 Guild Info',
                    value: [
                        `**ID:** ${guild.id}`,
                        `**Name:** ${guild.name}`,
                        `**Members:** ${guild.memberCount}`,
                        `**Shard:** ${guild.shardId || 0}`
                    ].join('\n'),
                    inline: true
                },
                {
                    name: '🤖 Bot Info',
                    value: [
                        `**Node:** ${process.version}`,
                        `**Platform:** ${process.platform}`,
                        `**Arch:** ${process.arch}`,
                        `**PID:** ${process.pid}`
                    ].join('\n'),
                    inline: true
                }
            ])
            .setTimestamp();

        if (player) {
            const queue = player.queue;
            embed.addFields({
                name: '🎵 Player State',
                value: [
                    `**Playing:** ${player.playing ? 'Yes' : 'No'}`,
                    `**Paused:** ${player.paused ? 'Yes' : 'No'}`,
                    `**Queue:** ${queue?.length || 0} tracks`,
                    `**Current:** ${queue?.current?.title || 'None'}`,
                    `**Volume:** ${player.volume || 100}%`,
                    `**Loop:** ${player.loop || 'none'}`
                ].join('\n'),
                inline: false
            });
        } else {
            embed.addFields({
                name: '🎵 Player State',
                value: 'No active player in this guild',
                inline: false
            });
        }

        // Environment check
        const apiStatus = {
            'Spotify': !!process.env.SPOTIFY_CLIENT_ID,
            'OpenAI': !!process.env.OPENAI_API_KEY,
            'Gemini': !!process.env.GEMINI_API_KEY,
            'Supabase': !!process.env.SUPABASE_URL
        };

        embed.addFields({
            name: '🔌 API Status',
            value: Object.entries(apiStatus)
                .map(([name, configured]) => `${configured ? '✅' : '❌'} ${name}`)
                .join('\n'),
            inline: true
        });

        return message.reply({ embeds: [embed] });
    }

    /**
     * .r config - Server configuration
     */
    async handleConfig(message) {
        const guild = message.guild;
        const statsManager = require('./statsManager.js');

        const prefix = await statsManager.getPrefix(guild.id);

        const embed = new EmbedBuilder()
            .setColor(0x6366F1)
            .setTitle('⚙️ Server Configuration')
            .setThumbnail(guild.iconURL())
            .addFields([
                {
                    name: '📝 Prefix Settings',
                    value: [
                        `**Text Prefix:** \`${prefix}\``,
                        `**Slash Command:** \`/r\``,
                        `**Admin Prefix:** \`.r \``
                    ].join('\n'),
                    inline: true
                },
                {
                    name: '🎵 Music Settings',
                    value: [
                        `**Max Volume:** 150%`,
                        `**Default Volume:** 100%`,
                        `**Queue Limit:** 500 tracks`
                    ].join('\n'),
                    inline: true
                }
            ])
            .setTimestamp()
            .setFooter({ text: `Server ID: ${guild.id}` });

        return message.reply({ embeds: [embed] });
    }

    /**
     * .r help - Admin commands help
     */
    async handleHelp(message) {
        const embed = new EmbedBuilder()
            .setColor(0x6366F1)
            .setTitle('🔧 Admin Commands Help')
            .setDescription('Commands for server administrators. Use `.r <command>`')
            .addFields([
                {
                    name: '📊 `.r stats`',
                    value: 'View bot statistics, memory usage, and guild info',
                    inline: false
                },
                {
                    name: '📝 `.r prefix <new>`',
                    value: 'Change the server text command prefix (1-5 chars)',
                    inline: false
                },
                {
                    name: '🌐 `.r node`',
                    value: 'View Lavalink node status and performance',
                    inline: false
                },
                {
                    name: '📦 `.r cache`',
                    value: 'View cache statistics and memory usage',
                    inline: false
                },
                {
                    name: '🔧 `.r debug`',
                    value: 'View debug information and API status',
                    inline: false
                },
                {
                    name: '⚙️ `.r config`',
                    value: 'View current server configuration',
                    inline: false
                }
            ])
            .setFooter({ text: 'Requires Manage Server permission' })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }
}

module.exports = new AdminCommands();
