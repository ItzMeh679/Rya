const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const sessionManager = require('../utils/sessionManager.js');
const config = require('../config/config.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('session')
        .setDescription('View session information')
        .addSubcommand(subcommand =>
            subcommand
                .setName('current')
                .setDescription('View current session stats')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('history')
                .setDescription('View past sessions')
                .addIntegerOption(option =>
                    option.setName('limit')
                        .setDescription('Number of sessions to show')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(20)
                )
        ),

    cooldown: 5000,

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'current') {
                const session = await sessionManager.getCurrentSession(interaction.guild.id);

                if (!session) {
                    const embed = new EmbedBuilder()
                        .setTitle('📊 No Active Session')
                        .setDescription('There is no active listening session in this server.')
                        .setColor(config.getEmbedColor('info'))
                        .setTimestamp();

                    return interaction.editReply({ embeds: [embed] });
                }

                const duration = session.started_at ?
                    Math.floor((new Date() - new Date(session.started_at)) / 1000) : 0;
                const durationStr = this.formatDuration(duration);

                const embed = new EmbedBuilder()
                    .setTitle('📊 Current Session')
                    .setColor(config.getEmbedColor('music'))
                    .addFields(
                        { name: '🎵 Tracks Played', value: `${session.track_count || 0}`, inline: true },
                        { name: '⏭️ Skips', value: `${session.skip_count || 0}`, inline: true },
                        { name: '⏱️ Duration', value: durationStr, inline: true }
                    )
                    .setTimestamp()
                    .setFooter({
                        text: `Session started ${this.getTimeAgo(new Date(session.started_at))}`,
                        iconURL: interaction.guild.iconURL({ dynamic: true })
                    });

                await interaction.editReply({ embeds: [embed] });

            } else if (subcommand === 'history') {
                const limit = interaction.options.getInteger('limit') || 10;
                const sessions = await sessionManager.getUserSessions(interaction.user.id, limit);

                if (!sessions || sessions.length === 0) {
                    const embed = new EmbedBuilder()
                        .setTitle('📜 No Session History')
                        .setDescription('You haven\'t had any listening sessions yet!')
                        .setColor(config.getEmbedColor('info'))
                        .setTimestamp();

                    return interaction.editReply({ embeds: [embed] });
                }

                const embed = new EmbedBuilder()
                    .setTitle('📜 Session History')
                    .setColor(config.getEmbedColor('music'))
                    .setTimestamp();

                const description = sessions.map((session, index) => {
                    const duration = session.ended_at && session.started_at ?
                        Math.floor((new Date(session.ended_at) - new Date(session.started_at)) / 1000) : 0;
                    const timeAgo = this.getTimeAgo(new Date(session.started_at));

                    return `**${index + 1}.** ${session.track_count || 0} tracks • ${this.formatDuration(duration)}\n*${timeAgo}*`;
                }).join('\n\n');

                embed.setDescription(description);

                await interaction.editReply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('[SESSION CMD] Error:', error);

            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Failed to fetch session data. This feature requires Supabase to be configured.')
                .setColor(config.getEmbedColor('error'))
                .setTimestamp();

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }
    },

    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    },

    getTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);

        const intervals = {
            year: 31536000,
            month: 2592000,
            week: 604800,
            day: 86400,
            hour: 3600,
            minute: 60
        };

        for (const [name, value] of Object.entries(intervals)) {
            const interval = Math.floor(seconds / value);
            if (interval >= 1) {
                return `${interval} ${name}${interval > 1 ? 's' : ''} ago`;
            }
        }

        return 'Just now';
    }
};
