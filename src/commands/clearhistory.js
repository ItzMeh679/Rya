const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const statsManager = require('../utils/statsManager.js');
const config = require('../config/config.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clearhistory')
        .setDescription('Clear your listening history from the database')
        .addBooleanOption(option =>
            option.setName('confirm')
                .setDescription('Set to true to skip confirmation')
                .setRequired(false)
        ),

    cooldown: 10000, // 10 second cooldown to prevent spam

    async execute(interaction) {
        try {
            const skipConfirmation = interaction.options.getBoolean('confirm') || false;

            // If not skipping confirmation, show confirmation prompt
            if (!skipConfirmation) {
                const confirmEmbed = new EmbedBuilder()
                    .setTitle('⚠️ Clear Listening History')
                    .setDescription(
                        '**Are you sure you want to clear your entire listening history?**\n\n' +
                        '🗑️ This will permanently delete:\n' +
                        '• All your tracked songs\n' +
                        '• Your listening statistics\n' +
                        '• Your top tracks data\n\n' +
                        '⚠️ **This action cannot be undone!**'
                    )
                    .setColor(config.getEmbedColor('warning'))
                    .setTimestamp();

                const confirmRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('clearhistory_confirm')
                        .setLabel('Yes, Clear My History')
                        .setEmoji('🗑️')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('clearhistory_cancel')
                        .setLabel('Cancel')
                        .setEmoji('❌')
                        .setStyle(ButtonStyle.Secondary)
                );

                const response = await interaction.reply({
                    embeds: [confirmEmbed],
                    components: [confirmRow],
                    ephemeral: true
                });

                // Wait for button interaction
                try {
                    const buttonInteraction = await response.awaitMessageComponent({
                        filter: i => i.user.id === interaction.user.id,
                        time: 30000 // 30 seconds timeout
                    });

                    if (buttonInteraction.customId === 'clearhistory_cancel') {
                        const cancelEmbed = new EmbedBuilder()
                            .setTitle('❌ Cancelled')
                            .setDescription('Your listening history was not cleared.')
                            .setColor(config.getEmbedColor('info'))
                            .setTimestamp();

                        return buttonInteraction.update({
                            embeds: [cancelEmbed],
                            components: []
                        });
                    }

                    // User confirmed - proceed with clearing
                    await buttonInteraction.deferUpdate();
                    await this.performClear(buttonInteraction, interaction.user);

                } catch (error) {
                    // Timeout or error
                    const timeoutEmbed = new EmbedBuilder()
                        .setTitle('⏰ Timed Out')
                        .setDescription('Confirmation timed out. Your history was not cleared.')
                        .setColor(config.getEmbedColor('warning'))
                        .setTimestamp();

                    await interaction.editReply({
                        embeds: [timeoutEmbed],
                        components: []
                    });
                }

            } else {
                // Skip confirmation and clear directly
                await interaction.deferReply({ ephemeral: true });
                await this.performClear(interaction, interaction.user);
            }

        } catch (error) {
            console.error('[CLEARHISTORY CMD] Error:', error);

            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('Failed to clear history. Please try again later.')
                .setColor(config.getEmbedColor('error'))
                .setTimestamp();

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ embeds: [errorEmbed], components: [] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    },

    async performClear(interaction, user) {
        const result = await statsManager.clearUserHistory(user.id);

        let embed;

        if (result.success) {
            embed = new EmbedBuilder()
                .setTitle('✅ History Cleared')
                .setDescription(
                    `Successfully cleared your listening history!\n\n` +
                    `🗑️ **${result.count}** tracks removed from the database.\n\n` +
                    `Your listening data has been reset. New tracks will be saved as you listen.`
                )
                .setColor(config.getEmbedColor('success'))
                .setFooter({
                    text: `Cleared by ${user.username}`,
                    iconURL: user.displayAvatarURL({ dynamic: true })
                })
                .setTimestamp();
        } else {
            embed = new EmbedBuilder()
                .setTitle('❌ Failed to Clear')
                .setDescription(
                    `Could not clear your history.\n\n` +
                    `**Reason:** ${result.error || 'Unknown error'}\n\n` +
                    `Make sure Supabase is properly configured and try again.`
                )
                .setColor(config.getEmbedColor('error'))
                .setTimestamp();
        }

        if (interaction.deferred) {
            await interaction.editReply({ embeds: [embed], components: [] });
        } else {
            await interaction.update({ embeds: [embed], components: [] });
        }
    }
};
