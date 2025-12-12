// src/events/messageCreate.js - Handler for text prefix commands
const { EmbedBuilder } = require('discord.js');
const prefixManager = require('../utils/prefixManager.js');

module.exports = {
    name: 'messageCreate',

    async execute(message) {
        // Ignore bots and DMs
        if (message.author.bot || !message.guild) return;

        // Parse message for prefix command
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
