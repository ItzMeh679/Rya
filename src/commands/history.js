const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const userTracking = require('../utils/userTracking.js');
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

            // Fetch user history
            const history = await userTracking.getUserHistory(interaction.user.id, limit);

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
                return `**${index + 1}.** ${track.track_title} - ${track.track_artist}\n*${timeAgo} • ${track.skipped ? '⏭️ Skipped' : '✅ Completed'}*`;
            }).join('\n\n');

            embed.setDescription(description || 'No tracks found');

            // Add stats
            const totalTracks = history.length;
            const completedTracks = history.filter(t => t.completed).length;
            const skippedTracks = history.filter(t => t.skipped).length;

            embed.addFields({
                name: '📊 Stats',
                value: `Total: ${totalTracks} • Completed: ${completedTracks} • Skipped: ${skippedTracks}`,
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
    }
};
