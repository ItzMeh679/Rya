const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const statsManager = require('../utils/statsManager.js');
const config = require('../config/config.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('history')
        .setDescription('View your listening history')
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('Number of tracks to show (default: 20)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(50)
        )
        .addStringOption(option =>
            option.setName('filter')
                .setDescription('Filter by timeframe')
                .setRequired(false)
                .addChoices(
                    { name: 'Today', value: 'today' },
                    { name: 'This Week', value: 'week' },
                    { name: 'This Month', value: 'month' },
                    { name: 'All Time', value: 'all' }
                )
        ),

    cooldown: 5000,

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const limit = interaction.options.getInteger('limit') || 20;
            const filter = interaction.options.getString('filter') || 'all';

            // Fetch user history using statsManager (uses Discord ID directly)
            const history = await statsManager.getUserHistory(interaction.user.id, limit);

            if (!history || history.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('📜 No Listening History')
                    .setDescription('You haven\'t listened to any tracks yet! Start playing some music to build your history.')
                    .setColor(config.getEmbedColor('info'))
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            // Create embed with history
            const embed = new EmbedBuilder()
                .setTitle(`📜 Your Listening History (${filter})`)
                .setColor(config.getEmbedColor('music'))
                .setTimestamp()
                .setFooter({
                    text: `Requested by ${interaction.user.username}`,
                    iconURL: interaction.user.displayAvatarURL({ dynamic: true })
                });

            // Format history into fields
            const description = history.slice(0, limit).map((track, index) => {
                const timeAgo = this.getTimeAgo(new Date(track.played_at));
                const duration = track.duration_ms ? this.formatDuration(track.duration_ms) : '';
                return `**${index + 1}.** ${track.track_title} - ${track.track_artist}\n*${timeAgo}${duration ? ` • ${duration}` : ''}*`;
            }).join('\n\n');

            embed.setDescription(description || 'No tracks found');

            // Add stats
            const totalTracks = history.length;
            const totalDuration = history.reduce((sum, t) => sum + (t.duration_ms || 0), 0);

            embed.addFields({
                name: '📊 Stats',
                value: `Total: ${totalTracks} tracks • Duration: ${this.formatDuration(totalDuration)}`,
                inline: false
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[HISTORY CMD] Error:', error);

            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Failed to fetch listening history. This feature requires Supabase to be configured.')
                .setColor(config.getEmbedColor('error'))
                .setTimestamp();

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
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
    },

    formatDuration(ms) {
        if (!ms || ms <= 0) return '';
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        }
        return `${seconds}s`;
    }
};
