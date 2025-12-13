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
const { QUICK_EMOJIS, PREMIUM_COLORS, validateEmojiConfig, getEmoji } = require('../config/emojiConfig.js');

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
 * Handle button interactions for music controls with premium emojis
 */
async function handleButtonInteraction(interaction, client) {
    try {
        const customId = interaction.customId;
        const guildId = interaction.guild.id;

        // Handle new Lavalink-based music controls (music_* buttons)
        if (customId.startsWith('music_')) {
            await handleLavalinkMusicControls(interaction, client);
            return;
        }

        // Handle legacy music player controls
        const [action, ...params] = customId.split('_');
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
                    `${karaokeMode ? QUICK_EMOJIS.sound() : '🚫'} Karaoke mode ${karaokeMode ? 'enabled' : 'disabled'}\n${karaokeMode ? 'Live lyrics will be displayed as the song plays' : 'Live lyrics have been disabled'}`
                );
                await interaction.followUp({ embeds: [karaokeEmbed], ephemeral: true });
                // Update and bump the main controller to reflect karaoke state
                await updateMusicController(interaction, player);
                return;

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
                    `${QUICK_EMOJIS.autoplay()} Autoplay ${autoplayEnabled ? 'enabled' : 'disabled'}\n${autoplayEnabled ? 'AI will automatically add similar tracks when queue ends' : 'Autoplay has been disabled'}`
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

            case 'features':
            case 'features_menu':
                await handleFeaturesMenu(interaction, player);
                return;

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
                    const embed = createSuccessEmbed('Track Added', `${QUICK_EMOJIS.queue()} Added recommended track to the queue!`);
                    await interaction.followUp({ embeds: [embed], ephemeral: true });
                }
                break;

            case 'effects':
                const effectName = interaction.values[0];
                if (player) {
                    await player.setAudioEffect(effectName === 'none' ? null : effectName);
                    const embed = createSuccessEmbed('Audio Effect', `${QUICK_EMOJIS.sound()} Applied ${effectName === 'none' ? 'no effect' : effectName} effect`);
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
 * Create premium music embed with custom emojis and styling
 */
function createMusicEmbed(player) {
    const currentTrack = player.getCurrentTrack();
    const queue = player.getQueue();
    const state = player.getPlaybackState();

    if (!currentTrack) {
        return new EmbedBuilder()
            .setTitle(`${QUICK_EMOJIS.sound()} Rya Music Player`)
            .setDescription('*No track currently playing*\n\nUse `/play` to start listening to music!')
            .setColor(PREMIUM_COLORS.MUSIC)
            .setFooter({
                text: `Queue: ${queue.length} tracks • Rya Music`,
            })
            .setTimestamp();
    }

    const embed = new EmbedBuilder()
        .setColor(PREMIUM_COLORS.MUSIC)
        .setTimestamp();

    // Enhanced title with premium status indicator
    const statusEmoji = state.isPlaying ? (state.isPaused ? QUICK_EMOJIS.pause() : QUICK_EMOJIS.play()) : QUICK_EMOJIS.stop();
    embed.setTitle(`${statusEmoji} Now Playing • Rya Music`);

    // Rich track info with premium formatting
    const trackInfo = [
        `### ${currentTrack.title}`,
        `**by** ${currentTrack.artist}`,
        currentTrack.duration ? `\`⏱️ ${formatDuration(currentTrack.duration)}\`` : '',
        currentTrack.source ? `*Source: ${currentTrack.source.charAt(0).toUpperCase() + currentTrack.source.slice(1)}*` : ''
    ].filter(Boolean).join('\n');

    embed.setDescription(trackInfo);

    // Enhanced thumbnail with premium touch
    if (currentTrack.thumbnail) {
        embed.setThumbnail(currentTrack.thumbnail);
    }

    // Create organized fields with premium styling and custom emojis
    const fields = [];

    // Playback Status with visual indicators and custom emojis
    const statusText = state.isPlaying ? (state.isPaused ? `${QUICK_EMOJIS.pause()} **Paused**` : `${QUICK_EMOJIS.play()} **Playing**`) : `${QUICK_EMOJIS.stop()} **Stopped**`;
    const volumeBar = createVolumeBar(state.volume);

    fields.push({
        name: '⚡ **Playback Status**',
        value: `${statusText}\n${QUICK_EMOJIS.sound()} Volume: **${state.volume}%**\n${volumeBar}`,
        inline: true
    });

    // Loop & Features with enhanced custom emojis
    const loopEmoji = state.loop === 'track' ? QUICK_EMOJIS.replay() : state.loop === 'queue' ? QUICK_EMOJIS.loop() : QUICK_EMOJIS.loop();
    const loopText = state.loop === 'off' ? 'Off' : state.loop === 'track' ? 'Track' : 'Queue';

    fields.push({
        name: '🔄 **Loop & Features**',
        value: `${loopEmoji} Loop: **${loopText}**\n${QUICK_EMOJIS.autoplay()} Autoplay: **${state.autoplay ? 'On' : 'Off'}**`,
        inline: true
    });

    // Queue & History with progress indicators and custom emojis
    const queueStatus = state.backgroundProcessing ?
        `**${queue.length}** tracks (+${state.processingProgress.processed}/${state.processingProgress.total} processing)` :
        `**${queue.length}** tracks`;

    fields.push({
        name: `${QUICK_EMOJIS.queue()} **Queue & History**`,
        value: `${queueStatus}\n${QUICK_EMOJIS.history()} History: **${state.historyLength}** tracks`,
        inline: true
    });

    // Audio Effects (only show if active) with custom emojis
    if (state.currentEffect || state.bassLevel !== 0 || state.trebleLevel !== 0) {
        let effectsText = '';
        if (state.currentEffect) {
            const effectConfig = config.getAudioEffect(state.currentEffect);
            effectsText += `${QUICK_EMOJIS.sound()} **${effectConfig?.name || state.currentEffect}**\n`;
        }
        if (state.bassLevel !== 0 || state.trebleLevel !== 0) {
            effectsText += `🎚️ Bass: **${state.bassLevel > 0 ? '+' : ''}${state.bassLevel}** | Treble: **${state.trebleLevel > 0 ? '+' : ''}${state.trebleLevel}**`;
        }

        fields.push({
            name: `${QUICK_EMOJIS.features()} **Audio Enhancement**`,
            value: effectsText,
            inline: false
        });
    }

    // Karaoke mode with visual indicator and custom emoji
    if (state.karaokeModeEnabled) {
        fields.push({
            name: `🎤 **Karaoke Mode Active**`,
            value: `${QUICK_EMOJIS.lyrics()} *Live lyrics synchronized with playback*`,
            inline: false
        });
    }

    embed.addFields(fields);

    // Enhanced footer with user avatar and premium branding
    if (currentTrack.requestedBy) {
        embed.setFooter({
            text: `Requested by ${currentTrack.requestedBy.username} • Rya Music`,
            iconURL: currentTrack.requestedBy.displayAvatarURL({ dynamic: true })
        });
    }

    return embed;
}

/**
 * Create premium music control action rows with custom emojis
 */
function createMusicActionRow(player) {
    const state = player.getPlaybackState();
    const rows = [];

    // Main control row with premium styling and custom emojis
    const mainControlRow = new ActionRowBuilder();

    // Play/Pause button with dynamic custom emoji
    if (state.isPaused || !state.isPlaying) {
        mainControlRow.addComponents(
            new ButtonBuilder()
                .setCustomId('play')
                .setEmoji(QUICK_EMOJIS.play().replace(/[<>]/g, '').split(':')[2] ? {
                    id: QUICK_EMOJIS.play().replace(/[<>]/g, '').split(':')[2],
                    name: QUICK_EMOJIS.play().replace(/[<>]/g, '').split(':')[1],
                    animated: QUICK_EMOJIS.play().startsWith('<a:')
                } : '▶️')
                .setStyle(ButtonStyle.Success)
        );
    } else {
        mainControlRow.addComponents(
            new ButtonBuilder()
                .setCustomId('pause')
                .setEmoji(QUICK_EMOJIS.pause().replace(/[<>]/g, '').split(':')[2] ? {
                    id: QUICK_EMOJIS.pause().replace(/[<>]/g, '').split(':')[2],
                    name: QUICK_EMOJIS.pause().replace(/[<>]/g, '').split(':')[1],
                    animated: QUICK_EMOJIS.pause().startsWith('<a:')
                } : '⏸️')
                .setStyle(ButtonStyle.Primary)
        );
    }

    // Previous button with custom emoji
    mainControlRow.addComponents(
        new ButtonBuilder()
            .setCustomId('previous')
            .setEmoji(parseCustomEmoji(QUICK_EMOJIS.previous()) || '⏮️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(state.historyLength === 0)
    );

    // Skip button with custom emoji
    mainControlRow.addComponents(
        new ButtonBuilder()
            .setCustomId('skip')
            .setEmoji(parseCustomEmoji(QUICK_EMOJIS.skip()) || '⏭️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(state.queueLength === 0 && !state.isPlaying)
    );

    // Stop button with custom emoji
    mainControlRow.addComponents(
        new ButtonBuilder()
            .setCustomId('stop')
            .setEmoji(parseCustomEmoji(QUICK_EMOJIS.stop()) || '⏹️')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!state.isPlaying)
    );

    // Loop button with dynamic custom emoji and styling
    const loopEmoji = state.loop === 'track' ? QUICK_EMOJIS.replay() : state.loop === 'queue' ? QUICK_EMOJIS.loop() : QUICK_EMOJIS.loop();
    mainControlRow.addComponents(
        new ButtonBuilder()
            .setCustomId('loop')
            .setEmoji(parseCustomEmoji(loopEmoji) || '🔁')
            .setStyle(state.loop === 'off' ? ButtonStyle.Secondary : ButtonStyle.Success)
    );

    rows.push(mainControlRow);

    // Secondary control row with enhanced features and custom emojis
    const secondaryControlRow = new ActionRowBuilder();

    // Shuffle button with custom emoji
    secondaryControlRow.addComponents(
        new ButtonBuilder()
            .setCustomId('shuffle')
            .setEmoji(parseCustomEmoji(QUICK_EMOJIS.shuffle()) || '🔀')
            .setLabel('Shuffle')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(state.queueLength < 2)
    );

    // Volume control button with dynamic icon and custom emoji
    const volumeLabel = `${state.volume}%`;
    secondaryControlRow.addComponents(
        new ButtonBuilder()
            .setCustomId('volume_menu')
            .setEmoji(parseCustomEmoji(QUICK_EMOJIS.sound()) || '🔊')
            .setLabel(volumeLabel)
            .setStyle(ButtonStyle.Secondary)
    );

    // Queue display button with count and custom emoji
    secondaryControlRow.addComponents(
        new ButtonBuilder()
            .setCustomId('queue')
            .setEmoji(parseCustomEmoji(QUICK_EMOJIS.queue()) || '📑')
            .setLabel(`Queue (${state.queueLength})`)
            .setStyle(ButtonStyle.Secondary)
    );

    // Equalizer button with custom emoji (replaces Effects)
    secondaryControlRow.addComponents(
        new ButtonBuilder()
            .setCustomId('equalizer')
            .setEmoji({ id: '1449318106534121493', name: 'equilizer' })
            .setLabel('EQ')
            .setStyle(ButtonStyle.Secondary)
    );

    // Autoplay toggle button with custom emoji
    secondaryControlRow.addComponents(
        new ButtonBuilder()
            .setCustomId('autoplay')
            .setEmoji(parseCustomEmoji(QUICK_EMOJIS.autoplay()) || '🎲')
            .setLabel('Auto')
            .setStyle(state.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    rows.push(secondaryControlRow);

    // Feature row with premium features and custom emojis
    const featureRow = new ActionRowBuilder();

    // Lyrics button with custom emoji
    featureRow.addComponents(
        new ButtonBuilder()
            .setCustomId('lyrics')
            .setEmoji(parseCustomEmoji(QUICK_EMOJIS.lyrics()) || '📝')
            .setLabel('Lyrics')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!player.getCurrentTrack())
    );

    // History button with custom emoji
    featureRow.addComponents(
        new ButtonBuilder()
            .setCustomId('history')
            .setEmoji(parseCustomEmoji(QUICK_EMOJIS.history()) || '🕐')
            .setLabel('History')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(state.historyLength === 0)
    );

    // Browse/Recommendations button with custom emoji
    featureRow.addComponents(
        new ButtonBuilder()
            .setCustomId('recommendations')
            .setEmoji(parseCustomEmoji(QUICK_EMOJIS.browse()) || '🔍')
            .setLabel('Browse')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!player.getCurrentTrack())
    );

    // Features menu with custom emoji
    featureRow.addComponents(
        new ButtonBuilder()
            .setCustomId('features_menu')
            .setEmoji(parseCustomEmoji(QUICK_EMOJIS.features()) || '⚙️')
            .setLabel('More')
            .setStyle(ButtonStyle.Secondary)
    );

    rows.push(featureRow);

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
 * Create premium volume bar visualization
 */
function createVolumeBar(volume, length = 12) {
    const filled = Math.floor((volume / 100) * length);
    const empty = length - filled;
    return '▓'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Handle history display with premium styling
 */
async function handleHistoryDisplay(interaction, player) {
    const history = player.playbackHistory || [];

    if (history.length === 0) {
        const embed = createInfoEmbed('Playback History', `${QUICK_EMOJIS.history()} No tracks in history yet.`);
        return interaction.followUp({ embeds: [embed], ephemeral: true });
    }

    let description = '';
    const displayHistory = history.slice(-10).reverse(); // Show last 10, most recent first

    displayHistory.forEach((track, index) => {
        const duration = track.duration ? ` \`[${formatDuration(track.duration)}]\`` : '';
        description += `\`${index + 1}.\` **${track.title}** by ${track.artist}${duration}\n`;
    });

    if (history.length > 10) {
        description += `\n*... and ${history.length - 10} more tracks*`;
    }

    const embed = new EmbedBuilder()
        .setTitle(`${QUICK_EMOJIS.history()} Playback History`)
        .setDescription(description)
        .setColor(PREMIUM_COLORS.HISTORY)
        .setFooter({ text: `Total tracks played: ${history.length} • Rya Music` })
        .setTimestamp();

    await interaction.followUp({ embeds: [embed], ephemeral: true });
}

/**
 * Handle volume control with enhanced UI and custom emojis
 */
async function handleVolumeControl(interaction, player, action) {
    const currentVolume = player.getVolume();

    if (action === 'menu') {
        const volumeRow = new ActionRowBuilder();

        const volumes = [0, 25, 50, 75, 100];
        volumes.forEach(vol => {
            const volumeEmoji = vol === 0 ? '🔇' : vol < 50 ? '🔉' : parseCustomEmoji(QUICK_EMOJIS.sound()) || '🔊';
            volumeRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`volume_${vol}`)
                    .setEmoji(volumeEmoji)
                    .setLabel(`${vol}%`)
                    .setStyle(vol === currentVolume ? ButtonStyle.Success : ButtonStyle.Secondary)
            );
        });

        const volumeBar = createVolumeBar(currentVolume, 15);
        const embed = createInfoEmbed(
            'Volume Control',
            `${QUICK_EMOJIS.sound()} **Current Volume:** ${currentVolume}%\n\`${volumeBar}\`\n\nSelect a volume level:`
        );
        embed.setColor(PREMIUM_COLORS.ACCENT);

        await interaction.followUp({
            embeds: [embed],
            components: [volumeRow],
            ephemeral: true
        });
        return;
    }

    const newVolume = parseInt(action);
    if (!isNaN(newVolume)) {
        await player.setVolume(newVolume);

        const volumeBar = createVolumeBar(newVolume, 15);
        const embed = createSuccessEmbed('Volume Updated', `${QUICK_EMOJIS.sound()} Volume set to **${newVolume}%**\n\`${volumeBar}\``);
        await interaction.followUp({ embeds: [embed], ephemeral: true });
    }
}

/**
 * Handle audio effects menu with premium styling
 */
async function handleEffectsMenu(interaction, player) {
    const availableEffects = [
        { label: 'None', value: 'none', emoji: '🚫', description: 'No audio effects' },
        { label: '3D Spatial Sound', value: 'spatial3D', emoji: '🌌', description: 'Immersive 3D audio experience' },
        { label: 'Sped Up & Fast Beats', value: 'speedUp', emoji: '⚡', description: 'Energetic sped up version' },
        { label: 'Slowed & Reverb', value: 'slowedReverb', emoji: '🌊', description: 'Chill slowed down with reverb' },
        { label: 'Bass Boost', value: 'bassBoost', emoji: '🔊', description: 'Enhanced bass frequencies' },
        { label: 'Treble Boost', value: 'trebleBoost', emoji: '✨', description: 'Crisp high frequencies' }
    ];

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('effects_select')
        .setPlaceholder('Choose an audio effect')
        .addOptions(availableEffects);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const embed = createInfoEmbed('Audio Effects', `${QUICK_EMOJIS.sound()} Select an audio effect to apply to the current track:`);
    embed.setColor(PREMIUM_COLORS.EFFECTS);

    await interaction.followUp({
        embeds: [embed],
        components: [row],
        ephemeral: true
    });
}

/**
 * Handle features menu with premium styling
 */
async function handleFeaturesMenu(interaction, player) {
    const state = player.getPlaybackState();

    const featuresRow = new ActionRowBuilder();

    // Karaoke toggle
    featuresRow.addComponents(
        new ButtonBuilder()
            .setCustomId('karaoke')
            .setEmoji('🎤')
            .setLabel(state.karaokeModeEnabled ? 'Karaoke: ON' : 'Karaoke: OFF')
            .setStyle(state.karaokeModeEnabled ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    // Equalizer button
    featuresRow.addComponents(
        new ButtonBuilder()
            .setCustomId('equalizer')
            .setEmoji({ id: '1449318106534121493', name: 'equilizer' })
            .setLabel('Equalizer')
            .setStyle(ButtonStyle.Secondary)
    );

    // Effects button
    featuresRow.addComponents(
        new ButtonBuilder()
            .setCustomId('effects')
            .setEmoji('🎛️')
            .setLabel('Effects')
            .setStyle(state.currentEffect ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    const embed = new EmbedBuilder()
        .setTitle(`${QUICK_EMOJIS.features()} Advanced Features`)
        .setDescription('Select a feature to configure:')
        .setColor(PREMIUM_COLORS.ACCENT)
        .addFields([
            { name: '🎤 Karaoke Mode', value: 'Live synchronized lyrics display', inline: true },
            { name: '🎚️ Equalizer', value: 'Adjust bass and treble levels', inline: true },
            { name: '🎛️ Audio Effects', value: 'Apply sound effects (reverb, speed, etc.)', inline: true }
        ])
        .setTimestamp();

    await interaction.followUp({
        embeds: [embed],
        components: [featuresRow],
        ephemeral: true
    });
}

/**
 * Handle equalizer menu with premium styling
 */
async function handleEqualizerMenu(interaction, player) {
    const state = player.getPlaybackState();

    // Bass control row
    const bassRow = new ActionRowBuilder();
    bassRow.addComponents(
        new ButtonBuilder()
            .setCustomId('bass_-2')
            .setLabel('Bass --')
            .setStyle(state.bassLevel === -2 ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('bass_-1')
            .setLabel('Bass -')
            .setStyle(state.bassLevel === -1 ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('bass_0')
            .setLabel('Bass 0')
            .setStyle(state.bassLevel === 0 ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('bass_1')
            .setLabel('Bass +')
            .setStyle(state.bassLevel === 1 ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('bass_2')
            .setLabel('Bass ++')
            .setStyle(state.bassLevel === 2 ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    // Treble control row
    const trebleRow = new ActionRowBuilder();
    trebleRow.addComponents(
        new ButtonBuilder()
            .setCustomId('treble_-2')
            .setLabel('Treble --')
            .setStyle(state.trebleLevel === -2 ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('treble_-1')
            .setLabel('Treble -')
            .setStyle(state.trebleLevel === -1 ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('treble_0')
            .setLabel('Treble 0')
            .setStyle(state.trebleLevel === 0 ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('treble_1')
            .setLabel('Treble +')
            .setStyle(state.trebleLevel === 1 ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('treble_2')
            .setLabel('Treble ++')
            .setStyle(state.trebleLevel === 2 ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    const embed = createInfoEmbed(
        'Equalizer',
        `${QUICK_EMOJIS.features()} **Current Settings:**\n🔊 Bass: ${state.bassLevel > 0 ? '+' : ''}${state.bassLevel}\n✨ Treble: ${state.trebleLevel > 0 ? '+' : ''}${state.trebleLevel}\n\nAdjust the bass and treble levels:`
    );
    embed.setColor(PREMIUM_COLORS.EFFECTS);

    await interaction.followUp({
        embeds: [embed],
        components: [bassRow, trebleRow],
        ephemeral: true
    });
}

/**
 * Handle lyrics display with premium styling
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
            const embed = createWarningEmbed('Lyrics not found', `${QUICK_EMOJIS.lyrics()} Unable to find lyrics for this track.`);
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
 * Handle recommendations menu with premium styling
 */
async function handleRecommendationsMenu(interaction, player) {
    try {
        const currentTrack = player.getCurrentTrack();
        if (!currentTrack) {
            const embed = createErrorEmbed('No track is currently playing.');
            return interaction.followUp({ embeds: [embed], ephemeral: true });
        }

        // Show loading message with custom emoji
        const loadingEmbed = createInfoEmbed('Getting Recommendations', `${QUICK_EMOJIS.browse()} AI is analyzing your music taste...`);
        const loadingMessage = await interaction.followUp({ embeds: [loadingEmbed], ephemeral: true });

        // Get AI recommendations
        const history = player.playbackHistory || [];
        const recommendations = await RecommendationsHelper.getRecommendations(currentTrack, history, { count: 5 });

        if (recommendations.length === 0) {
            const embed = createWarningEmbed('No Recommendations', `${QUICK_EMOJIS.browse()} Unable to generate recommendations at this time.`);
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

        const embed = createInfoEmbed(
            'AI Recommendations',
            `${QUICK_EMOJIS.browse()} Based on **${currentTrack.title}** by ${currentTrack.artist}:\n\nSelect a track to add to your queue:`
        );
        embed.setColor(PREMIUM_COLORS.ACCENT);

        await loadingMessage.edit({
            embeds: [embed],
            components: [row]
        });

    } catch (error) {
        console.error('[RECOMMENDATIONS] Error getting recommendations:', error.message);

        // Handle Unknown Message error (message was deleted)
        if (error.code === 10008) {
            console.warn('[RECOMMENDATIONS] Loading message was deleted, sending new message');
            try {
                const embed = createErrorEmbed('Failed to get recommendations. Please try again.');
                await interaction.followUp({ embeds: [embed], ephemeral: true });
            } catch (followUpError) {
                console.warn('[RECOMMENDATIONS] Follow-up also failed:', followUpError.message);
            }
            return;
        }

        const embed = createErrorEmbed('Failed to get recommendations. Please try again.');
        await interaction.followUp({ embeds: [embed], ephemeral: true }).catch(() => { });
    }
}

/**
 * Handle queue display with premium styling
 */
async function handleQueueDisplay(interaction, player) {
    const queue = player.getQueue();
    const currentTrack = player.getCurrentTrack();

    if (!currentTrack && queue.length === 0) {
        const embed = createInfoEmbed('Queue', `${QUICK_EMOJIS.queue()} The queue is currently empty.`);
        return interaction.followUp({ embeds: [embed], ephemeral: true });
    }

    let description = '';

    // Current track
    if (currentTrack) {
        description += `**${QUICK_EMOJIS.play()} Now Playing:**\n\`${currentTrack.title}\` by ${currentTrack.artist}\n\n`;
    }

    // Queue
    if (queue.length > 0) {
        description += `**${QUICK_EMOJIS.queue()} Up Next:**\n`;
        const displayQueue = queue.slice(0, 10); // Show first 10

        displayQueue.forEach((track, index) => {
            const duration = track.duration ? ` \`[${formatDuration(track.duration)}]\`` : '';
            description += `\`${index + 1}.\` ${track.title} by ${track.artist}${duration}\n`;
        });

        if (queue.length > 10) {
            description += `\n... and ${queue.length - 10} more tracks`;
        }
    } else {
        description += `**${QUICK_EMOJIS.queue()} Queue is empty**`;
    }

    const embed = new EmbedBuilder()
        .setTitle(`${QUICK_EMOJIS.queue()} Music Queue`)
        .setDescription(description)
        .setColor(PREMIUM_COLORS.QUEUE)
        .setFooter({ text: `Total tracks: ${queue.length} • Rya Music` })
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
        // If edit fails, send new controller
        console.warn('[INTERACTION] Controller update failed, sending new controller');
        await player.sendNewController();
    }
}

/**
 * Premium embed creation functions with custom emojis
 */
function createSuccessEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`✅ ${title}`)
        .setDescription(description)
        .setColor(PREMIUM_COLORS.SUCCESS)
        .setTimestamp();
}

function createErrorEmbed(description) {
    return new EmbedBuilder()
        .setTitle('❌ Error')
        .setDescription(description)
        .setColor(PREMIUM_COLORS.ERROR)
        .setTimestamp();
}

function createWarningEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`⚠️ ${title}`)
        .setDescription(description)
        .setColor(PREMIUM_COLORS.WARNING)
        .setTimestamp();
}

function createInfoEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`ℹ️ ${title}`)
        .setDescription(description)
        .setColor(PREMIUM_COLORS.ACCENT)
        .setTimestamp();
}

function createLyricsEmbed(track, lyrics, includeTitle = true, subtitle = null) {
    const embed = new EmbedBuilder()
        .setColor(PREMIUM_COLORS.LYRICS)
        .setDescription(lyrics)
        .setTimestamp();

    if (includeTitle) {
        embed.setTitle(`${QUICK_EMOJIS.lyrics()} Lyrics - ${track.title}`);
        embed.setAuthor({ name: track.artist });
    }

    if (subtitle) {
        embed.setFooter({ text: `${subtitle} • Rya Music` });
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

/**
 * Handle Lavalink-based music controls (music_* buttons)
 */
async function handleLavalinkMusicControls(interaction, client) {
    const guildId = interaction.guild.id;
    const lavalink = client.lavalink;

    if (!lavalink || !lavalink.kazagumo) {
        const embed = createErrorEmbed('Music system is not available.');
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const player = lavalink.kazagumo.players.get(guildId);

    if (!player) {
        const embed = createErrorEmbed('No active music player found.');
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Defer the interaction
    await interaction.deferUpdate();

    const action = interaction.customId.replace('music_', '');

    try {
        switch (action) {
            case 'pause':
                if (player.paused) {
                    player.pause(false);
                    await interaction.followUp({ content: '▶️ Resumed playback!', ephemeral: true });
                } else {
                    player.pause(true);
                    await interaction.followUp({ content: '⏸️ Paused playback!', ephemeral: true });
                }
                break;

            case 'skip':
                if (player.queue.length > 0 || player.playing) {
                    player.skip();
                    await interaction.followUp({ content: '⏭️ Skipped to next track!', ephemeral: true });
                } else {
                    await interaction.followUp({ content: '❌ No more tracks in queue!', ephemeral: true });
                }
                break;

            case 'previous':
                await interaction.followUp({ content: '⏮️ Previous track feature coming soon!', ephemeral: true });
                break;

            case 'stop':
                player.destroy();
                await interaction.followUp({ content: '⏹️ Stopped playback and cleared queue!', ephemeral: true });
                break;

            case 'shuffle':
                if (player.queue.length > 1) {
                    // Shuffle the queue
                    for (let i = player.queue.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [player.queue[i], player.queue[j]] = [player.queue[j], player.queue[i]];
                    }
                    await interaction.followUp({ content: '🔀 Queue shuffled!', ephemeral: true });
                } else {
                    await interaction.followUp({ content: '❌ Not enough tracks to shuffle!', ephemeral: true });
                }
                break;

            case 'loop':
                const currentLoop = player.loop || 'none';
                let newLoop;
                if (currentLoop === 'none') {
                    newLoop = 'track';
                    player.setLoop('track');
                } else if (currentLoop === 'track') {
                    newLoop = 'queue';
                    player.setLoop('queue');
                } else {
                    newLoop = 'none';
                    player.setLoop('none');
                }
                await interaction.followUp({
                    content: `🔁 Loop mode: **${newLoop === 'none' ? 'Off' : newLoop === 'track' ? 'Track' : 'Queue'}**`,
                    ephemeral: true
                });
                break;

            case 'queue':
                const queueEmbed = {
                    color: 0x8B00FF,
                    title: '📑 Current Queue',
                    description: player.queue.length === 0
                        ? 'The queue is empty!'
                        : player.queue.slice(0, 10).map((track, i) =>
                            `**${i + 1}.** ${track.title} - ${track.author}`
                        ).join('\n') + (player.queue.length > 10 ? `\n... and ${player.queue.length - 10} more` : ''),
                    footer: { text: `Total: ${player.queue.length} tracks` }
                };
                await interaction.followUp({ embeds: [queueEmbed], ephemeral: true });
                break;

            case 'voldown':
                const newVolDown = Math.max(0, player.volume - 10);
                player.setVolume(newVolDown);
                await interaction.followUp({ content: `🔉 Volume: **${newVolDown}%**`, ephemeral: true });
                break;

            case 'volup':
                const newVolUp = Math.min(100, player.volume + 10);
                player.setVolume(newVolUp);
                await interaction.followUp({ content: `🔊 Volume: **${newVolUp}%**`, ephemeral: true });
                break;

            case 'lyrics':
                // Use existing LyricsHelper with proper track info extraction
                try {
                    const currentTrack = player.queue.current;
                    if (!currentTrack) {
                        await interaction.followUp({ content: '❌ No track is currently playing!', ephemeral: true });
                        break;
                    }

                    // Extract title and artist from Kazagumo track
                    const trackTitle = currentTrack.title || '';
                    const trackAuthor = currentTrack.author || '';

                    console.log(`[LYRICS] Searching for: "${trackTitle}" by "${trackAuthor}"`);

                    // Search using title and author as separate strings
                    // Create track object for LyricsHelper
                    const trackObj = {
                        title: trackTitle,
                        artist: trackAuthor,
                        name: trackTitle
                    };

                    const lyrics = await LyricsHelper.getLyrics(trackObj);

                    if (lyrics) {
                        const lyricsEmbed = {
                            color: 0x06B6D4,
                            title: `📝 ${trackTitle}`,
                            description: lyrics.length > 4000 ? lyrics.substring(0, 4000) + '\n\n*...lyrics truncated*' : lyrics,
                            footer: { text: `Artist: ${trackAuthor} • Powered by Genius` }
                        };
                        await interaction.followUp({ embeds: [lyricsEmbed], ephemeral: true });
                    } else {
                        await interaction.followUp({
                            content: `❌ No lyrics found for "${trackTitle}".\nTry using \`/lyrics <song name>\` for a manual search.`,
                            ephemeral: true
                        });
                    }
                } catch (err) {
                    console.error('[LYRICS] Error:', err.message);
                    await interaction.followUp({ content: '❌ Failed to fetch lyrics. Try `/lyrics` command.', ephemeral: true });
                }
                break;

            case 'effects':
                // Show effects selection menu
                const effectsRow1 = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('music_fx_bassboost')
                            .setLabel('Bass Boost')
                            .setEmoji('🔊')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('music_fx_8d')
                            .setLabel('8D Audio')
                            .setEmoji('🎧')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('music_fx_nightcore')
                            .setLabel('Nightcore')
                            .setEmoji('🌙')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('music_fx_karaoke')
                            .setLabel('Karaoke')
                            .setEmoji('🎤')
                            .setStyle(ButtonStyle.Primary)
                    );
                const effectsRow2 = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('music_fx_vaporwave')
                            .setLabel('Vaporwave')
                            .setEmoji('🌊')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('music_fx_tremolo')
                            .setLabel('Tremolo')
                            .setEmoji('〰️')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('music_fx_vibrato')
                            .setLabel('Vibrato')
                            .setEmoji('📳')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('music_fx_reset')
                            .setLabel('Reset All')
                            .setEmoji('🔄')
                            .setStyle(ButtonStyle.Danger)
                    );
                const fxEmbed = {
                    color: 0x7C3AED,
                    title: '🎛️ Audio Effects',
                    description: 'Select an effect to apply to the current playback:',
                    footer: { text: 'Effects are processed by Lavalink' }
                };
                await interaction.followUp({ embeds: [fxEmbed], components: [effectsRow1, effectsRow2], ephemeral: true });
                break;

            // Handle individual effects
            case 'fx_bassboost':
                player.shoukaku.setFilters({
                    equalizer: [
                        { band: 0, gain: 0.6 }, { band: 1, gain: 0.7 }, { band: 2, gain: 0.8 },
                        { band: 3, gain: 0.55 }, { band: 4, gain: 0.25 }, { band: 5, gain: 0 },
                        { band: 6, gain: -0.25 }, { band: 7, gain: -0.45 }, { band: 8, gain: -0.55 },
                        { band: 9, gain: -0.7 }, { band: 10, gain: -0.3 }, { band: 11, gain: -0.25 },
                        { band: 12, gain: 0 }, { band: 13, gain: 0 }, { band: 14, gain: 0 }
                    ]
                });
                await interaction.followUp({ content: '🔊 **Bass Boost** enabled!', ephemeral: true });
                break;

            case 'fx_8d':
                player.shoukaku.setFilters({ rotation: { rotationHz: 0.2 } });
                await interaction.followUp({ content: '🎧 **8D Audio** enabled! Use headphones for best effect.', ephemeral: true });
                break;

            case 'fx_nightcore':
                player.shoukaku.setFilters({ timescale: { speed: 1.3, pitch: 1.3, rate: 1.0 } });
                await interaction.followUp({ content: '🌙 **Nightcore** enabled!', ephemeral: true });
                break;

            case 'fx_karaoke':
                player.shoukaku.setFilters({ karaoke: { level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 } });
                await interaction.followUp({ content: '🎤 **Karaoke Mode** enabled! Vocals should be reduced.', ephemeral: true });
                break;

            case 'fx_vaporwave':
                player.shoukaku.setFilters({
                    timescale: { speed: 0.85, pitch: 0.85, rate: 1.0 },
                    equalizer: [
                        { band: 0, gain: 0.3 }, { band: 1, gain: 0.3 }
                    ]
                });
                await interaction.followUp({ content: '🌊 **Vaporwave** enabled!', ephemeral: true });
                break;

            case 'fx_tremolo':
                player.shoukaku.setFilters({ tremolo: { frequency: 4.0, depth: 0.6 } });
                await interaction.followUp({ content: '〰️ **Tremolo** enabled!', ephemeral: true });
                break;

            case 'fx_vibrato':
                player.shoukaku.setFilters({ vibrato: { frequency: 4.0, depth: 0.6 } });
                await interaction.followUp({ content: '📳 **Vibrato** enabled!', ephemeral: true });
                break;

            case 'fx_reset':
                player.shoukaku.clearFilters();
                await interaction.followUp({ content: '🔄 **All effects reset!** Audio is now normal.', ephemeral: true });
                break;

            case 'equalizer':
                // Show EQ presets menu
                const eqRow1 = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('music_eq_flat')
                            .setLabel('Flat')
                            .setEmoji('➖')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('music_eq_bass')
                            .setLabel('Bass')
                            .setEmoji('🔊')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('music_eq_treble')
                            .setLabel('Treble')
                            .setEmoji('🔔')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('music_eq_rock')
                            .setLabel('Rock')
                            .setEmoji('🎸')
                            .setStyle(ButtonStyle.Success)
                    );
                const eqRow2 = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('music_eq_pop')
                            .setLabel('Pop')
                            .setEmoji('🎤')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('music_eq_electronic')
                            .setLabel('Electronic')
                            .setEmoji('🎹')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('music_eq_classical')
                            .setLabel('Classical')
                            .setEmoji('🎻')
                            .setStyle(ButtonStyle.Secondary)
                    );
                const eqEmbed = {
                    color: 0x7C3AED,
                    title: '🎚️ Equalizer Presets',
                    description: 'Select an EQ preset to optimize audio for different genres:',
                    footer: { text: 'Powered by Lavalink 15-band EQ' }
                };
                await interaction.followUp({ embeds: [eqEmbed], components: [eqRow1, eqRow2], ephemeral: true });
                break;

            // EQ Presets
            case 'eq_flat':
                player.shoukaku.setFilters({ equalizer: [] });
                await interaction.followUp({ content: '➖ **Flat EQ** - All bands reset to default.', ephemeral: true });
                break;

            case 'eq_bass':
                // Bass Boost: Heavy sub-bass and bass, slight mid cut for punch
                player.shoukaku.setFilters({
                    equalizer: [
                        { band: 0, gain: 0.6 },   // 25Hz - Sub-bass rumble
                        { band: 1, gain: 0.55 },  // 40Hz - Deep bass
                        { band: 2, gain: 0.45 },  // 63Hz - Bass body
                        { band: 3, gain: 0.3 },   // 100Hz - Upper bass
                        { band: 4, gain: 0.15 },  // 160Hz - Warmth
                        { band: 5, gain: 0.0 },   // 250Hz - Low mids
                        { band: 6, gain: -0.1 },  // 400Hz - Mud cut
                        { band: 7, gain: -0.1 },  // 630Hz - Mud cut
                        { band: 8, gain: 0.0 },   // 1kHz - Mids
                        { band: 9, gain: 0.0 },   // 1.6kHz - Mids
                        { band: 10, gain: 0.0 },  // 2.5kHz - Presence
                        { band: 11, gain: 0.0 },  // 4kHz - Clarity
                        { band: 12, gain: 0.0 },  // 6.3kHz - Brilliance
                        { band: 13, gain: 0.0 },  // 10kHz - Air
                        { band: 14, gain: 0.0 }   // 16kHz - Sparkle
                    ]
                });
                await interaction.followUp({ content: '🔊 **Bass Boost EQ** applied! Deep, punchy bass.', ephemeral: true });
                break;

            case 'eq_treble':
                // Treble Boost: Crisp highs, clear presence, slight bass cut
                player.shoukaku.setFilters({
                    equalizer: [
                        { band: 0, gain: -0.15 },  // Cut sub-bass
                        { band: 1, gain: -0.1 },   // Cut deep bass
                        { band: 2, gain: -0.05 },  // Slight bass cut
                        { band: 3, gain: 0.0 },
                        { band: 4, gain: 0.0 },
                        { band: 5, gain: 0.0 },
                        { band: 6, gain: 0.05 },
                        { band: 7, gain: 0.1 },
                        { band: 8, gain: 0.15 },   // Vocal presence
                        { band: 9, gain: 0.25 },   // Upper mids
                        { band: 10, gain: 0.35 },  // Presence/clarity
                        { band: 11, gain: 0.45 },  // Brilliance
                        { band: 12, gain: 0.5 },   // High treble
                        { band: 13, gain: 0.45 },  // Air
                        { band: 14, gain: 0.4 }    // Sparkle
                    ]
                });
                await interaction.followUp({ content: '🔔 **Treble Boost EQ** applied! Crystal clear highs.', ephemeral: true });
                break;

            case 'eq_rock':
                // Rock: Punchy bass, scooped mids, aggressive highs for guitars
                player.shoukaku.setFilters({
                    equalizer: [
                        { band: 0, gain: 0.35 },   // Sub-bass punch
                        { band: 1, gain: 0.3 },    // Bass thump
                        { band: 2, gain: 0.2 },    // Bass body
                        { band: 3, gain: 0.05 },   // Upper bass
                        { band: 4, gain: -0.15 },  // Low-mid cut (reduce mud)
                        { band: 5, gain: -0.2 },   // Mid scoop
                        { band: 6, gain: -0.15 },  // Mid scoop
                        { band: 7, gain: 0.0 },    // Neutral
                        { band: 8, gain: 0.15 },   // Guitar presence
                        { band: 9, gain: 0.3 },    // Guitar bite
                        { band: 10, gain: 0.35 },  // Presence
                        { band: 11, gain: 0.3 },   // Brilliance
                        { band: 12, gain: 0.2 },   // High end
                        { band: 13, gain: 0.1 },   // Air
                        { band: 14, gain: 0.05 }   // Sparkle
                    ]
                });
                await interaction.followUp({ content: '🎸 **Rock EQ** applied! Punchy bass, aggressive mids.', ephemeral: true });
                break;

            case 'eq_pop':
                // Pop: Tight controlled bass, crystal clear vocals, sparkly treble
                player.shoukaku.setFilters({
                    equalizer: [
                        { band: 0, gain: -0.2 },   // Cut sub-bass rumble
                        { band: 1, gain: -0.15 },  // Reduce deep bass
                        { band: 2, gain: -0.05 },  // Slight bass reduction
                        { band: 3, gain: 0.0 },    // Neutral low-mids
                        { band: 4, gain: 0.1 },    // Warmth
                        { band: 5, gain: 0.15 },   // Body
                        { band: 6, gain: 0.2 },    // Vocal warmth
                        { band: 7, gain: 0.25 },   // Vocal body
                        { band: 8, gain: 0.3 },    // Vocal presence (key for pop)
                        { band: 9, gain: 0.25 },   // Vocal clarity
                        { band: 10, gain: 0.3 },   // Presence/brightness
                        { band: 11, gain: 0.35 },  // Brilliance
                        { band: 12, gain: 0.3 },   // High sparkle
                        { band: 13, gain: 0.25 },  // Air
                        { band: 14, gain: 0.2 }    // Top shimmer
                    ]
                });
                await interaction.followUp({ content: '🎤 **Pop EQ** applied! Clear vocals, bright and clean.', ephemeral: true });
                break;

            case 'eq_electronic':
                // Electronic/EDM: Heavy sub-bass, clear highs, punchy mids
                player.shoukaku.setFilters({
                    equalizer: [
                        { band: 0, gain: 0.55 },   // Sub-bass (essential for EDM)
                        { band: 1, gain: 0.45 },   // Deep bass
                        { band: 2, gain: 0.3 },    // Bass
                        { band: 3, gain: 0.1 },    // Upper bass
                        { band: 4, gain: -0.1 },   // Low-mid cut
                        { band: 5, gain: -0.15 },  // Mud reduction
                        { band: 6, gain: 0.0 },    // Neutral mids
                        { band: 7, gain: 0.1 },    // Synth body
                        { band: 8, gain: 0.2 },    // Synth presence
                        { band: 9, gain: 0.35 },   // Lead presence
                        { band: 10, gain: 0.4 },   // Brightness
                        { band: 11, gain: 0.45 },  // Brilliance
                        { band: 12, gain: 0.4 },   // Hi-hats
                        { band: 13, gain: 0.35 },  // Air/shimmer
                        { band: 14, gain: 0.3 }    // Top end sparkle
                    ]
                });
                await interaction.followUp({ content: '🎹 **Electronic EQ** applied! Deep bass, crisp highs.', ephemeral: true });
                break;

            case 'eq_classical':
                // Classical: Natural, warm, balanced with slight emphasis on acoustic range
                player.shoukaku.setFilters({
                    equalizer: [
                        { band: 0, gain: 0.1 },    // Gentle sub-bass
                        { band: 1, gain: 0.15 },   // Warm bass for cello/bass
                        { band: 2, gain: 0.1 },    // Bass warmth
                        { band: 3, gain: 0.05 },   // Natural low-mids
                        { band: 4, gain: 0.0 },    // Neutral
                        { band: 5, gain: -0.05 },  // Slight mud cut
                        { band: 6, gain: 0.0 },    // Neutral mids
                        { band: 7, gain: 0.05 },   // String body
                        { band: 8, gain: 0.1 },    // Instrument presence
                        { band: 9, gain: 0.15 },   // Detail
                        { band: 10, gain: 0.2 },   // Clarity
                        { band: 11, gain: 0.2 },   // Brilliance
                        { band: 12, gain: 0.15 },  // Air
                        { band: 13, gain: 0.1 },   // Natural top
                        { band: 14, gain: 0.05 }   // Subtle sparkle
                    ]
                });
                await interaction.followUp({ content: '🎻 **Classical EQ** applied! Natural, warm, and balanced.', ephemeral: true });
                break;

            case 'autoplay':
                // Toggle autoplay (store in player data)
                player.data = player.data || {};
                player.data.autoplay = !player.data.autoplay;
                await interaction.followUp({
                    content: `🎲 Autoplay: **${player.data.autoplay ? 'Enabled' : 'Disabled'}**\n${player.data.autoplay ? 'Similar tracks will be added when queue ends.' : 'Autoplay disabled.'}`,
                    ephemeral: true
                });
                break;

            case 'history':
                const historyEmbed = {
                    color: 0x9333EA,
                    title: '🕐 Play History',
                    description: 'This feature tracks your recently played songs.\nUse `/history` command to view your full history.',
                    footer: { text: 'Powered by Supabase' }
                };
                await interaction.followUp({ embeds: [historyEmbed], ephemeral: true });
                break;

            case 'stats':
                const statsEmbed = {
                    color: 0x6366F1,
                    title: 'ℹ️ Player Stats',
                    fields: [
                        { name: 'Current Track', value: player.queue.current?.title || 'None', inline: false },
                        { name: 'Queue Length', value: `${player.queue.length} tracks`, inline: true },
                        { name: 'Volume', value: `${player.volume}%`, inline: true },
                        { name: 'Loop Mode', value: player.loop || 'Off', inline: true },
                        { name: 'Paused', value: player.paused ? 'Yes' : 'No', inline: true },
                        { name: 'Playing', value: player.playing ? 'Yes' : 'No', inline: true },
                        { name: 'Position', value: formatDuration(player.position || 0), inline: true }
                    ]
                };
                await interaction.followUp({ embeds: [statsEmbed], ephemeral: true });
                break;

            default:
                await interaction.followUp({ content: `❓ Unknown action: ${action}`, ephemeral: true });
        }
    } catch (error) {
        console.error('[LAVALINK CONTROLS] Error:', error);
        await interaction.followUp({ content: `❌ Error: ${error.message}`, ephemeral: true }).catch(() => { });
    }
}

// Helper function for formatting duration
function formatDuration(ms) {
    if (!ms || ms < 0) return '0:00';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
        return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
    }
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
}

// Export utility functions for use by MusicPlayer
module.exports.createMusicEmbed = createMusicEmbed;
module.exports.createMusicActionRow = createMusicActionRow;
module.exports.PREMIUM_COLORS = PREMIUM_COLORS;
module.exports.QUICK_EMOJIS = QUICK_EMOJIS;