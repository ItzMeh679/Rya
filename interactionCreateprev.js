const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    StringSelectMenuBuilder,
    ButtonStyle,
    ComponentType
} = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const config = require('../config/config.js');
const MusicPlayer = require('../utils/musicPlayer.js');
const RecommendationsHelper = require('../utils/recommendationsHelper.js');
const LyricsHelper = require('../utils/lyricsHelper.js');
const { RYA_EMOJIS, RYA_COLORS, VOLUME_EMOJIS, validateEmojiConfig } = require('../config/emojiConfig.js');

// Validate emoji configuration on startup
validateEmojiConfig();

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        const client = interaction.client;

        // Handle slash commands
        if (interaction.isChatInputCommand()) {
            await handleSlashCommand(interaction, client);
        }
        
        // Handle button interactions
        else if (interaction.isButton()) {
            await handleButtonInteraction(interaction, client);
        }
        
        // Handle select menu interactions
        else if (interaction.isStringSelectMenu()) {
            await handleSelectMenuInteraction(interaction, client);
        }
    }
};

/**
 * Handle slash command interactions
 */
async function handleSlashCommand(interaction, client) {
    const command = client.commands.get(interaction.commandName);
    
    if (!command) {
        console.error(`[INTERACTION] No command matching ${interaction.commandName} was found.`);
        return;
    }

    // Check cooldowns
    const cooldowns = client.cooldowns;
    if (!cooldowns.has(command.data.name)) {
        cooldowns.set(command.data.name, new Map());
    }

    const now = Date.now();
    const timestamps = cooldowns.get(command.data.name);
    const cooldownAmount = (command.cooldown ?? config.discord.commandCooldown);

    if (timestamps.has(interaction.user.id)) {
        const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;

        if (now < expirationTime) {
            const timeLeft = (expirationTime - now) / 1000;
            const embed = createErrorEmbed(`Please wait ${timeLeft.toFixed(1)} more seconds before using \`${command.data.name}\` again.`);
            
            return interaction.reply({ 
                embeds: [embed], 
                ephemeral: true 
            });
        }
    }

    timestamps.set(interaction.user.id, now);
    setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

    try {
        await command.execute(interaction);
        client.commandsExecuted++;
    } catch (error) {
        console.error(`[INTERACTION] Error executing ${interaction.commandName}:`, error);
        
        const embed = createErrorEmbed('There was an error while executing this command!');
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [embed], ephemeral: true });
        } else {
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
}

/**
 * Handle button interactions for music controls with enhanced UI
 */
