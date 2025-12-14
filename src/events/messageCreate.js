// src/events/messageCreate.js - Handler for text prefix commands
const { EmbedBuilder } = require('discord.js');
const prefixManager = require('../utils/prefixManager.js');
const adminCommands = require('../utils/adminCommands.js');
const { formatDuration, getTimeAgo } = require('../utils/formatUtils.js');

module.exports = {
    name: 'messageCreate',

    async execute(message) {
        // Ignore bots and DMs
        if (message.author.bot || !message.guild) return;

        const content = message.content.trim();

        // ===== ADMIN COMMANDS: .r <command> =====
        if (content.startsWith('.r ')) {
            const args = content.slice(3).trim().split(/\s+/);
            const command = args.shift();

            if (command) {
                console.log(`[ADMIN CMD] ${message.author.tag}: .r ${command} ${args.join(' ')}`);
                await adminCommands.execute(message, command, args);
            }
            return;
        }

        // ===== UTILITY COMMANDS: !r <command> =====
        if (content.startsWith('!r ')) {
            const args = content.slice(3).trim().split(/\s+/);
            const command = args.shift()?.toLowerCase();

            if (command) {
                console.log(`[UTILITY CMD] ${message.author.tag}: !r ${command} ${args.join(' ')}`);
                await handleUtilityCommand(message, command, args);
            }
            return;
        }

        // Parse message for prefix command (e.g., !rplay)
        const parsed = prefixManager.parseMessage(message.guild.id, message.content);
        if (!parsed) return;

        const { command, args, fullArgs } = parsed;
        if (!command) return;

        console.log(`[PREFIX CMD] ${message.author.tag}: ${parsed.prefix}${command} ${fullArgs}`);

        try {
            // Get player
            const player = message.client.lavalink?.kazagumo?.players?.get(message.guildId);

            // Route commands
            switch (command) {
                // ===== PLAYBACK =====
                case 'play':
                case 'p':
                    await handlePlay(message, fullArgs);
                    break;

                case 'skip':
                case 's':
                    await handleSkip(message, player);
                    break;

                case 'pause':
                    await handlePause(message, player);
                    break;

                case 'resume':
                case 'unpause':
                    await handleResume(message, player);
                    break;

                case 'stop':
                case 'dc':
                case 'disconnect':
                case 'leave':
                    await handleStop(message, player);
                    break;

                // ===== QUEUE =====
                case 'queue':
                case 'q':
                    await handleQueue(message, player);
                    break;

                case 'shuffle':
                    await handleShuffle(message, player);
                    break;

                case 'clear':
                    await handleClear(message, player);
                    break;

                case 'loop':
                case 'repeat':
                    await handleLoop(message, player, args[0]);
                    break;

                // ===== AUDIO =====
                case 'vol':
                case 'volume':
                case 'v':
                    await handleVolume(message, player, args[0]);
                    break;

                case 'np':
                case 'nowplaying':
                case 'now':
                    await handleNowPlaying(message, player);
                    break;

                // ===== EFFECTS =====
                case 'bass':
                    await handleBass(message, player, args[0]);
                    break;

                case 'nightcore':
                case 'nc':
                    await handleEffect(message, player, 'nightcore');
                    break;

                case 'slowed':
                case 'slow':
                    await handleEffect(message, player, 'slowed');
                    break;

                case '8d':
                    await handleEffect(message, player, '8d');
                    break;

                case 'reset':
                case 'clearfx':
                    await handleEffect(message, player, 'clear');
                    break;

                // ===== INFO =====
                case 'help':
                case 'h':
                case 'commands':
                    await handleHelp(message);
                    break;

                case 'prefix':
                    await handlePrefixInfo(message);
                    break;

                default:
                    // Unknown command - ignore silently
                    break;
            }
        } catch (error) {
            console.error('[PREFIX CMD] Error:', error);
            message.reply({
                embeds: [errorEmbed('Error', error.message)]
            }).catch(() => { });
        }
    }
};

// ===== COMMAND HANDLERS =====

