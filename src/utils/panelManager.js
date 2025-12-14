// src/utils/panelManager.js - Persistent Music Player Panel Manager
// Handles single-panel-per-guild with smart bump logic

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Panel Manager - Manages persistent music player panels per guild
 * - Updates panels in-place instead of sending new messages
 * - Bumps (re-sends) when buried by other messages
 * - Only bumps when bot is actively connected/playing
 */
class PanelManager {
    constructor() {
        // guildId -> { messageId, channelId, lastUpdate, channel }
        this.panels = new Map();

        // Configuration
        this.config = {
            bumpThreshold: 3,        // Messages before bump
            bumpTimeout: 300000,     // 5 min - always bump if older
            updateDebounce: 500,     // Debounce rapid updates (ms)
            deleteOnDisconnect: true // Clean up panel when leaving
        };

        // Debounce tracking
        this.pendingUpdates = new Map();

        // Cooldowns for button interactions
        this.cooldowns = new Map();

        console.log('[PANEL MANAGER] Initialized');
    }

    /**
     * Update existing panel or create new one
     * Core method for all panel operations
     */
    async updateOrCreate(client, guildId, channel, embed, components, options = {}) {
        const { forceNew = false, isPlaying = true } = options;

        try {
            // Only proceed if bot is connected/playing
            if (!isPlaying && !this.isBotConnected(client, guildId)) {
                console.log(`[PANEL] Skipping update - bot not connected in guild ${guildId}`);
                return null;
            }

            const existing = this.panels.get(guildId);

            if (existing && !forceNew) {
                // Check if panel is buried
                const isBuried = await this.isPanelBuried(channel, existing.messageId);
                const isOld = Date.now() - existing.lastUpdate > this.config.bumpTimeout;

                if ((isBuried || isOld) && this.isBotConnected(client, guildId)) {
                    // Bump: Delete old and create new
                    console.log(`[PANEL] Bumping panel in guild ${guildId} (buried: ${isBuried}, old: ${isOld})`);
                    await this.deletePanel(guildId);
                    return await this.createPanel(guildId, channel, embed, components);
                } else {
                    // Edit in-place
                    return await this.editPanel(client, guildId, embed, components);
                }
            } else {
                // Create new panel
                await this.deletePanel(guildId); // Clean up any old panel first
                return await this.createPanel(guildId, channel, embed, components);
            }
        } catch (error) {
            console.error('[PANEL] Error in updateOrCreate:', error);
            // Try to create fresh panel on error
            try {
                await this.deletePanel(guildId);
                return await this.createPanel(guildId, channel, embed, components);
            } catch (createError) {
                console.error('[PANEL] Failed to create fallback panel:', createError);
                return null;
            }
        }
    }

    /**
     * Create a new panel message
     */
    async createPanel(guildId, channel, embed, components) {
        try {
            // Handle components - can be single row, array of rows, or undefined
            let componentArray = [];
            if (components) {
                if (Array.isArray(components)) {
                    componentArray = components;
                } else {
                    componentArray = [components];
                }
            }

            const message = await channel.send({
                embeds: [embed],
                components: componentArray
            });

            this.panels.set(guildId, {
                messageId: message.id,
                channelId: channel.id,
                channel: channel,
                lastUpdate: Date.now()
            });

            console.log(`[PANEL] Created new panel for guild ${guildId}: ${message.id}`);
            return message;
        } catch (error) {
            console.error('[PANEL] Failed to create panel:', error);
            return null;
        }
    }

    /**
     * Edit existing panel in-place
     */
    async editPanel(client, guildId, embed, components) {
        const panel = this.panels.get(guildId);
        if (!panel) return null;

        try {
            const channel = panel.channel || client.channels.cache.get(panel.channelId);
            if (!channel) {
                console.warn(`[PANEL] Channel not found for guild ${guildId}`);
                this.panels.delete(guildId);
                return null;
            }

            const message = await channel.messages.fetch(panel.messageId).catch(() => null);
            if (!message) {
                console.warn(`[PANEL] Message not found, will create new on next update`);
                this.panels.delete(guildId);
                return null;
            }

            // Handle components - can be single row, array of rows, or undefined
            let componentArray = [];
            if (components) {
                if (Array.isArray(components)) {
                    componentArray = components;
                } else {
                    componentArray = [components];
                }
            }

            await message.edit({
                embeds: [embed],
                components: componentArray
            });

            panel.lastUpdate = Date.now();
            console.log(`[PANEL] Edited panel for guild ${guildId}`);
            return message;
        } catch (error) {
            console.error('[PANEL] Failed to edit panel:', error);
            this.panels.delete(guildId);
            return null;
        }
    }

