// src/commands/tuto.js - Tutorial command for Rya Music Bot
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { RYA_EMOJIS, RYA_COLORS } = require('../config/emojiConfig.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tuto')
        .setDescription('📖 Learn all player controls, features & tips'),

    cooldown: 5000,

    async execute(interaction) {
        await interaction.deferReply();

        // Get custom emojis
        const emojis = {
            previous: RYA_EMOJIS.previous(),
            play: RYA_EMOJIS.play(),
            pause: RYA_EMOJIS.pause(),
            skip: RYA_EMOJIS.skip(),
            stop: RYA_EMOJIS.stop(),
            shuffle: RYA_EMOJIS.shuffle(),
            loop: RYA_EMOJIS.loop(),
            queue: RYA_EMOJIS.queue(),
            lyrics: RYA_EMOJIS.lyrics(),
            autoplay: RYA_EMOJIS.autoplay(),
            equalizer: RYA_EMOJIS.equalizer(),
            effects: RYA_EMOJIS.effects(),
            history: RYA_EMOJIS.history(),
            stats: RYA_EMOJIS.stats(),
            volume: RYA_EMOJIS.volume(),
            sound: RYA_EMOJIS.sound(),
            mute: RYA_EMOJIS.mute()
        };

        const tutorialEmbed = new EmbedBuilder()
            .setColor(RYA_COLORS?.PRIMARY || 0x6366F1)
            .setTitle('📖 Rya Music Bot Tutorial')
            .setDescription('**Complete guide to all player controls and features!**\n\nWhen you play a song, a Now Playing message appears with interactive buttons. Here\'s what each one does:')
            .addFields(
                {
                    name: '🎛️ Row 1 — Playback Controls',
                    value: [
                        `${emojis.previous} **Previous** — Go back to previous track`,
                        `${emojis.pause} **Pause/Play** — Toggle playback on/off`,
                        `${emojis.skip} **Skip** — Skip to the next track in queue`,
                        `${emojis.stop} **Stop** — Stop music & disconnect bot`,
                        `${emojis.shuffle} **Shuffle** — Randomize the queue order`
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '🔊 Row 2 — Queue & Audio',
                    value: [
                        `${emojis.loop} **Loop** — Cycle: Off → Track → Queue`,
                        `${emojis.queue} **Queue** — View all upcoming tracks`,
                        `${emojis.lyrics} **Lyrics** — Fetch lyrics for current song`,
                        `${emojis.mute} **Vol−** — Decrease volume by 10%`,
                        `${emojis.sound} **Vol+** — Increase volume by 10%`
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '✨ Row 3 — Advanced Features',
                    value: [
                        `${emojis.autoplay} **Autoplay** — AI adds similar songs when queue ends`,
                        `${emojis.equalizer} **Equalizer** — Audio presets (Bass, Rock, Classical, etc.)`,
                        `${emojis.effects} **Effects** — Sound filters (8D, Nightcore, Slowed, etc.)`,
                        `${emojis.history} **History** — View your recently played tracks`,
                        `${emojis.stats} **Stats** — Your personal listening statistics`
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '⚠️ Important Precautions',
                    value: [
                        '• **Wait for track to load** before using controls',
                        '• **Use one button at a time** — clicking too fast may cause errors',
                        '• **Don\'t spam buttons** — rate limits apply',
                        '• **Effects take a moment** — equalizer/effects apply after a brief delay',
                        '• **Stay in voice channel** — bot may disconnect if VC is empty too long'
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '💡 Pro Tips',
                    value: [
                        '• Use `/r autoplay` for infinite music discovery',
                        '• Combine **Equalizer presets** with **Effects** for unique sound',
                        '• Check `/r mystats` to see your listening statistics',
                        '• Use `/r recommend` to get AI song suggestions',
                        '• Support Spotify, YouTube, and SoundCloud links!'
                    ].join('\n'),
                    inline: false
                }
            )
            .setFooter({
                text: 'Tip: Use /r help to see all available commands!',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTimestamp();

        return interaction.editReply({ embeds: [tutorialEmbed] });
    }
};