async function handlePlay(message, query) {
    if (!query) {
        return message.reply({ embeds: [errorEmbed('Missing query', 'Usage: `play <song name or URL>`')] });
    }

    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
        return message.reply({ embeds: [errorEmbed('Join a voice channel first!')] });
    }

    try {
        const lavalink = message.client.lavalink;
        let player = lavalink.kazagumo.players.get(message.guildId);

        // Create player if doesn't exist
        if (!player) {
            player = await lavalink.kazagumo.createPlayer({
                guildId: message.guildId,
                textId: message.channelId,
                voiceId: voiceChannel.id,
                volume: 100,
                deaf: true
            });
        }

        // Search for tracks
        const result = await lavalink.search(query, { requester: message.author });

        if (!result || !result.tracks || result.tracks.length === 0) {
            return message.reply({ embeds: [errorEmbed('No results', `Couldn't find: "${query}"`)] });
        }

        // Handle playlist
        if (result.type === 'PLAYLIST') {
            result.tracks.forEach(track => player.queue.add(track));
            await message.reply({
                embeds: [successEmbed(`📑 Added **${result.tracks.length}** tracks from **${result.playlistName}**`)]
            });
        } else {
            // Single track
            const track = result.tracks[0];
            player.queue.add(track);
            await message.reply({
                embeds: [successEmbed(`🎵 Added **[${track.title}](${track.uri})**`)]
            });
        }

        if (!player.playing && !player.paused) player.play();

    } catch (error) {
        message.reply({ embeds: [errorEmbed('Play Error', error.message)] });
    }
}

async function handleSkip(message, player) {
    if (!player?.queue?.current) {
        return message.reply({ embeds: [errorEmbed('Nothing playing')] });
    }
    const title = player.queue.current.title;
    player.skip();
    message.reply({ embeds: [successEmbed(`⏭️ Skipped: **${title}**`)] });
}

async function handlePause(message, player) {
    if (!player?.queue?.current) {
        return message.reply({ embeds: [errorEmbed('Nothing playing')] });
    }
    player.pause(true);
    message.reply({ embeds: [successEmbed('⏸️ Paused')] });
}

async function handleResume(message, player) {
    if (!player?.queue?.current) {
        return message.reply({ embeds: [errorEmbed('Nothing playing')] });
    }
    player.pause(false);
    message.reply({ embeds: [successEmbed('▶️ Resumed')] });
}

async function handleStop(message, player) {
    if (!player) {
        return message.reply({ embeds: [errorEmbed('Not connected')] });
    }
    player.destroy();
    message.reply({ embeds: [successEmbed('⏹️ Stopped and disconnected')] });
}

async function handleQueue(message, player) {
    if (!player?.queue?.current) {
        return message.reply({ embeds: [errorEmbed('Queue is empty')] });
    }

    const queue = player.queue;
    const current = queue.current;
    let desc = `**Now Playing:**\n🎵 ${current.title}\n\n`;

    if (queue.length > 0) {
        desc += '**Up Next:**\n';
        queue.slice(0, 10).forEach((t, i) => {
            desc += `\`${i + 1}.\` ${t.title}\n`;
        });
        if (queue.length > 10) desc += `\n... and ${queue.length - 10} more`;
    }

    message.reply({
        embeds: [new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📜 Queue')
            .setDescription(desc)
            .setFooter({ text: `${queue.length + 1} tracks total` })]
    });
}

async function handleShuffle(message, player) {
    if (!player?.queue || player.queue.length < 2) {
        return message.reply({ embeds: [errorEmbed('Need at least 2 tracks')] });
    }
    player.queue.shuffle();
    message.reply({ embeds: [successEmbed(`🔀 Shuffled ${player.queue.length} tracks`)] });
}

async function handleClear(message, player) {
    if (!player?.queue) {
        return message.reply({ embeds: [errorEmbed('No queue')] });
    }
    const count = player.queue.length;
    player.queue.clear();
    message.reply({ embeds: [successEmbed(`🗑️ Cleared ${count} tracks`)] });
}

async function handleLoop(message, player, mode) {
    if (!player) {
        return message.reply({ embeds: [errorEmbed('Not playing')] });
    }

    const modes = { 'off': 'none', 'track': 'track', 'queue': 'queue', 'song': 'track', 'all': 'queue' };
    const actualMode = modes[mode?.toLowerCase()] || 'none';
    player.setLoop(actualMode);

    const emojis = { 'none': '➡️ Off', 'track': '🔂 Track', 'queue': '🔁 Queue' };
    message.reply({ embeds: [successEmbed(`Loop: ${emojis[actualMode]}`)] });
}