async function handleButtonInteraction(interaction, client) {
    try {
        const [action, ...params] = interaction.customId.split('_');
        const guildId = interaction.guild.id;
        const player = client.musicPlayers.get(guildId);

        if (!player) {
            const embed = createErrorEmbed('No active music player found.');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Defer the interaction to prevent timeout
        await interaction.deferUpdate();

        switch (action) {
            case 'play':
                if (player.isPaused) {
                    player.resume();
                } else {
                    await player.play();
                }
                break;

            case 'pause':
                player.pause();
                break;

            case 'skip':
                await player.skip();
                break;

            case 'previous':
                await player.previous();
                break;

            case 'stop':
                await player.skip();
                player.clear();
                break;

            case 'loop':
                const currentLoop = player.getLoopMode();
                const nextLoop = getNextLoopMode(currentLoop);
                await player.setLoop(nextLoop);
                break;

            case 'shuffle':
                player.shuffle();
                break;

            case 'volume':
                await handleVolumeControl(interaction, player, params[0]);
                return;

            case 'effects':
                await handleEffectsMenu(interaction, player);
                return;

            case 'lyrics':
                await handleLyricsDisplay(interaction, player);
                return;

            case 'karaoke':
                const karaokeMode = await player.toggleKaraokeMode();
                const karaokeEmbed = createInfoEmbed(
                    'Karaoke Mode',
                    `${karaokeMode ? RYA_EMOJIS.live() : RYA_EMOJIS.mute()} Karaoke mode ${karaokeMode ? 'enabled' : 'disabled'}\n${karaokeMode ? 'Live lyrics will be displayed as the song plays' : 'Live lyrics have been disabled'}`
                );
                await interaction.followUp({ embeds: [karaokeEmbed], ephemeral: true });
                break;

            case 'recommendations':
                await handleRecommendationsMenu(interaction, player);
                return;

            case 'queue':
                await handleQueueDisplay(interaction, player);
                return;

            case 'equalizer':
                await handleEqualizerMenu(interaction, player);
                return;

            case 'autoplay':
                const autoplayEnabled = await player.toggleAutoplay();
                const autoplayEmbed = createInfoEmbed(
                    'Autoplay Mode',
                    `${RYA_EMOJIS.autoplay()} Autoplay ${autoplayEnabled ? 'enabled' : 'disabled'}\n${autoplayEnabled ? 'AI will automatically add similar tracks when queue ends' : 'Autoplay has been disabled'}`
                );
                await interaction.followUp({ embeds: [autoplayEmbed], ephemeral: true });
                break;

            case 'history':
                await handleHistoryDisplay(interaction, player);
                return;

            case 'effect':
                await player.setAudioEffect(params[0]);
                break;

            case 'bass':
                await player.setBass(parseInt(params[0]));
                break;

            case 'treble':
                await player.setTreble(parseInt(params[0]));
                break;

            default:
                console.warn(`[INTERACTION] Unknown button action: ${action}`);
                return;
        }

        // Update the music controller after action
        await updateMusicController(interaction, player);

    } catch (error) {
        console.error('[INTERACTION] Button interaction error:', error);
        
        if (!interaction.replied && !interaction.deferred) {
            const embed = createErrorEmbed('An error occurred while processing your request.');
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
}

/**
 * Handle select menu interactions
 */
async function handleSelectMenuInteraction(interaction, client) {
    try {
        const [menuType, ...params] = interaction.customId.split('_');
        const guildId = interaction.guild.id;
        const player = client.musicPlayers.get(guildId);

        await interaction.deferUpdate();

        switch (menuType) {
            case 'recommendations':
                const selectedTrack = interaction.values[0];
                if (player) {
                    await player.addTrack(selectedTrack, interaction.user);
                    const embed = createSuccessEmbed('Track Added', `${RYA_EMOJIS.queue()} Added recommended track to the queue!`);
                    await interaction.followUp({ embeds: [embed], ephemeral: true });
                }
                break;

            case 'effects':
                const effectName = interaction.values[0];
                if (player) {
                    await player.setAudioEffect(effectName === 'none' ? null : effectName);
                    const embed = createSuccessEmbed('Audio Effect', `${RYA_EMOJIS.effects()} Applied ${effectName === 'none' ? 'no effect' : effectName} effect`);
                    await interaction.followUp({ embeds: [embed], ephemeral: true });
                }
                break;

            default:
                console.warn(`[INTERACTION] Unknown select menu type: ${menuType}`);
                return;
        }

        // Update the music controller
        if (player) {
            await updateMusicController(interaction, player);
        }

    } catch (error) {
        console.error('[INTERACTION] Select menu interaction error:', error);
    }
}

/**
 * Create enhanced Rya music embed with better formatting
 */
function createMusicEmbed(player) {
    const currentTrack = player.getCurrentTrack();
    const queue = player.getQueue();
    const state = player.getPlaybackState();

    if (!currentTrack) {
        return new EmbedBuilder()
            .setTitle(`${RYA_EMOJIS.sound()} Rya Music Player`)
            .setDescription('*No track currently playing*\n\nUse `/play` to start listening to music!')
            .setColor(RYA_COLORS.MUSIC)
            .setFooter({ 
                text: `Queue: ${queue.length} tracks • Rya Music Bot`, 
            })
            .setTimestamp();
    }

    const embed = new EmbedBuilder()
        .setColor(RYA_COLORS.MUSIC)
        .setTimestamp();

    // Clean status emoji without extra symbols
    const statusEmoji = state.isPlaying ? (state.isPaused ? RYA_EMOJIS.pause() : RYA_EMOJIS.play()) : RYA_EMOJIS.stop();
    embed.setTitle(`Now Playing • Rya Music`);

    // Enhanced track info
    const trackInfo = [
        `### ${statusEmoji} ${currentTrack.title}`,
        `**Artist:** ${currentTrack.artist}`,
        currentTrack.duration ? `**Duration:** \`${formatDuration(currentTrack.duration)}\`` : '',
        currentTrack.source ? `**Source:** ${currentTrack.source.charAt(0).toUpperCase() + currentTrack.source.slice(1)}` : ''
    ].filter(Boolean).join('\n');

    embed.setDescription(trackInfo);

    // Enhanced thumbnail
    if (currentTrack.thumbnail) {
        embed.setThumbnail(currentTrack.thumbnail);
    }

    // Organized fields with consistent spacing
    const fields = [];

    // Playback Status Row
    const statusText = state.isPlaying ? (state.isPaused ? `${RYA_EMOJIS.pause()} **Paused**` : `${RYA_EMOJIS.play()} **Playing**`) : `${RYA_EMOJIS.stop()} **Stopped**`;
    const volumeBar = createVolumeBar(state.volume);
    const volumeEmoji = VOLUME_EMOJIS.getVolumeEmoji(state.volume);
    
    fields.push({
        name: `${RYA_EMOJIS.live()} **Status & Volume**`,
        value: `${statusText}\n${volumeEmoji} **${state.volume}%** ${volumeBar}`,
        inline: true
    });

    // Loop & Auto Features
    const loopEmoji = state.loop === 'track' ? RYA_EMOJIS.replay() : state.loop === 'queue' ? RYA_EMOJIS.loop() : RYA_EMOJIS.loop();
    const loopText = state.loop === 'off' ? 'Off' : state.loop === 'track' ? 'Track' : 'Queue';
    
    fields.push({
        name: `${RYA_EMOJIS.loop()} **Loop & Auto**`,
        value: `${loopEmoji} Loop: **${loopText}**\n${RYA_EMOJIS.autoplay()} Auto: **${state.autoplay ? 'On' : 'Off'}**`,
        inline: true
    });

    // Queue & History
    const queueStatus = state.backgroundProcessing ? 
        `**${queue.length}** tracks\n*+${state.processingProgress.processed}/${state.processingProgress.total} processing*` :
        `**${queue.length}** tracks`;
    
    fields.push({
        name: `${RYA_EMOJIS.queue()} **Queue & History**`,
        value: `${queueStatus}\n${RYA_EMOJIS.history()} History: **${state.historyLength}**`,
        inline: true
    });

    // Audio Effects (when active)
    if (state.currentEffect || state.bassLevel !== 0 || state.trebleLevel !== 0) {
        let effectsText = '';
        if (state.currentEffect) {
            const effectConfig = config.getAudioEffect(state.currentEffect);
            effectsText += `${RYA_EMOJIS.effects()} **${effectConfig?.name || state.currentEffect}**\n`;
        }
        if (state.bassLevel !== 0 || state.trebleLevel !== 0) {
            effectsText += `${RYA_EMOJIS.equalizer()} Bass: **${state.bassLevel > 0 ? '+' : ''}${state.bassLevel}** • Treble: **${state.trebleLevel > 0 ? '+' : ''}${state.trebleLevel}**`;
        }
        
        fields.push({
            name: `${RYA_EMOJIS.features()} **Audio Enhancement**`,
            value: effectsText,
            inline: false
        });
    }

    // Karaoke mode
    if (state.karaokeModeEnabled) {
        fields.push({
            name: `${RYA_EMOJIS.live()} **Karaoke Mode Active**`,
            value: `${RYA_EMOJIS.lyrics()} *Live lyrics synchronized with playback*`,
            inline: false
        });
    }

    embed.addFields(fields);

    // Enhanced footer with Rya branding
    if (currentTrack.requestedBy) {
        embed.setFooter({ 
            text: `Requested by ${currentTrack.requestedBy.username} • Rya Music Bot`, 
            iconURL: currentTrack.requestedBy.displayAvatarURL({ dynamic: true }) 
        });
    }

    return embed;
}

/**
 * Create enhanced, symmetrical music control buttons
 */
function createMusicActionRow(player) {
    const state = player.getPlaybackState();
    const rows = [];

    // ═══ ROW 1: MAIN PLAYBACK CONTROLS ═══
    const mainControlRow = new ActionRowBuilder();

    // Previous Button
    mainControlRow.addComponents(
        new ButtonBuilder()
            .setCustomId('previous')
            .setEmoji(RYA_EMOJIS.previous())
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(state.historyLength === 0)
    );

    // Play/Pause Button (Dynamic)
    if (state.isPaused || !state.isPlaying) {
        mainControlRow.addComponents(
            new ButtonBuilder()
                .setCustomId('play')
                .setEmoji(RYA_EMOJIS.play())
                .setStyle(ButtonStyle.Success)
        );
    } else {
        mainControlRow.addComponents(
            new ButtonBuilder()
                .setCustomId('pause')
                .setEmoji(RYA_EMOJIS.pause())
                .setStyle(ButtonStyle.Primary)
        );
    }

    // Stop Button
    mainControlRow.addComponents(
        new ButtonBuilder()
            .setCustomId('stop')
            .setEmoji(RYA_EMOJIS.stop())
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!state.isPlaying)
    );

    // Skip Button
    mainControlRow.addComponents(
        new ButtonBuilder()
            .setCustomId('skip')
            .setEmoji(RYA_EMOJIS.skip())
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(state.queueLength === 0 && !state.isPlaying)
    );

    // Loop Button (Dynamic styling based on mode)
    const loopEmoji = state.loop === 'track' ? RYA_EMOJIS.replay() : RYA_EMOJIS.loop();
    mainControlRow.addComponents(
        new ButtonBuilder()
            .setCustomId('loop')
            .setEmoji(loopEmoji)
            .setStyle(state.loop === 'off' ? ButtonStyle.Secondary : ButtonStyle.Success)
    );

    rows.push(mainControlRow);

    // ═══ ROW 2: VOLUME & QUEUE CONTROLS ═══
    const volumeQueueRow = new ActionRowBuilder();

    // Volume Down Button
    volumeQueueRow.addComponents(
        new ButtonBuilder()
            .setCustomId('volume_down')
            .setEmoji(RYA_EMOJIS.mute())
            .setLabel('Vol-')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(state.volume <= 0)
    );

    // Volume Display/Menu Button
    const volumeEmoji = VOLUME_EMOJIS.getVolumeEmoji(state.volume);
    volumeQueueRow.addComponents(
        new ButtonBuilder()
            .setCustomId('volume_menu')
            .setEmoji(volumeEmoji)
            .setLabel(`${state.volume}%`)
            .setStyle(ButtonStyle.Secondary)
    );

    // Volume Up Button
    volumeQueueRow.addComponents(
        new ButtonBuilder()
            .setCustomId('volume_up')
            .setEmoji(RYA_EMOJIS.volume())
            .setLabel('Vol+')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(state.volume >= 100)
    );

    // Shuffle Button
    volumeQueueRow.addComponents(
        new ButtonBuilder()
            .setCustomId('shuffle')
            .setEmoji(RYA_EMOJIS.shuffle())
            .setLabel('Shuffle')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(state.queueLength < 2)
    );

    // Queue Button
    volumeQueueRow.addComponents(
        new ButtonBuilder()
            .setCustomId('queue')
            .setEmoji(RYA_EMOJIS.queue())
            .setLabel(`Queue (${state.queueLength})`)
            .setStyle(ButtonStyle.Secondary)
    );

    rows.push(volumeQueueRow);

    // ═══ ROW 3: FEATURES & EFFECTS ═══
    const featuresRow = new ActionRowBuilder();

    // Autoplay Button
    featuresRow.addComponents(
        new ButtonBuilder()
            .setCustomId('autoplay')
            .setEmoji(RYA_EMOJIS.autoplay())
            .setLabel('Auto')
            .setStyle(state.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    // Effects Button
    featuresRow.addComponents(
        new ButtonBuilder()
            .setCustomId('effects')
            .setEmoji(RYA_EMOJIS.effects())
            .setLabel('Effects')
            .setStyle(state.currentEffect ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    // Equalizer Button
    featuresRow.addComponents(
        new ButtonBuilder()
            .setCustomId('equalizer')
            .setEmoji(RYA_EMOJIS.equalizer())
            .setLabel('EQ')
            .setStyle((state.bassLevel !== 0 || state.trebleLevel !== 0) ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    // Lyrics Button
    featuresRow.addComponents(
        new ButtonBuilder()
            .setCustomId('lyrics')
            .setEmoji(RYA_EMOJIS.lyrics())
            .setLabel('Lyrics')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!player.getCurrentTrack())
    );

    // More Features Button
    featuresRow.addComponents(
        new ButtonBuilder()
            .setCustomId('more_features')
            .setEmoji(RYA_EMOJIS.features())
            .setLabel('More')
            .setStyle(ButtonStyle.Secondary)
    );

    rows.push(featuresRow);

    return rows;
}


/**
 * Parse custom emoji for Discord buttons
 */
function parseCustomEmoji(emojiString) {
    if (typeof emojiString !== 'string') return null;
    
    // Check if it's a custom emoji
    const match = emojiString.match(/<(a?):(\w+):(\d+)>/);
    if (match) {
        return {
            id: match[3],
            name: match[2],
            animated: match[1] === 'a'
        };
    }
    
    // Return Unicode emoji as string
    return emojiString;
}

/**
 * Create enhanced volume bar visualization
 */
function createVolumeBar(volume, length = 12) {
    const filled = Math.floor((volume / 100) * length);
    const empty = length - filled;
    
    // Use different characters for better visual appeal
    const filledChar = '█';
    const emptyChar = '░';
    
    return filledChar.repeat(filled) + emptyChar.repeat(empty);
}

/**
 * Handle enhanced volume control with slider functionality
 */
async function handleVolumeControl(interaction, player, action) {
    const currentVolume = player.getVolume();
    
    if (action === 'menu') {
        // Create volume slider with precise controls
        const volumeRow1 = new ActionRowBuilder();
        const volumeRow2 = new ActionRowBuilder();
        
        // Row 1: Major volume levels
        const majorLevels = [0, 25, 50, 75, 100];
        majorLevels.forEach(vol => {
            const volumeEmoji = VOLUME_EMOJIS.getVolumeEmoji(vol);
            volumeRow1.addComponents(
                new ButtonBuilder()
                    .setCustomId(`volume_set_${vol}`)
                    .setEmoji(parseCustomEmoji(volumeEmoji))
                    .setLabel(`${vol}%`)
                    .setStyle(vol === currentVolume ? ButtonStyle.Success : ButtonStyle.Secondary)
            );
        });

        // Row 2: Fine adjustments
        volumeRow2.addComponents(
            new ButtonBuilder()
                .setCustomId('volume_decrease_10')
                .setLabel('-10')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(currentVolume <= 10),
            new ButtonBuilder()
                .setCustomId('volume_decrease_5')
                .setLabel('-5')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentVolume <= 5),
            new ButtonBuilder()
                .setCustomId('volume_mute_toggle')
                .setEmoji(parseCustomEmoji(RYA_EMOJIS.mute()))
                .setLabel('Mute')
                .setStyle(currentVolume === 0 ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('volume_increase_5')
                .setLabel('+5')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentVolume >= 95),
            new ButtonBuilder()
                .setCustomId('volume_increase_10')
                .setLabel('+10')
                .setStyle(ButtonStyle.Success)
                .setDisabled(currentVolume >= 90)
        );

        const volumeBar = createVolumeBar(currentVolume, 20);
        const volumeEmoji = VOLUME_EMOJIS.getVolumeEmoji(currentVolume);
        
        const embed = new EmbedBuilder()
            .setTitle(`${RYA_EMOJIS.volume()} Volume Control`)
            .setDescription(`${volumeEmoji} **Current Volume:** ${currentVolume}%\n\`${volumeBar}\`\n\n**Quick Settings:**`)
            .setColor(RYA_COLORS.VOLUME)
            .addFields({
                name: 'Fine Adjustments',
                value: 'Use the buttons below for precise volume control',
                inline: false
            })
            .setFooter({ text: 'Rya Music Bot • Volume Control' })
            .setTimestamp();
        
        await interaction.followUp({
            embeds: [embed],
            components: [volumeRow1, volumeRow2],
            ephemeral: true
        });
        return;
    }

    // Handle volume adjustment actions
    let newVolume = currentVolume;
    
    switch (action) {
        case 'up':
            newVolume = Math.min(100, currentVolume + 10);
            break;
        case 'down':
            newVolume = Math.max(0, currentVolume - 10);
            break;
        case 'mute_toggle':
            newVolume = currentVolume === 0 ? (player.previousVolume || 50) : 0;
            if (currentVolume > 0) player.previousVolume = currentVolume;
            break;
        case 'increase_5':
            newVolume = Math.min(100, currentVolume + 5);
            break;
        case 'increase_10':
            newVolume = Math.min(100, currentVolume + 10);
            break;
        case 'decrease_5':
            newVolume = Math.max(0, currentVolume - 5);
            break;
        case 'decrease_10':
            newVolume = Math.max(0, currentVolume - 10);
            break;
        default:
            if (action.startsWith('set_')) {
                newVolume = parseInt(action.split('_')[1]);
            }
            break;
    }

    if (!isNaN(newVolume) && newVolume !== currentVolume) {
        await player.setVolume(newVolume);
        
        const volumeBar = createVolumeBar(newVolume, 15);
        const volumeEmoji = VOLUME_EMOJIS.getVolumeEmoji(newVolume);
        
        const embed = createSuccessEmbed(
            'Volume Updated', 
            `${volumeEmoji} Volume ${newVolume === 0 ? 'muted' : `set to **${newVolume}%**`}\n\`${volumeBar}\``
        );
        
        await interaction.followUp({ embeds: [embed], ephemeral: true });
    }
}

/**
 * Handle audio effects menu with enhanced styling
 */
async function handleEffectsMenu(interaction, player) {
    const availableEffects = [
        { label: 'None', value: 'none', emoji: RYA_EMOJIS.mute(), description: 'No audio effects' },
        { label: '3D Spatial Sound', value: 'spatial3D', emoji: '🌌', description: 'Immersive 3D audio experience' },
        { label: 'Sped Up & Fast Beats', value: 'speedUp', emoji: '⚡', description: 'Energetic sped up version' },
        { label: 'Slowed & Reverb', value: 'slowedReverb', emoji: '🌊', description: 'Chill slowed down with reverb' },
        { label: 'Bass Boost', value: 'bassBoost', emoji: RYA_EMOJIS.sound(), description: 'Enhanced bass frequencies' },
        { label: 'Treble Boost', value: 'trebleBoost', emoji: '✨', description: 'Crisp high frequencies' }
    ];

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('effects_select')
        .setPlaceholder('Choose an audio effect')
        .addOptions(availableEffects.map(effect => ({
            label: effect.label,
            description: effect.description,
            value: effect.value,
            emoji: typeof effect.emoji === 'string' ? effect.emoji : undefined
        })));

    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    const embed = new EmbedBuilder()
        .setTitle(`${RYA_EMOJIS.effects()} Audio Effects`)
        .setDescription('Select an audio effect to apply to the current track:')
        .setColor(RYA_COLORS.EFFECTS)
        .addFields({
            name: 'Available Effects',
            value: availableEffects.map(e => `${e.emoji} **${e.label}** - ${e.description}`).join('\n'),
            inline: false
        })
        .setFooter({ text: 'Rya Music Bot • Audio Effects' })
        .setTimestamp();
    
    await interaction.followUp({
        embeds: [embed],
        components: [row],
        ephemeral: true
    });
}

/**
 * Handle enhanced equalizer menu
 */
async function handleEqualizerMenu(interaction, player) {
    const state = player.getPlaybackState();
    
    // Bass control row
    const bassRow = new ActionRowBuilder();
    for (let i = -2; i <= 2; i++) {
        bassRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`bass_${i}`)
                .setLabel(`Bass ${i === 0 ? '0' : (i > 0 ? `+${i}` : i)}`)
                .setStyle(state.bassLevel === i ? ButtonStyle.Success : ButtonStyle.Secondary)
        );
    }

    // Treble control row
    const trebleRow = new ActionRowBuilder();
    for (let i = -2; i <= 2; i++) {
        trebleRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`treble_${i}`)
                .setLabel(`Treble ${i === 0 ? '0' : (i > 0 ? `+${i}` : i)}`)
                .setStyle(state.trebleLevel === i ? ButtonStyle.Success : ButtonStyle.Secondary)
        );
    }

    const embed = new EmbedBuilder()
        .setTitle(`${RYA_EMOJIS.equalizer()} Equalizer Settings`)
        .setDescription(`**Current Configuration:**\n${RYA_EMOJIS.sound()} Bass: **${state.bassLevel > 0 ? '+' : ''}${state.bassLevel}**\n✨ Treble: **${state.trebleLevel > 0 ? '+' : ''}${state.trebleLevel}**`)
        .setColor(RYA_COLORS.EFFECTS)
        .addFields(
            {
                name: 'Bass Control',
                value: 'Adjust low frequency response (-2 to +2)',
                inline: true
            },
            {
                name: 'Treble Control', 
                value: 'Adjust high frequency response (-2 to +2)',
                inline: true
            }
        )
        .setFooter({ text: 'Rya Music Bot • Equalizer' })
        .setTimestamp();

    await interaction.followUp({
        embeds: [embed],
        components: [bassRow, trebleRow],
        ephemeral: true
    });
}

/**
 * Handle lyrics display with enhanced styling
 */
async function handleLyricsDisplay(interaction, player) {
    try {
        const currentTrack = player.getCurrentTrack();
        if (!currentTrack) {
            const embed = createErrorEmbed('No track is currently playing.');
            return interaction.followUp({ embeds: [embed], ephemeral: true });
        }

        const lyrics = await LyricsHelper.getLyrics(currentTrack);
        
        if (!lyrics) {
            const embed = createWarningEmbed('Lyrics Not Found', `${RYA_EMOJIS.lyrics()} Unable to find lyrics for this track.`);
            return interaction.followUp({ embeds: [embed], ephemeral: true });
        }

        // Split lyrics into chunks if too long
        const maxLength = 4096;
        if (lyrics.length <= maxLength) {
            const embed = createLyricsEmbed(currentTrack, lyrics);
            await interaction.followUp({ embeds: [embed], ephemeral: true });
        } else {
            // Send lyrics in multiple embeds
            const chunks = splitText(lyrics, maxLength - 100);
            
            for (let i = 0; i < chunks.length; i++) {
                const embed = createLyricsEmbed(
                    currentTrack, 
                    chunks[i], 
                    i === 0,
                    `Part ${i + 1}/${chunks.length}`
                );
                
                await interaction.followUp({ embeds: [embed], ephemeral: true });
            }
        }

    } catch (error) {
        console.error('[LYRICS] Error displaying lyrics:', error);
        const embed = createErrorEmbed('Failed to fetch lyrics. Please try again.');
        await interaction.followUp({ embeds: [embed], ephemeral: true });
    }
}

/**
 * Handle recommendations menu
 */
async function handleRecommendationsMenu(interaction, player) {
    try {
        const currentTrack = player.getCurrentTrack();
        if (!currentTrack) {
            const embed = createErrorEmbed('No track is currently playing.');
            return interaction.followUp({ embeds: [embed], ephemeral: true });
        }

        // Show loading message
        const loadingEmbed = createInfoEmbed('Getting Recommendations', `${RYA_EMOJIS.browse()} AI is analyzing your music taste...`);
        const loadingMessage = await interaction.followUp({ embeds: [loadingEmbed], ephemeral: true });

        // Get AI recommendations
        const history = player.playbackHistory || [];
        const recommendations = await RecommendationsHelper.getRecommendations(currentTrack, history, { count: 5 });

        if (recommendations.length === 0) {
            const embed = createWarningEmbed('No Recommendations', `${RYA_EMOJIS.browse()} Unable to generate recommendations at this time.`);
            return loadingMessage.edit({ embeds: [embed] });
        }

        // Create select menu with recommendations
        const options = recommendations.map((rec, index) => ({
            label: `${rec.title}`.substring(0, 100),
            description: `by ${rec.artist} - ${rec.reason}`.substring(0, 100),
            value: rec.query,
            emoji: '🎵'
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('recommendations_select')
            .setPlaceholder('Choose a recommended track to add to queue')
            .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const embed = new EmbedBuilder()
            .setTitle(`${RYA_EMOJIS.browse()} AI Recommendations`)
            .setDescription(`Based on **${currentTrack.title}** by ${currentTrack.artist}:\n\nSelect a track to add to your queue:`)
            .setColor(RYA_COLORS.ACCENT)
            .setFooter({ text: 'Rya Music Bot • AI Recommendations' })
            .setTimestamp();

        await loadingMessage.edit({
            embeds: [embed],
            components: [row]
        });

    } catch (error) {
        console.error('[RECOMMENDATIONS] Error getting recommendations:', error);
        const embed = createErrorEmbed('Failed to get recommendations. Please try again.');
        await interaction.followUp({ embeds: [embed], ephemeral: true });
    }
}

/**
 * Handle queue display
 */
async function handleQueueDisplay(interaction, player) {
    const queue = player.getQueue();
    const currentTrack = player.getCurrentTrack();

    if (!currentTrack && queue.length === 0) {
        const embed = createInfoEmbed('Music Queue', `${RYA_EMOJIS.queue()} The queue is currently empty.`);
        return interaction.followUp({ embeds: [embed], ephemeral: true });
    }

    let description = '';
    
    // Current track
    if (currentTrack) {
        description += `**${RYA_EMOJIS.play()} Now Playing:**\n\`${currentTrack.title}\` by ${currentTrack.artist}\n\n`;
    }

    // Queue
    if (queue.length > 0) {
        description += `**${RYA_EMOJIS.queue()} Up Next:**\n`;
        const displayQueue = queue.slice(0, 10);
        
        displayQueue.forEach((track, index) => {
            const duration = track.duration ? ` \`[${formatDuration(track.duration)}]\`` : '';
            description += `\`${index + 1}.\` ${track.title} by ${track.artist}${duration}\n`;
        });

        if (queue.length > 10) {
            description += `\n*... and ${queue.length - 10} more tracks*`;
        }
    } else {
        description += `**${RYA_EMOJIS.queue()} Queue is empty**`;
    }

    const embed = new EmbedBuilder()
        .setTitle(`${RYA_EMOJIS.queue()} Music Queue`)
        .setDescription(description)
        .setColor(RYA_COLORS.QUEUE)
        .setFooter({ text: `Total tracks: ${queue.length} • Rya Music Bot` })
        .setTimestamp();

    await interaction.followUp({ embeds: [embed], ephemeral: true });
}

/**
 * Handle history display
 */
async function handleHistoryDisplay(interaction, player) {
    const history = player.playbackHistory || [];

    if (history.length === 0) {
        const embed = createInfoEmbed('Playback History', `${RYA_EMOJIS.history()} No tracks in history yet.`);
        return interaction.followUp({ embeds: [embed], ephemeral: true });
    }

    let description = '';
    const displayHistory = history.slice(-10).reverse();
    
    displayHistory.forEach((track, index) => {
        const duration = track.duration ? ` \`[${formatDuration(track.duration)}]\`` : '';
        description += `\`${index + 1}.\` **${track.title}** by ${track.artist}${duration}\n`;
    });

    if (history.length > 10) {
        description += `\n*... and ${history.length - 10} more tracks*`;
    }

    const embed = new EmbedBuilder()
        .setTitle(`${RYA_EMOJIS.history()} Playback History`)
        .setDescription(description)
        .setColor(RYA_COLORS.HISTORY)
        .setFooter({ text: `Total tracks played: ${history.length} • Rya Music Bot` })
        .setTimestamp();

    await interaction.followUp({ embeds: [embed], ephemeral: true });
}

/**
 * Update music controller with current state
 */
async function updateMusicController(interaction, player) {
    if (!player.currentController) return;

    try {
        const embed = createMusicEmbed(player);
        const actionRows = createMusicActionRow(player);

        await player.currentController.edit({
            embeds: [embed],
            components: actionRows
        });
    } catch (error) {
        console.warn('[INTERACTION] Controller update failed, sending new controller');
        await player.sendNewController();
    }
}

/**
 * Enhanced embed creation functions
 */
function createSuccessEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`${RYA_EMOJIS.live()} ${title}`)
        .setDescription(description)
        .setColor(RYA_COLORS.SUCCESS)
        .setFooter({ text: 'Rya Music Bot' })
        .setTimestamp();
}

function createErrorEmbed(description) {
    return new EmbedBuilder()
        .setTitle(`${RYA_EMOJIS.stop()} Error`)
        .setDescription(description)
        .setColor(RYA_COLORS.ERROR)
        .setFooter({ text: 'Rya Music Bot' })
        .setTimestamp();
}

function createWarningEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`${RYA_EMOJIS.mute()} ${title}`)
        .setDescription(description)
        .setColor(RYA_COLORS.WARNING)
        .setFooter({ text: 'Rya Music Bot' })
        .setTimestamp();
}

function createInfoEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`${RYA_EMOJIS.stats()} ${title}`)
        .setDescription(description)
        .setColor(RYA_COLORS.ACCENT)
        .setFooter({ text: 'Rya Music Bot' })
        .setTimestamp();
}

