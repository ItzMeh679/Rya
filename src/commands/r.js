// src/commands/r.js - Unified Rya bot command with single /r prefix
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config/config.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('r')
        .setDescription('🎵 Rya Music Bot - All commands')
        // Play
        .addSubcommand(sub => sub
            .setName('play')
            .setDescription('Play a song or playlist')
            .addStringOption(opt => opt
                .setName('query')
                .setDescription('Song name, URL, or playlist')
                .setRequired(true)
            )
            .addBooleanOption(opt => opt
                .setName('next')
                .setDescription('Add to front of queue')
                .setRequired(false)
            )
            .addBooleanOption(opt => opt
                .setName('shuffle')
                .setDescription('Shuffle playlist before adding')
                .setRequired(false)
            )
        )
        // Skip
        .addSubcommand(sub => sub
            .setName('skip')
            .setDescription('Skip the current track')
            .addIntegerOption(opt => opt
                .setName('count')
                .setDescription('Number of tracks to skip')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(10)
            )
        )
        // Queue
        .addSubcommand(sub => sub
            .setName('queue')
            .setDescription('View the current queue')
            .addIntegerOption(opt => opt
                .setName('page')
                .setDescription('Page number')
                .setRequired(false)
                .setMinValue(1)
            )
        )
        // Volume
        .addSubcommand(sub => sub
            .setName('vol')
            .setDescription('Set playback volume')
            .addIntegerOption(opt => opt
                .setName('level')
                .setDescription('Volume level (0-150)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(150)
            )
        )
        // Now Playing
        .addSubcommand(sub => sub
            .setName('np')
            .setDescription('Show current track info')
        )
        // Stop
        .addSubcommand(sub => sub
            .setName('stop')
            .setDescription('Stop playback and disconnect')
        )
        // Pause
        .addSubcommand(sub => sub
            .setName('pause')
            .setDescription('Pause playback')
        )
        // Resume
        .addSubcommand(sub => sub
            .setName('resume')
            .setDescription('Resume playback')
        )
        // Loop
        .addSubcommand(sub => sub
            .setName('loop')
            .setDescription('Set loop mode')
            .addStringOption(opt => opt
                .setName('mode')
                .setDescription('Loop mode')
                .setRequired(true)
                .addChoices(
                    { name: '➡️ Off', value: 'off' },
                    { name: '🔂 Track', value: 'track' },
                    { name: '🔁 Queue', value: 'queue' }
                )
            )
        )
        // Shuffle
        .addSubcommand(sub => sub
            .setName('shuffle')
            .setDescription('Shuffle the queue')
        )
        // Clear
        .addSubcommand(sub => sub
            .setName('clear')
            .setDescription('Clear the queue')
        )
        // Autoplay
        .addSubcommand(sub => sub
            .setName('autoplay')
            .setDescription('Toggle AI autoplay')
        )
        // Recommend
        .addSubcommand(sub => sub
            .setName('recommend')
            .setDescription('Get AI music recommendations')
        )
        // Lyrics
        .addSubcommand(sub => sub
            .setName('lyrics')
            .setDescription('Get lyrics for current or specified song')
            .addStringOption(opt => opt
                .setName('song')
                .setDescription('Song name (optional)')
                .setRequired(false)
            )
            .addStringOption(opt => opt
                .setName('artist')
                .setDescription('Artist name')
                .setRequired(false)
            )
        )
        // Effects
        .addSubcommand(sub => sub
            .setName('fx')
            .setDescription('Apply audio effects')
            .addStringOption(opt => opt
                .setName('effect')
                .setDescription('Effect to apply')
                .setRequired(true)
                .addChoices(
                    { name: '🔊 Bass Boost', value: 'bass' },
                    { name: '🎵 Nightcore', value: 'nightcore' },
                    { name: '🌊 Slowed + Reverb', value: 'slowed' },
                    { name: '🎧 8D Audio', value: '8d' },
                    { name: '📻 Lo-Fi', value: 'lofi' },
                    { name: '🎤 Karaoke', value: 'karaoke' },
                    { name: '❌ Clear All', value: 'clear' }
                )
            )
        )
        // Bass
        .addSubcommand(sub => sub
            .setName('bass')
            .setDescription('Adjust bass level')
            .addIntegerOption(opt => opt
                .setName('level')
                .setDescription('Bass level (1-10)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(10)
            )
        )
        // Seek
        .addSubcommand(sub => sub
            .setName('seek')
            .setDescription('Seek to position in track')
            .addStringOption(opt => opt
                .setName('time')
                .setDescription('Time (e.g., 1:30 or 90)')
                .setRequired(true)
            )
        )
        // Remove
        .addSubcommand(sub => sub
            .setName('remove')
            .setDescription('Remove a track from queue')
            .addIntegerOption(opt => opt
                .setName('position')
                .setDescription('Position in queue (1-based)')
                .setRequired(true)
                .setMinValue(1)
            )
        )
        // Help
        .addSubcommand(sub => sub
            .setName('help')
            .setDescription('Show all commands')
        )
        // Stats
        .addSubcommand(sub => sub
            .setName('stats')
            .setDescription('Show bot statistics')
        )
        // History
        .addSubcommand(sub => sub
            .setName('history')
            .setDescription('View listening history')
            .addIntegerOption(opt => opt
                .setName('count')
                .setDescription('Number of tracks to show')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(25)
            )
        )
        // Set Prefix
        .addSubcommand(sub => sub
            .setName('prefix')
            .setDescription('Set custom text prefix for this server')
            .addStringOption(opt => opt
                .setName('new_prefix')
                .setDescription('New prefix (e.g., !m, .r, $)')
                .setRequired(true)
            )
        )
        // My Stats
        .addSubcommand(sub => sub
            .setName('mystats')
            .setDescription('View your personal listening statistics')
        )
        // Top Tracks
        .addSubcommand(sub => sub
            .setName('toptrack')
            .setDescription('View your most played tracks')
            .addIntegerOption(opt => opt
                .setName('count')
                .setDescription('Number of tracks to show (1-20)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(20)
            )
        )
        // Top Artists
        .addSubcommand(sub => sub
            .setName('topartist')
            .setDescription('View your most played artists')
            .addIntegerOption(opt => opt
                .setName('count')
                .setDescription('Number of artists to show (1-20)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(20)
            )
        )
        // Leaderboard
        .addSubcommand(sub => sub
            .setName('leaderboard')
            .setDescription('View listening leaderboard')
            .addStringOption(opt => opt
                .setName('scope')
                .setDescription('Leaderboard scope')
                .setRequired(false)
                .addChoices(
                    { name: '🏠 Server', value: 'server' },
                    { name: '🌍 Global', value: 'global' }
                )
            )
        )
        // Clear History
        .addSubcommand(sub => sub
            .setName('clearhistory')
            .setDescription('Clear your saved listening history from database')
            .addBooleanOption(opt => opt
                .setName('confirm')
                .setDescription('Skip confirmation prompt')
                .setRequired(false)
            )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Connect | PermissionFlagsBits.Speak),

    cooldown: 2000,

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        try {
            // Get player
            const player = interaction.client.lavalink?.kazagumo?.players?.get(interaction.guildId);

            // Commands that don't need a player
            const noPlayerCommands = ['play', 'recommend', 'help', 'stats', 'lyrics', 'history', 'prefix', 'mystats', 'toptrack', 'topartist', 'leaderboard', 'clearhistory'];

            if (!noPlayerCommands.includes(subcommand) && !player) {
                return interaction.reply({
                    embeds: [this.errorEmbed('No active player', 'Use `/r play <song>` to start playing music!')],
                    ephemeral: true
                });
            }

            // Route to handlers
            switch (subcommand) {
                case 'play': return await this.handlePlay(interaction);
                case 'skip': return await this.handleSkip(interaction, player);
                case 'queue': return await this.handleQueue(interaction, player);
                case 'vol': return await this.handleVolume(interaction, player);
                case 'np': return await this.handleNowPlaying(interaction, player);
                case 'stop': return await this.handleStop(interaction, player);
                case 'pause': return await this.handlePause(interaction, player);
                case 'resume': return await this.handleResume(interaction, player);
                case 'loop': return await this.handleLoop(interaction, player);
                case 'shuffle': return await this.handleShuffle(interaction, player);
                case 'clear': return await this.handleClear(interaction, player);
                case 'autoplay': return await this.handleAutoplay(interaction, player);
                case 'recommend': return await this.handleRecommend(interaction);
                case 'lyrics': return await this.handleLyrics(interaction);
                case 'fx': return await this.handleEffects(interaction, player);
                case 'bass': return await this.handleBass(interaction, player);
                case 'seek': return await this.handleSeek(interaction, player);
                case 'remove': return await this.handleRemove(interaction, player);
                case 'help': return await this.handleHelp(interaction);
                case 'stats': return await this.handleStats(interaction);
                case 'history': return await this.handleHistory(interaction);
                case 'prefix': return await this.handlePrefix(interaction);
                case 'mystats': return await this.handleMyStats(interaction);
                case 'toptrack': return await this.handleTopTracks(interaction);
                case 'topartist': return await this.handleTopArtists(interaction);
                case 'leaderboard': return await this.handleLeaderboard(interaction);
                case 'clearhistory': return await this.handleClearHistory(interaction);
                default:
                    return interaction.reply({ embeds: [this.errorEmbed('Unknown command')], ephemeral: true });
            }
        } catch (error) {
            console.error('[RYA CMD] Error:', error);
            const method = interaction.deferred || interaction.replied ? 'editReply' : 'reply';
            return interaction[method]({
                embeds: [this.errorEmbed('Command Error', error.message)],
                ephemeral: true
            });
        }
    },

    // ===== PLAY HANDLER =====
    async handlePlay(interaction) {
        await interaction.deferReply();

        const query = interaction.options.getString('query');
        const playNext = interaction.options.getBoolean('next') || false;
        const shuffle = interaction.options.getBoolean('shuffle') || false;

        // Check voice channel
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) {
            return interaction.editReply({ embeds: [this.errorEmbed('Join a voice channel first!')] });
        }

        try {
            const lavalink = interaction.client.lavalink;
            let player = lavalink.kazagumo.players.get(interaction.guildId);

            // Create player if doesn't exist
            if (!player) {
                player = await lavalink.kazagumo.createPlayer({
                    guildId: interaction.guildId,
                    textId: interaction.channelId,
                    voiceId: voiceChannel.id,
                    volume: 100,
                    deaf: true
                });
            }

            // Search for tracks
            const result = await lavalink.search(query, { requester: interaction.user });

            if (!result || !result.tracks || result.tracks.length === 0) {
                return interaction.editReply({ embeds: [this.errorEmbed('No results found', `Couldn't find: "${query}"`)] });
            }

            // Handle playlist
            if (result.type === 'PLAYLIST') {
                let tracks = result.tracks;
                if (shuffle) {
                    tracks = this.shuffleArray([...tracks]);
                }

                if (playNext) {
                    tracks.reverse().forEach(track => player.queue.unshift(track));
                } else {
                    tracks.forEach(track => player.queue.add(track));
                }

                const embed = new EmbedBuilder()
                    .setColor(0x00D166)
                    .setDescription(`📑 Added **${tracks.length}** tracks from **${result.playlistName}**${shuffle ? ' (shuffled)' : ''}`)
                    .setTimestamp();

                if (!player.playing && !player.paused) player.play();
                return interaction.editReply({ embeds: [embed] });
            }

            // Single track
            const track = result.tracks[0];
            if (playNext) {
                player.queue.unshift(track);
            } else {
                player.queue.add(track);
            }

            const embed = new EmbedBuilder()
                .setColor(0x00D166)
                .setDescription(`🎵 Added **[${track.title}](${track.uri})**${playNext ? ' to front of queue' : ''}`)
                .setThumbnail(track.thumbnail || null)
                .setFooter({ text: `Duration: ${this.formatDuration(track.length)}` })
                .setTimestamp();

            if (!player.playing && !player.paused) player.play();
            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[PLAY] Error:', error);
            return interaction.editReply({ embeds: [this.errorEmbed('Play Error', error.message)] });
        }
    },

    // ===== MUSIC CONTROL HANDLERS =====

    async handleSkip(interaction, player) {
        await interaction.deferReply();
        const count = interaction.options.getInteger('count') || 1;

        if (!player.queue.current) {
            return interaction.editReply({ embeds: [this.errorEmbed('Nothing playing')] });
        }

        const skippedTitle = player.queue.current.title;

        if (count > 1 && player.queue.length >= count - 1) {
            for (let i = 0; i < count - 1; i++) player.queue.shift();
        }

        player.skip();

        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor(0x00D166)
                .setDescription(`⏭️ Skipped${count > 1 ? ` ${count} tracks` : ''}: **${skippedTitle}**`)]
        });
    },

    async handleQueue(interaction, player) {
        await interaction.deferReply();
        const page = interaction.options.getInteger('page') || 1;
        const queue = player.queue;
        const current = queue.current;

        if (!current) {
            return interaction.editReply({ embeds: [this.errorEmbed('Queue is empty')] });
        }

        const tracksPerPage = 10;
        const totalPages = Math.max(1, Math.ceil(queue.length / tracksPerPage));
        const currentPage = Math.min(page, totalPages);
        const start = (currentPage - 1) * tracksPerPage;
        const tracks = queue.slice(start, start + tracksPerPage);

        let desc = `**Now Playing:**\n🎵 [${current.title}](${current.uri}) - \`${this.formatDuration(current.length)}\`\n\n`;

        if (queue.length > 0) {
            desc += '**Up Next:**\n';
            tracks.forEach((track, i) => {
                desc += `\`${start + i + 1}.\` [${track.title}](${track.uri}) - \`${this.formatDuration(track.length)}\`\n`;
            });
        } else {
            desc += '*No tracks in queue*';
        }

        const totalDuration = queue.reduce((acc, t) => acc + (t.length || 0), current.length || 0);

        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('📜 Queue')
                .setDescription(desc)
                .setFooter({ text: `Page ${currentPage}/${totalPages} • ${queue.length + 1} tracks • ${this.formatDuration(totalDuration)} total` })]
        });
    },

    async handleVolume(interaction, player) {
        await interaction.deferReply();
        const level = interaction.options.getInteger('level');
        player.setVolume(level);

        const bars = Math.round(level / 10);
        const volumeBar = '█'.repeat(bars) + '░'.repeat(15 - bars);

        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor(0x5865F2)
                .setDescription(`🔊 Volume: **${level}%**\n\`${volumeBar}\``)]
        });
    },

    async handleNowPlaying(interaction, player) {
        await interaction.deferReply();
        const current = player.queue.current;

        if (!current) {
            return interaction.editReply({ embeds: [this.errorEmbed('Nothing playing')] });
        }

        const position = player.position || 0;
        const duration = current.length || 0;
        const progress = duration > 0 ? (position / duration) : 0;
        const barLength = 20;
        const filled = Math.round(barLength * progress);
        const progressBar = '▓'.repeat(filled) + '░'.repeat(barLength - filled);

        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor(0x9B59B6)
                .setTitle('🎵 Now Playing')
                .setDescription(`**[${current.title}](${current.uri})**`)
                .addFields(
                    { name: 'Artist', value: current.author || 'Unknown', inline: true },
                    { name: 'Duration', value: `\`${this.formatDuration(position)}\` / \`${this.formatDuration(duration)}\``, inline: true },
                    { name: 'Volume', value: `${player.volume}%`, inline: true },
                    { name: 'Progress', value: `\`${progressBar}\``, inline: false }
                )
                .setThumbnail(current.thumbnail || null)
                .setFooter({ text: `Requested by ${current.requester?.username || 'Unknown'}` })]
        });
    },

    async handleStop(interaction, player) {
        await interaction.deferReply();
        player.destroy();
        return interaction.editReply({
            embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('⏹️ Stopped playback and disconnected')]
        });
    },

    async handlePause(interaction, player) {
        await interaction.deferReply();
        if (player.paused) {
            return interaction.editReply({ embeds: [this.errorEmbed('Already paused')] });
        }
        player.pause(true);
        return interaction.editReply({
            embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('⏸️ Paused playback')]
        });
    },

    async handleResume(interaction, player) {
        await interaction.deferReply();
        if (!player.paused) {
            return interaction.editReply({ embeds: [this.errorEmbed('Already playing')] });
        }
        player.pause(false);
        return interaction.editReply({
            embeds: [new EmbedBuilder().setColor(0x00D166).setDescription('▶️ Resumed playback')]
        });
    },

    async handleLoop(interaction, player) {
        await interaction.deferReply();
        const mode = interaction.options.getString('mode');
        const modeMap = { 'off': 'none', 'track': 'track', 'queue': 'queue' };
        player.setLoop(modeMap[mode]);

        const emojis = { 'off': '➡️', 'track': '🔂', 'queue': '🔁' };
        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor(0x5865F2)
                .setDescription(`${emojis[mode]} Loop mode: **${mode.charAt(0).toUpperCase() + mode.slice(1)}**`)]
        });
    },

    async handleShuffle(interaction, player) {
        await interaction.deferReply();
        if (player.queue.length < 2) {
            return interaction.editReply({ embeds: [this.errorEmbed('Need at least 2 tracks to shuffle')] });
        }
        player.queue.shuffle();
        return interaction.editReply({
            embeds: [new EmbedBuilder().setColor(0x00D166).setDescription(`🔀 Shuffled **${player.queue.length}** tracks`)]
        });
    },

    async handleClear(interaction, player) {
        await interaction.deferReply();
        const count = player.queue.length;
        player.queue.clear();
        return interaction.editReply({
            embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`🗑️ Cleared **${count}** tracks from queue`)]
        });
    },

    async handleAutoplay(interaction, player) {
        await interaction.deferReply();
        player.data.autoplay = !player.data.autoplay;
        const status = player.data.autoplay;
        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor(status ? 0x00D166 : 0xED4245)
                .setDescription(`${status ? '🤖 Autoplay **enabled**' : '🚫 Autoplay **disabled**'}`)
                .setFooter({ text: status ? 'AI will add similar tracks when queue ends' : '' })]
        });
    },

    async handleRecommend(interaction) {
        await interaction.deferReply();
        try {
            const recommendationsHelper = require('../utils/recommendationsHelper.js');
            const player = interaction.client.lavalink?.kazagumo?.players?.get(interaction.guildId);
            const currentTrack = player?.queue?.current;

            if (!currentTrack) {
                return interaction.editReply({ embeds: [this.errorEmbed('No track playing', 'Play a song first!')] });
            }

            const recommendations = await recommendationsHelper.getRecommendations(currentTrack, [], {
                count: 5,
                userId: interaction.user.id  // Enable Supabase history for personalization
            });

            if (!recommendations?.length) {
                return interaction.editReply({ embeds: [this.errorEmbed('No recommendations found')] });
            }

            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(0x9B59B6)
                    .setTitle('🤖 AI Recommendations')
                    .setDescription(`Based on: **${currentTrack.title}**\n\n` +
                        recommendations.map((r, i) => `\`${i + 1}.\` **${r.title || r.name}** - ${r.artist || r.artists?.[0]?.name || 'Unknown'}`).join('\n')
                    )
                    .setFooter({ text: 'Use /r play to add any of these' })]
            });
        } catch (error) {
            return interaction.editReply({ embeds: [this.errorEmbed('Recommendation Error', error.message)] });
        }
    },

    async handleLyrics(interaction) {
        await interaction.deferReply();
        try {
            const lyricsHelper = require('../utils/lyricsHelper.js');
            const songQuery = interaction.options.getString('song');
            const artistQuery = interaction.options.getString('artist');

            let trackInfo;
            if (songQuery) {
                trackInfo = { title: songQuery, artist: artistQuery || 'Unknown' };
            } else {
                const player = interaction.client.lavalink?.kazagumo?.players?.get(interaction.guildId);
                const current = player?.queue?.current;
                if (!current) {
                    return interaction.editReply({ embeds: [this.errorEmbed('No song playing', 'Use `/r lyrics song:<name>` to search')] });
                }
                trackInfo = {
                    title: current.title || current.spotifyData?.name || 'Unknown',
                    artist: current.author || current.spotifyData?.artists?.[0]?.name || 'Unknown',
                    spotifyData: current.spotifyData
                };
            }

            const lyrics = await lyricsHelper.getLyrics(trackInfo);
            if (!lyrics) {
                return interaction.editReply({ embeds: [this.errorEmbed('Lyrics not found', `No lyrics for **${trackInfo.title}**`)] });
            }

            const lyricsText = lyrics.length > 4000 ? lyrics.substring(0, 4000) + '\n\n... (truncated)' : lyrics;
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(0x9B59B6)
                    .setTitle(`🎤 ${trackInfo.title}`)
                    .setDescription(lyricsText)
                    .setFooter({ text: `Artist: ${trackInfo.artist}` })]
            });
        } catch (error) {
            return interaction.editReply({ embeds: [this.errorEmbed('Lyrics Error', error.message)] });
        }
    },

    async handleEffects(interaction, player) {
        await interaction.deferReply();
        const effect = interaction.options.getString('effect');

        const effectConfigs = {
            'bass': { equalizer: [{ band: 0, gain: 0.3 }, { band: 1, gain: 0.2 }] },
            'nightcore': { timescale: { speed: 1.2, pitch: 1.2, rate: 1 } },
            'slowed': { timescale: { speed: 0.85, pitch: 0.9, rate: 1 } },
            '8d': { rotation: { rotationHz: 0.2 } },
            'lofi': { equalizer: [{ band: 0, gain: 0.1 }, { band: 1, gain: 0.1 }, { band: 2, gain: -0.1 }] },
            'karaoke': { karaoke: { level: 1, monoLevel: 1, filterBand: 220, filterWidth: 100 } },
            'clear': {}
        };

        const effectNames = {
            'bass': '🔊 Bass Boost', 'nightcore': '🎵 Nightcore', 'slowed': '🌊 Slowed + Reverb',
            '8d': '🎧 8D Audio', 'lofi': '📻 Lo-Fi', 'karaoke': '🎤 Karaoke', 'clear': '❌ Clear All'
        };

        await player.setFilters(effectConfigs[effect]);
        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor(effect === 'clear' ? 0xED4245 : 0x9B59B6)
                .setDescription(`${effectNames[effect]} ${effect === 'clear' ? 'removed' : 'applied'}!`)]
        });
    },

    async handleBass(interaction, player) {
        await interaction.deferReply();
        const level = interaction.options.getInteger('level');
        const gain = level / 20;

        await player.setFilters({
            equalizer: [{ band: 0, gain }, { band: 1, gain: gain * 0.8 }, { band: 2, gain: gain * 0.5 }]
        });

        return interaction.editReply({
            embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription(`🔊 Bass level set to **${level}**`)]
        });
    },

    async handleSeek(interaction, player) {
        await interaction.deferReply();
        const timeStr = interaction.options.getString('time');
        let seconds = 0;

        if (timeStr.includes(':')) {
            const parts = timeStr.split(':').map(Number);
            seconds = parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else {
            seconds = parseInt(timeStr);
        }

        const ms = seconds * 1000;
        if (ms > (player.queue.current?.length || 0)) {
            return interaction.editReply({ embeds: [this.errorEmbed('Invalid time')] });
        }

        player.seek(ms);
        return interaction.editReply({
            embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription(`⏩ Seeked to \`${this.formatDuration(ms)}\``)]
        });
    },

    async handleRemove(interaction, player) {
        await interaction.deferReply();
        const position = interaction.options.getInteger('position');

        if (position > player.queue.length) {
            return interaction.editReply({ embeds: [this.errorEmbed('Invalid position')] });
        }

        const removed = player.queue.splice(position - 1, 1)[0];
        return interaction.editReply({
            embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`🗑️ Removed: **${removed.title}**`)]
        });
    },

    async handleHelp(interaction) {
        await interaction.deferReply();
        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🎵 Rya Bot Commands')
                .setDescription('All commands use the `/r` prefix')
                .addFields(
                    { name: '🎵 Playback', value: '`play` `skip` `pause` `resume` `stop` `seek`', inline: true },
                    { name: '📜 Queue', value: '`queue` `shuffle` `clear` `remove` `loop`', inline: true },
                    { name: '🔊 Audio', value: '`vol` `fx` `bass`', inline: true },
                    { name: '🤖 AI', value: '`recommend` `autoplay` `lyrics`', inline: true },
                    { name: '📊 Info', value: '`np` `stats` `history` `help`', inline: true }
                )
                .setFooter({ text: 'Example: /r play never gonna give you up' })]
        });
    },

    async handleStats(interaction) {
        await interaction.deferReply();
        const client = interaction.client;
        const memUsage = process.memoryUsage();
        const uptime = Date.now() - (client.startTime || Date.now());

        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('📊 Bot Statistics')
                .addFields(
                    { name: '🤖 Bot', value: `Latency: ${client.ws.ping}ms\nUptime: ${this.formatUptime(uptime)}`, inline: true },
                    { name: '🎵 Music', value: `Active Players: ${client.lavalink?.kazagumo?.players?.size || 0}\nGuilds: ${client.guilds.cache.size}`, inline: true },
                    { name: '💾 Memory', value: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`, inline: true }
                )]
        });
    },

    async handleHistory(interaction) {
        await interaction.deferReply();
        const count = interaction.options.getInteger('count') || 10;

        // Get history from Supabase via statsManager
        const statsManager = require('../utils/statsManager.js');
        const supabaseHistory = await statsManager.getUserHistory(interaction.user.id, count);

        // Fall back to in-memory player history if Supabase has no data
        if (!supabaseHistory || supabaseHistory.length === 0) {
            const player = interaction.client.lavalink?.kazagumo?.players?.get(interaction.guildId);
            const inMemoryHistory = player?.data?.history || [];

            if (inMemoryHistory.length === 0) {
                return interaction.editReply({ embeds: [this.errorEmbed('No history', 'Play some songs to build your listening history!')] });
            }

            const tracks = inMemoryHistory.slice(0, count);
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('📜 Session History')
                    .setDescription(tracks.map((t, i) => `\`${i + 1}.\` **${t.title}** - ${t.author || 'Unknown'}`).join('\n'))
                    .setFooter({ text: `Showing ${tracks.length} tracks (session only - Supabase not available)` })]
            });
        }

        // Format Supabase history
        const description = supabaseHistory.map((track, i) => {
            const timeAgo = this.getTimeAgo(new Date(track.played_at));
            return `\`${i + 1}.\` **${track.track_title}** - ${track.track_artist}\n*${timeAgo}*`;
        }).join('\n\n');

        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('📜 Your Listening History')
                .setDescription(description)
                .setFooter({ text: `Showing ${supabaseHistory.length} tracks from Supabase` })]
        });
    },

    // Helper for time formatting
    getTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        const intervals = {
            year: 31536000, month: 2592000, week: 604800, day: 86400, hour: 3600, minute: 60
        };
        for (const [name, value] of Object.entries(intervals)) {
            const interval = Math.floor(seconds / value);
            if (interval >= 1) return `${interval} ${name}${interval > 1 ? 's' : ''} ago`;
        }
        return 'Just now';
    },

    // ===== UTILITIES =====

    errorEmbed(title, description = '') {
        return new EmbedBuilder().setColor(0xED4245).setTitle(`❌ ${title}`).setDescription(description);
    },

    formatDuration(ms) {
        if (!ms || isNaN(ms)) return '0:00';
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        if (hours > 0) return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
        return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
    },

    formatUptime(ms) {
        const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
        if (d > 0) return `${d}d ${h % 24}h`;
        if (h > 0) return `${h}h ${m % 60}m`;
        return `${m}m ${s % 60}s`;
    },

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    },

    async handlePrefix(interaction) {
        const prefixManager = require('../utils/prefixManager.js');
        const newPrefix = interaction.options.getString('new_prefix');

        try {
            // Only allow admins to change prefix
            if (!interaction.member.permissions.has('ManageGuild')) {
                return interaction.reply({
                    embeds: [this.errorEmbed('Permission Denied', 'You need **Manage Server** permission to change the prefix.')],
                    ephemeral: true
                });
            }

            await prefixManager.setPrefix(interaction.guildId, newPrefix);

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(0x00D166)
                    .setTitle('✅ Prefix Updated')
                    .setDescription(`Custom prefix set to: **\`${newPrefix}\`**`)
                    .addFields(
                        { name: 'Usage Examples', value: `\`${newPrefix}play <song>\`\n\`${newPrefix}skip\`\n\`${newPrefix}queue\``, inline: true },
                        { name: 'Slash Command', value: 'You can still use `/r` for all commands', inline: true }
                    )
                    .setFooter({ text: 'Prefix is saved and persists across restarts' })]
            });
        } catch (error) {
            return interaction.reply({
                embeds: [this.errorEmbed('Invalid Prefix', error.message)],
                ephemeral: true
            });
        }
    },

    // ===== STATS HANDLERS =====

    async handleMyStats(interaction) {
        await interaction.deferReply();
        const statsManager = require('../utils/statsManager.js');

        try {
            const stats = await statsManager.getUserStats(interaction.user.id);

            if (!stats) {
                return interaction.editReply({
                    embeds: [this.errorEmbed('No stats yet', 'Listen to some music first!')]
                });
            }

            const hours = Math.round(stats.total_duration_ms / 3600000 * 10) / 10;
            const weeklyHours = Math.round(stats.weekly_duration_ms / 3600000 * 10) / 10;

            const embed = new EmbedBuilder()
                .setColor(0x9B59B6)
                .setTitle('📊 Your Listening Stats')
                .setThumbnail(interaction.user.displayAvatarURL())
                .addFields(
                    { name: '🎵 Total Tracks', value: `${stats.total_tracks.toLocaleString()}`, inline: true },
                    { name: '⏱️ Total Hours', value: `${hours}h`, inline: true },
                    { name: '🔥 Streak', value: `${stats.current_streak} days`, inline: true },
                    { name: '📅 This Week', value: `${stats.weekly_tracks} tracks (${weeklyHours}h)`, inline: true },
                    { name: '🏆 Longest Streak', value: `${stats.longest_streak} days`, inline: true }
                )
                .setFooter({ text: `Member since ${new Date(stats.created_at).toLocaleDateString()}` })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('[MYSTATS] Error:', error);
            return interaction.editReply({ embeds: [this.errorEmbed('Stats Error', error.message)] });
        }
    },

    async handleTopTracks(interaction) {
        await interaction.deferReply();
        const statsManager = require('../utils/statsManager.js');
        const count = interaction.options.getInteger('count') || 10;

        try {
            const tracks = await statsManager.getUserTopTracks(interaction.user.id, count);

            if (!tracks || tracks.length === 0) {
                return interaction.editReply({
                    embeds: [this.errorEmbed('No tracks yet', 'Listen to some music first!')]
                });
            }

            const description = tracks.map((t, i) => {
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`${i + 1}.\``;
                return `${medal} **${t.title}** - ${t.artist} (${t.plays} plays)`;
            }).join('\n');

            const embed = new EmbedBuilder()
                .setColor(0xE91E63)
                .setTitle('🎵 Your Top Tracks')
                .setDescription(description)
                .setThumbnail(interaction.user.displayAvatarURL())
                .setFooter({ text: `Showing top ${tracks.length} tracks` })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('[TOPTRACK] Error:', error);
            return interaction.editReply({ embeds: [this.errorEmbed('Error', error.message)] });
        }
    },

    async handleTopArtists(interaction) {
        await interaction.deferReply();
        const statsManager = require('../utils/statsManager.js');
        const count = interaction.options.getInteger('count') || 10;

        try {
            const artists = await statsManager.getUserTopArtists(interaction.user.id, count);

            if (!artists || artists.length === 0) {
                return interaction.editReply({
                    embeds: [this.errorEmbed('No artists yet', 'Listen to some music first!')]
                });
            }

            const description = artists.map((a, i) => {
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`${i + 1}.\``;
                return `${medal} **${a.artist}** (${a.plays} plays)`;
            }).join('\n');

            const embed = new EmbedBuilder()
                .setColor(0x3F51B5)
                .setTitle('🎤 Your Top Artists')
                .setDescription(description)
                .setThumbnail(interaction.user.displayAvatarURL())
                .setFooter({ text: `Showing top ${artists.length} artists` })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('[TOPARTIST] Error:', error);
            return interaction.editReply({ embeds: [this.errorEmbed('Error', error.message)] });
        }
    },

    async handleLeaderboard(interaction) {
        await interaction.deferReply();
        const statsManager = require('../utils/statsManager.js');
        const scope = interaction.options.getString('scope') || 'server';

        try {
            let leaderboard, title;

            if (scope === 'global') {
                leaderboard = await statsManager.getGlobalLeaderboard(10);
                title = '🌍 Global Leaderboard';
            } else {
                leaderboard = await statsManager.getServerLeaderboard(interaction.guildId, 10);
                title = '🏠 Server Leaderboard';
            }

            if (!leaderboard || leaderboard.length === 0) {
                return interaction.editReply({
                    embeds: [this.errorEmbed('No data yet', 'No listening history found!')]
                });
            }

            const description = leaderboard.map((user, i) => {
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`${i + 1}.\``;
                const hours = user.hours ? ` (${user.hours}h)` : '';
                return `${medal} **${user.username}** - ${user.plays} tracks${hours}`;
            }).join('\n');

            const embed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle(title)
                .setDescription(description)
                .setFooter({ text: `Top ${leaderboard.length} listeners` })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('[LEADERBOARD] Error:', error);
            return interaction.editReply({ embeds: [this.errorEmbed('Error', error.message)] });
        }
    },

    async handleClearHistory(interaction) {
        const skipConfirmation = interaction.options.getBoolean('confirm') || false;
        const statsManager = require('../utils/statsManager.js');

        if (!skipConfirmation) {
            // Show confirmation embed
            const confirmEmbed = new EmbedBuilder()
                .setColor(0xFEE75C)
                .setTitle('⚠️ Clear Listening History')
                .setDescription(
                    '**Are you sure you want to clear your entire listening history?**\n\n' +
                    '🗑️ This will permanently delete:\n' +
                    '• All your tracked songs\n' +
                    '• Your listening statistics\n' +
                    '• Your top tracks data\n\n' +
                    '⚠️ **This action cannot be undone!**\n\n' +
                    'Use `/r clearhistory confirm:true` to confirm.'
                )
                .setTimestamp();

            return interaction.reply({ embeds: [confirmEmbed], ephemeral: true });
        }

        // User confirmed - proceed with clearing
        await interaction.deferReply({ ephemeral: true });

        try {
            const result = await statsManager.clearUserHistory(interaction.user.id);

            if (result.success) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setColor(0x00D166)
                        .setTitle('✅ History Cleared')
                        .setDescription(
                            `Successfully cleared your listening history!\n\n` +
                            `🗑️ **${result.count}** tracks removed from the database.`
                        )
                        .setTimestamp()]
                });
            } else {
                return interaction.editReply({
                    embeds: [this.errorEmbed('Failed to Clear', result.error || 'Unknown error')]
                });
            }
        } catch (error) {
            console.error('[CLEARHISTORY] Error:', error);
            return interaction.editReply({
                embeds: [this.errorEmbed('Error', error.message)]
            });
        }
    }
};