async function handleVolume(message, player, level) {
    if (!player) {
        return message.reply({ embeds: [errorEmbed('Not playing')] });
    }

    const vol = parseInt(level);
    if (isNaN(vol) || vol < 0 || vol > 150) {
        return message.reply({ embeds: [errorEmbed('Volume must be 0-150')] });
    }

    player.setVolume(vol);
    const bars = Math.round(vol / 10);
    message.reply({ embeds: [successEmbed(`🔊 Volume: **${vol}%**\n\`${'█'.repeat(bars)}${'░'.repeat(15 - bars)}\``)] });
}

async function handleNowPlaying(message, player) {
    if (!player?.queue?.current) {
        return message.reply({ embeds: [errorEmbed('Nothing playing')] });
    }

    const current = player.queue.current;
    message.reply({
        embeds: [new EmbedBuilder()
            .setColor(0x9B59B6)
            .setTitle('🎵 Now Playing')
            .setDescription(`**${current.title}**`)
            .addFields(
                { name: 'Artist', value: current.author || 'Unknown', inline: true },
                { name: 'Volume', value: `${player.volume}%`, inline: true }
            )
            .setThumbnail(current.thumbnail || null)]
    });
}

async function handleBass(message, player, level) {
    if (!player) {
        return message.reply({ embeds: [errorEmbed('Not playing')] });
    }

    const lvl = parseInt(level) || 5;
    const gain = Math.min(10, Math.max(1, lvl)) / 20;

    await player.setFilters({
        equalizer: [{ band: 0, gain }, { band: 1, gain: gain * 0.8 }, { band: 2, gain: gain * 0.5 }]
    });

    message.reply({ embeds: [successEmbed(`🔊 Bass: **${lvl}**`)] });
}

async function handleEffect(message, player, effect) {
    if (!player) {
        return message.reply({ embeds: [errorEmbed('Not playing')] });
    }

    const effects = {
        'nightcore': { timescale: { speed: 1.2, pitch: 1.2, rate: 1 } },
        'slowed': { timescale: { speed: 0.85, pitch: 0.9, rate: 1 } },
        '8d': { rotation: { rotationHz: 0.2 } },
        'clear': {}
    };

    await player.setFilters(effects[effect] || {});
    const names = { 'nightcore': '🎵 Nightcore', 'slowed': '🌊 Slowed', '8d': '🎧 8D Audio', 'clear': '❌ Effects cleared' };
    message.reply({ embeds: [successEmbed(names[effect])] });
}

async function handleHelp(message) {
    const prefix = prefixManager.getPrefix(message.guildId);
    message.reply({
        embeds: [new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🎵 Commands')
            .setDescription(`**Prefix:** \`${prefix}\``)
            .addFields(
                { name: '🎵 Playback', value: `\`${prefix}play\` \`${prefix}skip\` \`${prefix}pause\` \`${prefix}resume\` \`${prefix}stop\``, inline: false },
                { name: '📜 Queue', value: `\`${prefix}queue\` \`${prefix}shuffle\` \`${prefix}clear\` \`${prefix}loop\``, inline: false },
                { name: '🔊 Audio', value: `\`${prefix}vol\` \`${prefix}np\` \`${prefix}bass\` \`${prefix}nightcore\` \`${prefix}slowed\` \`${prefix}8d\``, inline: false }
            )
            .setFooter({ text: `Use /r set prefix <new> to change prefix` })]
    });
}

async function handlePrefixInfo(message) {
    const prefix = prefixManager.getPrefix(message.guildId);
    message.reply({
        embeds: [new EmbedBuilder()
            .setColor(0x5865F2)
            .setDescription(`Current prefix: \`${prefix}\`\n\nUse \`/r set prefix <new>\` to change it.`)]
    });
}

// ===== UTILITIES =====

function successEmbed(description) {
    return new EmbedBuilder().setColor(0x00D166).setDescription(description);
}

function errorEmbed(title, description = '') {
    return new EmbedBuilder().setColor(0xED4245).setTitle(`❌ ${title}`).setDescription(description);
}