function createLyricsEmbed(track, lyrics, includeTitle = true, subtitle = null) {
    const embed = new EmbedBuilder()
        .setColor(RYA_COLORS.LYRICS)
        .setDescription(lyrics)
        .setTimestamp();

    if (includeTitle) {
        embed.setTitle(`${RYA_EMOJIS.lyrics()} ${track.title}`);
        embed.setAuthor({ name: `Lyrics • ${track.artist}` });
    }

    if (subtitle) {
        embed.setFooter({ text: `${subtitle} • Rya Music Bot` });
    } else {
        embed.setFooter({ text: 'Rya Music Bot • Lyrics' });
    }

    if (track.thumbnail) {
        embed.setThumbnail(track.thumbnail);
    }

    return embed;
}

/**
 * Utility functions
 */
function getNextLoopMode(currentMode) {
    const modes = ['off', 'track', 'queue'];
    const currentIndex = modes.indexOf(currentMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    return modes[nextIndex];
}

function formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
    }
}

function splitText(text, maxLength) {
    const chunks = [];
    let currentChunk = '';
    
    const lines = text.split('\n');
    
    for (const line of lines) {
        if (currentChunk.length + line.length + 1 > maxLength) {
            if (currentChunk) {
                chunks.push(currentChunk);
                currentChunk = '';
            }
        }
        currentChunk += (currentChunk ? '\n' : '') + line;
    }
    
    if (currentChunk) {
        chunks.push(currentChunk);
    }
    
    return chunks;
}

// Export utility functions for use by MusicPlayer
module.exports.createMusicEmbed = createMusicEmbed;
module.exports.createMusicActionRow = createMusicActionRow;
module.exports.RYA_COLORS = RYA_COLORS;
module.exports.RYA_EMOJIS = RYA_EMOJIS;