    /**
     * Delete panel for a guild
     */
    async deletePanel(guildId) {
        const panel = this.panels.get(guildId);
        if (!panel) return;

        try {
            const channel = panel.channel;
            if (channel) {
                const message = await channel.messages.fetch(panel.messageId).catch(() => null);
                if (message) {
                    await message.delete().catch(() => { });
                }
            }
        } catch (error) {
            // Ignore deletion errors
        }

        this.panels.delete(guildId);
        console.log(`[PANEL] Deleted panel for guild ${guildId}`);
    }

    /**
     * Check if panel is buried by other messages
     */
    async isPanelBuried(channel, messageId) {
        try {
            const messages = await channel.messages.fetch({ limit: this.config.bumpThreshold + 1 });
            const messageIds = [...messages.keys()];

            // If panel is not in the recent messages, it's buried
            const panelIndex = messageIds.indexOf(messageId);
            return panelIndex === -1 || panelIndex >= this.config.bumpThreshold;
        } catch (error) {
            console.warn('[PANEL] Error checking if buried:', error);
            return false; // Assume not buried on error
        }
    }

    /**
     * Check if bot is connected to voice in this guild
     */
    isBotConnected(client, guildId) {
        try {
            const player = client.lavalink?.kazagumo?.players?.get(guildId);
            return player && (player.playing || player.paused || player.voiceId);
        } catch (error) {
            return false;
        }
    }

    /**
     * Debounced update - prevents rapid fire updates
     */
    async debouncedUpdate(client, guildId, channel, embedFn, componentsFn, options = {}) {
        // Clear any pending update
        const pending = this.pendingUpdates.get(guildId);
        if (pending) {
            clearTimeout(pending.timeout);
        }

        // Schedule new update
        return new Promise((resolve) => {
            const timeout = setTimeout(async () => {
                this.pendingUpdates.delete(guildId);
                const embed = typeof embedFn === 'function' ? embedFn() : embedFn;
                const components = typeof componentsFn === 'function' ? componentsFn() : componentsFn;
                const result = await this.updateOrCreate(client, guildId, channel, embed, components, options);
                resolve(result);
            }, this.config.updateDebounce);

            this.pendingUpdates.set(guildId, { timeout, resolve });
        });
    }

    /**
     * Check if user can interact (cooldown check)
     */
    canInteract(userId, action) {
        const key = `${userId}:${action}`;
        const lastUse = this.cooldowns.get(key);
        const now = Date.now();

        if (lastUse && now - lastUse < 1000) {
            return false;
        }

        this.cooldowns.set(key, now);
        return true;
    }

    /**
     * Clean up panel on disconnect
     */
    async onDisconnect(client, guildId, channel) {
        if (this.config.deleteOnDisconnect) {
            // Send final message and delete panel
            const panel = this.panels.get(guildId);
            if (panel && channel) {
                try {
                    // Update panel to show disconnected state instead of deleting
                    const disconnectEmbed = new EmbedBuilder()
                        .setColor(0x6B7280)
                        .setTitle('👋 Disconnected')
                        .setDescription('Thanks for listening! Use `/r play` to start again.')
                        .setTimestamp();

                    await this.editPanel(client, guildId, disconnectEmbed, null);

                    // Delete after short delay
                    setTimeout(() => {
                        this.deletePanel(guildId);
                    }, 5000);
                } catch (error) {
                    this.deletePanel(guildId);
                }
            } else {
                this.deletePanel(guildId);
            }
        }
    }

    /**
     * Get panel info for a guild
     */
    getPanel(guildId) {
        return this.panels.get(guildId);
    }

    /**
     * Check if guild has active panel
     */
    hasPanel(guildId) {
        return this.panels.has(guildId);
    }

    /**
     * Clean up stale panels (call periodically)
     */
    cleanupStale(client) {
        const now = Date.now();
        const staleTimeout = 3600000; // 1 hour

        for (const [guildId, panel] of this.panels.entries()) {
            if (now - panel.lastUpdate > staleTimeout) {
                // Check if bot is still connected
                if (!this.isBotConnected(client, guildId)) {
                    console.log(`[PANEL] Cleaning stale panel for guild ${guildId}`);
                    this.deletePanel(guildId);
                }
            }
        }
    }

    /**
     * Get stats for debugging
     */
    getStats() {
        return {
            activePanels: this.panels.size,
            pendingUpdates: this.pendingUpdates.size,
            cooldowns: this.cooldowns.size
        };
    }
}

// Singleton instance
const panelManager = new PanelManager();

module.exports = panelManager;
