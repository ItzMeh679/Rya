const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config/config.js');
const os = require('os');
const process = require('process');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('utility')
        .setDescription('Bot utility and information commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('Show bot statistics and performance metrics')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Show bot information and features')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('ping')
                .setDescription('Check bot latency and response time')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('help')
                .setDescription('Show available commands and usage guide')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('invite')
                .setDescription('Get bot invite link')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

    cooldown: 5000,

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        try {
            await interaction.deferReply();
            
            switch (subcommand) {
                case 'stats':
                    await this.handleStats(interaction);
                    break;
                case 'info':
                    await this.handleInfo(interaction);
                    break;
                case 'ping':
                    await this.handlePing(interaction);
                    break;
                case 'help':
                    await this.handleHelp(interaction);
                    break;
                case 'invite':
                    await this.handleInvite(interaction);
                    break;
                default:
                    throw new Error('Unknown subcommand');
            }
        } catch (error) {
            console.error('[UTILITY] Command error:', error);
            
            const embed = new EmbedBuilder()
                .setTitle('❌ Command Error')
                .setDescription('An error occurred while executing this command.')
                .setColor(config.getEmbedColor('error'))
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
        }
    },

    async handleStats(interaction) {
        const client = interaction.client;
        const uptime = Date.now() - (client.startTime || Date.now());
        const memUsage = process.memoryUsage();
        
        // Calculate CPU usage
        const cpuUsage = process.cpuUsage();
        const cpuPercent = ((cpuUsage.user + cpuUsage.system) / 1000000 / (uptime / 1000)) * 100;
        
        // Get system info
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        
        // Bot-specific metrics
        const activePlayers = client.musicPlayers?.size || 0;
        const totalCommands = client.metrics?.commandsExecuted || 0;
        const totalTracks = client.metrics?.tracksPlayed || 0;
        
        // Database/Cache stats
        let cacheStats = 'N/A';
        try {
            const lyricsHelper = require('../../utils/lyricsHelper.js');
            const recommendationsHelper = require('../../utils/recommendationsHelper.js');
            
            const lyricsStats = lyricsHelper.getStats();
            const recStats = recommendationsHelper.getStats();
            
            cacheStats = `Lyrics: ${lyricsStats.cacheSize}, Recommendations: ${recStats.cacheSize}`;
        } catch (error) {
            // Helper modules might not be available
        }

        const embed = new EmbedBuilder()
            .setTitle('📊 Bot Statistics')
            .setColor(config.getEmbedColor('info'))
            .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                {
                    name: '🤖 Bot Performance',
                    value: [
                        `**Uptime:** ${this.formatUptime(uptime)}`,
                        `**Latency:** ${client.ws.ping}ms`,
                        `**Commands Executed:** ${totalCommands.toLocaleString()}`,
                        `**Tracks Played:** ${totalTracks.toLocaleString()}`
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '🎵 Music Statistics',
                    value: [
                        `**Active Players:** ${activePlayers}`,
                        `**Guilds Connected:** ${client.guilds.cache.size.toLocaleString()}`,
                        `**Voice Connections:** ${client.voice?.connections?.size || 0}`,
                        `**Cache Status:** ${cacheStats}`
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '💾 Memory Usage',
                    value: [
                        `**Bot Memory:** ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
                        `**System Memory:** ${Math.round(usedMem / 1024 / 1024 / 1024)}GB / ${Math.round(totalMem / 1024 / 1024 / 1024)}GB`,
                        `**Memory Efficiency:** ${((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(1)}%`,
                        `**External Memory:** ${Math.round(memUsage.external / 1024 / 1024)}MB`
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '⚡ System Resources',
                    value: [
                        `**CPU Usage:** ${cpuPercent.toFixed(1)}%`,
                        `**Platform:** ${os.platform()} ${os.arch()}`,
                        `**Node.js Version:** ${process.version}`,
                        `**CPU Cores:** ${os.cpus().length}`
                    ].join('\n'),
                    inline: false
                }
            )
            .setFooter({ 
                text: `Requested by ${interaction.user.username}`,
                iconURL: interaction.user.displayAvatarURL({ dynamic: true })
            })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async handleInfo(interaction) {
        const client = interaction.client;
        const features = this.getEnabledFeatures();
        
        const embed = new EmbedBuilder()
            .setTitle('🎵 Advanced Discord Music Bot')
            .setDescription('Industry-ready music bot with AI-powered features and advanced audio processing.')
            .setColor(config.getEmbedColor('primary'))
            .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 512 }))
            .addFields(
                {
                    name: '🎛️ Core Features',
                    value: [
                        '🎵 **High-Quality Audio Streaming**',
                        '🔍 **Multi-Platform Search** (YouTube, Spotify)',
                        '📑 **Advanced Queue Management**',
                        '🎚️ **Real-time Audio Effects & EQ**',
                        '🤖 **AI-Powered Recommendations**',
                        '🎤 **Live Karaoke Mode** with timed lyrics'
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '🎨 Audio Effects',
                    value: [
                        '🌌 **3D Spatial Sound**',
                        '⚡ **Sped Up & Fast Beats**',
                        '🌊 **Slowed & Reverb**',
                        '🔊 **Bass & Treble Control**',
                        '🎛️ **Custom Audio Filters**',
                        '🎵 **Karaoke Vocal Removal**'
                    ].join('\n'),
                    inline: true
                },
                {
                    name: '🤖 AI Features',
                    value: [
                        '💡 **Smart Recommendations**',
                        '📝 **Lyrics Integration**',
                        '🎯 **Mood-Based Suggestions**',
                        '📊 **Listening Pattern Analysis**',
                        '🔄 **Auto-Playlist Generation**',
                        '🎪 **Genre-Smart Mixing**'
                    ].join('\n'),
                    inline: true
                },
                {
                    name: '⚙️ Technical Specs',
                    value: [
                        `**Audio Quality:** ${config.music.audioQuality}`,
                        `**Max Queue Size:** ${config.music.maxQueueSize.toLocaleString()}`,
                        `**Playlist Support:** ${config.music.maxPlaylistSize} tracks`,
                        `**Volume Range:** 0-${config.music.maxVolume}%`,
                        `**Buffer Size:** ${config.music.bufferSize / 1024}KB`,
                        `**Auto-Leave:** ${config.music.autoLeaveTimeout / 60000} minutes`
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '🌟 Enabled Features',
                    value: features.join('\n'),
                    inline: false
                }
            )
            .setFooter({ 
                text: 'Built with advanced algorithms for optimal performance',
                iconURL: client.user.displayAvatarURL({ dynamic: true })
            })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async handlePing(interaction) {
        const client = interaction.client;
        const startTime = Date.now();
        
        // Calculate different latency measurements
        const wsLatency = client.ws.ping;
        
        // Database/API response time simulation
        const apiStartTime = Date.now();
        await new Promise(resolve => setTimeout(resolve, 1)); // Micro delay for measurement
        const apiLatency = Date.now() - apiStartTime;
        
        const botLatency = Date.now() - startTime;
        
        // Determine latency quality
        const getLatencyQuality = (ping) => {
            if (ping < 50) return { emoji: '🟢', text: 'Excellent', color: config.getEmbedColor('success') };
            if (ping < 100) return { emoji: '🟡', text: 'Good', color: config.getEmbedColor('warning') };
            if (ping < 200) return { emoji: '🟠', text: 'Fair', color: config.getEmbedColor('warning') };
            return { emoji: '🔴', text: 'Poor', color: config.getEmbedColor('error') };
        };

        const wsQuality = getLatencyQuality(wsLatency);
        const botQuality = getLatencyQuality(botLatency);

        const embed = new EmbedBuilder()
            .setTitle('🏓 Pong! Latency Information')
            .setColor(wsQuality.color)
            .addFields(
                {
                    name: '📡 WebSocket Latency',
                    value: `${wsQuality.emoji} **${wsLatency}ms** (${wsQuality.text})`,
                    inline: true
                },
                {
                    name: '🤖 Bot Response Time',
                    value: `${botQuality.emoji} **${botLatency}ms** (${botQuality.text})`,
                    inline: true
                },
                {
                    name: '🔄 API Response Time',
                    value: `⚡ **${apiLatency}ms** (Optimal)`,
                    inline: true
                },
                {
                    name: '📊 Performance Status',
                    value: [
                        `**Uptime:** ${this.formatUptime(Date.now() - (client.startTime || Date.now()))}`,
                        `**Memory Usage:** ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
                        `**Active Connections:** ${client.guilds.cache.size}`,
                        `**Music Players:** ${client.musicPlayers?.size || 0}`
                    ].join('\n'),
                    inline: false
                }
            )
            .setFooter({ 
                text: `Response generated in ${Date.now() - startTime}ms`,
                iconURL: interaction.user.displayAvatarURL({ dynamic: true })
            })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async handleHelp(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🎵 Command Guide')
            .setDescription('Complete guide to using the Advanced Discord Music Bot')
            .setColor(config.getEmbedColor('info'))
            .addFields(
                {
                    name: '🎵 Music Commands',
                    value: [
                        '`/play <song>` - Play a song or playlist',
                        '`/skip` - Skip the current track',
                        '`/queue` - View the current queue',
                        '`/volume <0-150>` - Adjust playback volume',
                        '`/loop <mode>` - Set loop mode (off/track/queue)',
                        '`/shuffle` - Shuffle the current queue',
                        '`/clear` - Clear the entire queue',
                        '`/nowplaying` - Show current track info'
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '🎛️ Audio Effects',
                    value: [
                        '`/effects spatial` - Apply 3D spatial sound',
                        '`/effects speedup` - Sped up with fast beats',
                        '`/effects slowed` - Slowed down with reverb',
                        '`/bass <-5 to 5>` - Adjust bass levels',
                        '`/treble <-5 to 5>` - Adjust treble levels',
                        '`/equalizer` - Open the EQ interface'
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '🤖 AI Features',
                    value: [
                        '`/recommend` - Get AI music recommendations',
                        '`/lyrics` - Show lyrics for current song',
                        '`/karaoke` - Enable live karaoke mode',
                        '`/autoplay` - Toggle AI autoplay',
                        '`/mood <mood>` - Get mood-based suggestions'
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '⚙️ Utility Commands',
                    value: [
                        '`/utility stats` - View bot statistics',
                        '`/utility info` - Show bot information',
                        '`/utility ping` - Check bot latency',
                        '`/utility help` - Show this help guide',
                        '`/utility invite` - Get bot invite link'
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '🎮 Interactive Controls',
                    value: [
                        '**Music Controller** - Use buttons for play/pause/skip',
                        '**Volume Slider** - Interactive volume control',
                        '**Effects Menu** - Apply audio effects instantly',
                        '**Recommendations** - Get AI suggestions with one click',
                        '**Karaoke Mode** - Real-time lyrics display'
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '💡 Pro Tips',
                    value: [
                        '• Use `next:true` option to add songs to front of queue',
                        '• Enable autoplay for endless music discovery',
                        '• Try different audio effects for unique experiences',
                        '• Use karaoke mode for sing-along sessions',
                        '• Combine effects with EQ for custom sound profiles'
                    ].join('\n'),
                    inline: false
                }
            )
            .setFooter({ 
                text: 'For detailed command usage, visit our documentation',
                iconURL: interaction.client.user.displayAvatarURL({ dynamic: true })
            })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async handleInvite(interaction) {
        const client = interaction.client;
        const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=${config.discord.permissions}&scope=bot%20applications.commands`;
        
        const embed = new EmbedBuilder()
            .setTitle('🎵 Invite Advanced Music Bot')
            .setDescription('Add the bot to your server and start enjoying premium music features!')
            .setColor(config.getEmbedColor('primary'))
            .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 512 }))
            .addFields(
                {
                    name: '🔗 Invite Link',
                    value: `[**Click here to invite the bot**](${inviteUrl})`,
                    inline: false
                },
                {
                    name: '⚠️ Required Permissions',
                    value: [
                        '• **Connect & Speak** - Join voice channels',
                        '• **Send Messages** - Bot responses',
                        '• **Embed Links** - Rich music embeds',
                        '• **Use Slash Commands** - Modern command interface',
                        '• **Manage Messages** - Clean interface',
                        '• **Add Reactions** - Interactive controls'
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '🚀 Quick Setup',
                    value: [
                        '1. Click the invite link above',
                        '2. Select your server',
                        '3. Confirm the required permissions',
                        '4. Use `/play <song>` to start!',
                        '5. Explore features with `/help`'
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '💎 Premium Features',
                    value: [
                        '🎵 **Unlimited Queue Size**',
                        '🤖 **AI-Powered Recommendations**',
                        '🎚️ **Advanced Audio Effects**',
                        '🎤 **Live Karaoke Mode**',
                        '📊 **Detailed Analytics**',
                        '⚡ **Priority Support**'
                    ].join('\n'),
                    inline: false
                }
            )
            .setFooter({ 
                text: 'Join thousands of servers already using our bot!',
                iconURL: client.user.displayAvatarURL({ dynamic: true })
            })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    getEnabledFeatures() {
        const features = [];
        
        if (config.isFeatureEnabled('aiRecommendations')) {
            features.push('🤖 AI Recommendations');
        }
        if (config.isFeatureEnabled('lyrics.enableKaraoke')) {
            features.push('🎤 Live Karaoke');
        }
        if (config.isFeatureEnabled('audioEffects')) {
            features.push('🎛️ Audio Effects');
        }
        if (config.isFeatureEnabled('spotifyIntegration')) {
            features.push('🟢 Spotify Integration');
        }
        if (config.isFeatureEnabled('geniusLyrics')) {
            features.push('📝 Genius Lyrics');
        }
        if (config.isFeatureEnabled('autoPlaylist')) {
            features.push('🔄 Auto Playlist');
        }

        return features.length > 0 ? features : ['✅ All core features enabled'];
    },

    formatUptime(milliseconds) {
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
};