// ===== UTILITY COMMAND HANDLER (!r commands) =====

async function handleUtilityCommand(message, command, args) {
    try {
        switch (command) {
            case 'help':
            case 'h':
                await handleUtilityHelp(message);
                break;

            case 'toptrack':
            case 'toptracks':
            case 'top':
                await handleTopTracks(message, args[0]);
                break;

            case 'topartist':
            case 'topartists':
                await handleTopArtists(message, args[0]);
                break;

            case 'leaderboard':
            case 'lb':
                await handleLeaderboard(message, args[0]);
                break;

            case 'tuto':
            case 'tutorial':
                await handleTutorial(message);
                break;

            case 'save':
                await handleSavePlaylist(message, args.join(' '));
                break;

            case 'load':
                await handleLoadPlaylist(message, args.join(' '));
                break;

            case 'playlists':
            case 'myplaylists':
                await handleViewPlaylists(message);
                break;

            default:
                await message.reply({
                    embeds: [errorEmbed('Unknown Command', `Use \`!r help\` to see available commands.`)]
                });
        }
    } catch (error) {
        console.error('[UTILITY CMD] Error:', error);
        await message.reply({
            embeds: [errorEmbed('Error', error.message)]
        }).catch(() => { });
    }
}

async function handleUtilityHelp(message) {
    const embed = new EmbedBuilder()
        .setColor(0x6366F1)
        .setTitle('📖 Rya Bot - Command Reference')
        .setDescription('**3 Command Systems:**\n• `/r` - Main music commands (slash)\n• `!r ` - Utility & stats (text)\n• `.r ` - Admin commands (text)')
        .addFields([
            {
                name: '🎵 `/r` Slash Commands (25 total)',
                value: [
                    '**Playback:** `play` `skip` `previous` `pause` `resume` `stop` `seek`',
                    '**Queue:** `queue` `shuffle` `clear` `remove` `loop`',
                    '**Audio:** `vol` `fx` `bass` `quality` `eq`',
                    '**AI:** `autoplay` `recommend` `lyrics` `np` `247`',
                    '**User:** `mystats` `history` `clearhistory`'
                ].join('\n'),
                inline: false
            },
            {
                name: '📊 `!r ` Utility Commands',
                value: [
                    '`!r toptrack [count]` - Your most played tracks',
                    '`!r topartist [count]` - Your most played artists',
                    '`!r leaderboard [server/global]` - Listening leaderboard'
                ].join('\n'),
                inline: false
            },
            {
                name: '📋 `!r ` Playlist Commands',
                value: [
                    '`!r save <name>` - Save current queue as playlist',
                    '`!r load <name>` - Load a saved playlist',
                    '`!r playlists` - View your saved playlists'
                ].join('\n'),
                inline: false
            },
            {
                name: '⚙️ `.r ` Admin Commands',
                value: [
                    '`.r stats` - Bot statistics',
                    '`.r prefix <new>` - Change server prefix',
                    '`.r node` - Lavalink status',
                    '`.r config` - Server configuration',
                    '`.r cache` - Cache stats',
                    '`.r debug` - Debug info'
                ].join('\n'),
                inline: false
            },
            {
                name: '🎛️ Audio Quality & Effects',
                value: [
                    '**Quality:** `/r quality <low/medium/high/ultra/studio>`',
                    '**Bass:** `/r bass <0-10>`',
                    '**EQ:** `/r eq <flat/bass_head/vocal/rock/electronic/jazz/pop/rnb>`',
                    '**Effects:** `/r fx <nightcore/slowed/8d/lofi/vaporwave/phonk/karaoke>`'
                ].join('\n'),
                inline: false
            },
            {
                name: '📖 More Help',
                value: '`!r tuto` - Interactive tutorial\n`.r help` - Admin commands help',
                inline: false
            }
        ])
        .setFooter({ text: 'Rya Music Bot • Premium Music Experience' })
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

async function handleTopTracks(message, countArg) {
    const statsManager = require('../utils/statsManager.js');
    const count = Math.min(20, Math.max(1, parseInt(countArg) || 10));

    const tracks = await statsManager.getUserTopTracks(message.author.id, count);

    if (!tracks || tracks.length === 0) {
        return message.reply({
            embeds: [new EmbedBuilder()
                .setColor(0xF59E0B)
                .setTitle('📊 No Tracks Yet')
                .setDescription('Listen to some music first! Your top tracks will appear here.')]
        });
    }

    const description = tracks.map((t, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`${i + 1}.\``;
        return `${medal} **${t.title || t.track_title}** - ${t.artist || t.track_artist}\n   *${t.plays || t.play_count} plays*`;
    }).join('\n\n');

    const embed = new EmbedBuilder()
        .setColor(0xE91E63)
        .setTitle('🎵 Your Top Tracks')
        .setDescription(description)
        .setThumbnail(message.author.displayAvatarURL())
        .setFooter({ text: `Showing top ${tracks.length} tracks` })
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

async function handleTopArtists(message, countArg) {
    const statsManager = require('../utils/statsManager.js');
    const count = Math.min(20, Math.max(1, parseInt(countArg) || 10));

    const artists = await statsManager.getUserTopArtists(message.author.id, count);

    if (!artists || artists.length === 0) {
        return message.reply({
            embeds: [new EmbedBuilder()
                .setColor(0xF59E0B)
                .setTitle('👤 No Artists Yet')
                .setDescription('Listen to some music first! Your top artists will appear here.')]
        });
    }

    const description = artists.map((a, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`${i + 1}.\``;
        return `${medal} **${a.artist || a.artist_name}**\n   *${a.plays || a.play_count} plays*`;
    }).join('\n\n');

    const embed = new EmbedBuilder()
        .setColor(0x9C27B0)
        .setTitle('👤 Your Top Artists')
        .setDescription(description)
        .setThumbnail(message.author.displayAvatarURL())
        .setFooter({ text: `Showing top ${artists.length} artists` })
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

async function handleLeaderboard(message, scope) {
    const statsManager = require('../utils/statsManager.js');
    const isGlobal = scope?.toLowerCase() === 'global';

    let data;
    if (isGlobal) {
        data = await statsManager.getGlobalLeaderboard(10);
    } else {
        data = await statsManager.getServerLeaderboard(message.guild.id, 10);
    }

    if (!data || data.length === 0) {
        return message.reply({
            embeds: [new EmbedBuilder()
                .setColor(0xF59E0B)
                .setTitle('🏆 No Data Yet')
                .setDescription('No listening data available yet for the leaderboard.')]
        });
    }

    const description = data.map((user, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`${i + 1}.\``;
        const hours = Math.round((user.total_duration_ms || 0) / 3600000 * 10) / 10;
        return `${medal} **${user.username || 'Unknown'}**\n   ${user.total_tracks || 0} tracks • ${hours}h listened`;
    }).join('\n\n');

    const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle(`🏆 ${isGlobal ? 'Global' : 'Server'} Leaderboard`)
        .setDescription(description)
        .setThumbnail(isGlobal ? message.client.user.displayAvatarURL() : message.guild.iconURL())
        .setFooter({ text: `Top 10 ${isGlobal ? 'globally' : 'in this server'}` })
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

async function handleTutorial(message) {
    const { RYA_COLORS } = require('../config/emojiConfig.js');

    const embed = new EmbedBuilder()
        .setColor(RYA_COLORS?.PRIMARY || 0x6366F1)
        .setTitle('📖 Rya Music Bot - Complete Tutorial')
        .setDescription('**Welcome to Rya!** A premium Discord music bot with AI features.\n\n**3 Command Prefixes:**\n• `/r` - Main music commands (25 slash commands)\n• `!r ` - Utility & stats commands\n• `.r ` - Admin commands (requires Manage Server)')
        .addFields([
            {
                name: '🎵 Playing Music',
                value: [
                    '`/r play <song>` - Play any song or URL',
                    '`/r play <spotify playlist>` - Play Spotify playlists',
                    '`/r skip` / `/r previous` - Navigation',
                    '`/r pause` / `/r resume` - Playback control',
                    '`/r stop` - Disconnect from voice'
                ].join('\n'),
                inline: false
            },
            {
                name: '📜 Queue Management',
                value: [
                    '`/r queue` - View current queue',
                    '`/r shuffle` - Shuffle the queue',
                    '`/r loop <off/track/queue>` - Loop modes',
                    '`/r remove <pos>` - Remove track',
                    '`/r clear` - Clear entire queue'
                ].join('\n'),
                inline: true
            },
            {
                name: '🔊 Audio & Effects',
                value: [
                    '`/r vol <0-150>` - Set volume',
                    '`/r bass <0-10>` - Bass boost',
                    '`/r eq <preset>` - 10-band EQ',
                    '`/r fx <effect>` - Audio effects',
                    '`/r quality <level>` - Audio quality'
                ].join('\n'),
                inline: true
            },
            {
                name: '✨ AI Features',
                value: [
                    '`/r autoplay` - AI adds similar songs',
                    '`/r recommend` - AI recommendations',
                    '`/r lyrics` - Get song lyrics',
                    '`/r 247` - 24/7 mode (stay connected)'
                ].join('\n'),
                inline: true
            },
            {
                name: '📊 Stats & Playlists (`!r ` prefix)',
                value: [
                    '`!r toptrack` - Your most played tracks',
                    '`!r topartist` - Your most played artists',
                    '`!r leaderboard` - Server leaderboard',
                    '`!r save <name>` - Save queue as playlist',
                    '`!r load <name>` - Load saved playlist',
                    '`!r playlists` - View your playlists'
                ].join('\n'),
                inline: false
            },
            {
                name: '⚙️ Admin Commands (`.r ` prefix)',
                value: [
                    '`.r stats` - Bot statistics',
                    '`.r prefix <new>` - Change text prefix',
                    '`.r node` - Lavalink node status',
                    '`.r config` - Server configuration'
                ].join('\n'),
                inline: false
            },
            {
                name: '🎛️ EQ Presets Available',
                value: '`flat` `bass_head` `treble` `vocal` `rock` `classical` `electronic` `jazz` `pop` `rnb`',
                inline: false
            },
            {
                name: '🎧 Audio Effects Available',
                value: '`nightcore` `slowed` `8d` `bass` `lofi` `vaporwave` `phonk` `karaoke` `clear`',
                inline: false
            },
            {
                name: '📶 Quality Levels',
                value: '`low` (64kbps) • `medium` (128kbps) • `high` (256kbps) • `ultra` (320kbps) • `studio` (FLAC)',
                inline: false
            }
        ])
        .setFooter({ text: 'Tip: Use !r help for utility commands, .r help for admin commands' })
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

async function handleSavePlaylist(message, name) {
    if (!name || name.trim().length === 0) {
        return message.reply({
            embeds: [errorEmbed('Missing Name', 'Usage: `!r save <playlist name>`')]
        });
    }

    const player = message.client.lavalink?.kazagumo?.players?.get(message.guildId);
    if (!player?.queue?.current) {
        return message.reply({
            embeds: [errorEmbed('No Queue', 'Play some music first to save a playlist!')]
        });
    }

    // Get current queue
    const queue = player.queue;
    const tracks = [];

    if (queue.current) {
        tracks.push({
            title: queue.current.title,
            uri: queue.current.uri,
            author: queue.current.author,
            length: queue.current.length
        });
    }

    queue.forEach(track => {
        tracks.push({
            title: track.title,
            uri: track.uri,
            author: track.author,
            length: track.length
        });
    });

    if (tracks.length === 0) {
        return message.reply({
            embeds: [errorEmbed('Empty Queue', 'No tracks to save!')]
        });
    }

    // Save to Supabase (simplified - will be enhanced in Phase 5)
    try {
        const supabaseClient = require('../utils/supabaseClient.js');
        const client = await supabaseClient.getClient();

        if (!client) {
            return message.reply({
                embeds: [errorEmbed('Database Error', 'Supabase not configured. Playlist saving requires database.')]
            });
        }

        const { error } = await client
            .from('user_playlists')
            .upsert({
                user_id: message.author.id,
                playlist_name: name.trim().substring(0, 50),
                tracks: tracks.slice(0, 50), // Limit to 50 tracks
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,playlist_name'
            });

        if (error) throw error;

        return message.reply({
            embeds: [successEmbed(`📋 Saved playlist **${name}** with ${tracks.length} tracks!`)]
        });

    } catch (error) {
        console.error('[SAVE PLAYLIST] Error:', error);
        return message.reply({
            embeds: [errorEmbed('Save Failed', error.message)]
        });
    }
}

async function handleLoadPlaylist(message, name) {
    if (!name || name.trim().length === 0) {
        return message.reply({
            embeds: [errorEmbed('Missing Name', 'Usage: `!r load <playlist name>`')]
        });
    }

    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
        return message.reply({
            embeds: [errorEmbed('Join Voice Channel', 'Join a voice channel first!')]
        });
    }

    try {
        const supabaseClient = require('../utils/supabaseClient.js');
        const client = await supabaseClient.getClient();

        if (!client) {
            return message.reply({
                embeds: [errorEmbed('Database Error', 'Supabase not configured.')]
            });
        }

        const { data, error } = await client
            .from('user_playlists')
            .select('*')
            .eq('user_id', message.author.id)
            .eq('playlist_name', name.trim())
            .single();

        if (error || !data) {
            return message.reply({
                embeds: [errorEmbed('Not Found', `Playlist **${name}** not found. Use \`!r playlists\` to see your playlists.`)]
            });
        }

        const tracks = data.tracks || [];
        if (tracks.length === 0) {
            return message.reply({
                embeds: [errorEmbed('Empty Playlist', 'This playlist has no tracks.')]
            });
        }

        // Create/get player
        const lavalink = message.client.lavalink;
        let player = lavalink.kazagumo.players.get(message.guildId);

        if (!player) {
            player = await lavalink.kazagumo.createPlayer({
                guildId: message.guildId,
                textId: message.channelId,
                voiceId: voiceChannel.id,
                volume: 100,
                deaf: true
            });
        }

        // Load tracks
        let loaded = 0;
        for (const track of tracks.slice(0, 50)) {
            try {
                const result = await lavalink.search(track.uri || track.title, { requester: message.author });
                if (result?.tracks?.[0]) {
                    player.queue.add(result.tracks[0]);
                    loaded++;
                }
            } catch (e) {
                console.warn('[LOAD PLAYLIST] Failed to load track:', track.title);
            }
        }

        if (!player.playing && !player.paused) player.play();

        // Update play count
        await client
            .from('user_playlists')
            .update({ play_count: (data.play_count || 0) + 1 })
            .eq('id', data.id);

        return message.reply({
            embeds: [successEmbed(`📋 Loaded **${data.playlist_name}** - ${loaded}/${tracks.length} tracks added!`)]
        });

    } catch (error) {
        console.error('[LOAD PLAYLIST] Error:', error);
        return message.reply({
            embeds: [errorEmbed('Load Failed', error.message)]
        });
    }
}

async function handleViewPlaylists(message) {
    try {
        const supabaseClient = require('../utils/supabaseClient.js');
        const client = await supabaseClient.getClient();

        if (!client) {
            return message.reply({
                embeds: [errorEmbed('Database Error', 'Supabase not configured.')]
            });
        }

        const { data, error } = await client
            .from('user_playlists')
            .select('*')
            .eq('user_id', message.author.id)
            .order('updated_at', { ascending: false })
            .limit(10);

        if (error) throw error;

        if (!data || data.length === 0) {
            return message.reply({
                embeds: [new EmbedBuilder()
                    .setColor(0xF59E0B)
                    .setTitle('📋 No Playlists')
                    .setDescription('You haven\'t saved any playlists yet!\n\nUse `!r save <name>` while music is playing to save your queue.')]
            });
        }

        const description = data.map((p, i) => {
            const trackCount = p.tracks?.length || 0;
            const ago = getTimeAgo(new Date(p.updated_at));
            return `**${i + 1}. ${p.playlist_name}**\n   ${trackCount} tracks • ${p.play_count || 0} plays • ${ago}`;
        }).join('\n\n');

        const embed = new EmbedBuilder()
            .setColor(0x6366F1)
            .setTitle('📋 Your Playlists')
            .setDescription(description)
            .setThumbnail(message.author.displayAvatarURL())
            .setFooter({ text: `Use !r load <name> to play a playlist` })
            .setTimestamp();

        return message.reply({ embeds: [embed] });

    } catch (error) {
        console.error('[VIEW PLAYLISTS] Error:', error);
        return message.reply({
            embeds: [errorEmbed('Error', error.message)]
        });
    }
}
