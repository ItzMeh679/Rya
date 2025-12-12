// src/utils/prefixManager.js - Prefix management using Supabase
const statsManager = require('./statsManager.js');

class PrefixManager {
    constructor() {
        this.localCache = new Map();
        this.defaultPrefix = '!r';
    }

    /**
     * Get prefix for a guild (checks Supabase)
     */
    async getPrefix(guildId) {
        try {
            // Check local cache first
            if (this.localCache.has(guildId)) {
                return this.localCache.get(guildId);
            }

            // Get from Supabase via statsManager
            const prefix = await statsManager.getPrefix(guildId);
            this.localCache.set(guildId, prefix);
            return prefix;
        } catch (error) {
            console.warn('[PREFIX] Error getting prefix, using default:', error.message);
            return this.defaultPrefix;
        }
    }

    /**
     * Get prefix synchronously (from cache only, for messageCreate)
     */
    getPrefixSync(guildId) {
        return this.localCache.get(guildId) || this.defaultPrefix;
    }

    /**
     * Set prefix for a guild (saves to Supabase)
     */
    async setPrefix(guildId, prefix) {
        // Validate
        if (!prefix || typeof prefix !== 'string') {
            throw new Error('Prefix must be a non-empty string');
        }
        prefix = prefix.trim();
        if (prefix.length < 1 || prefix.length > 5) {
            throw new Error('Prefix must be 1-5 characters');
        }
        if (prefix.includes(' ')) {
            throw new Error('Prefix cannot contain spaces');
        }

        // Save to Supabase
        await statsManager.setPrefix(guildId, prefix);

        // Update local cache
        this.localCache.set(guildId, prefix);
        console.log(`[PREFIX] Set prefix for ${guildId}: "${prefix}"`);
        return true;
    }

    /**
     * Preload prefixes for all known guilds
     */
    async preloadPrefixes(guildIds) {
        for (const guildId of guildIds) {
            try {
                const prefix = await statsManager.getPrefix(guildId);
                this.localCache.set(guildId, prefix);
            } catch (error) {
                // Ignore errors during preload
            }
        }
        console.log(`[PREFIX] Preloaded ${this.localCache.size} guild prefixes`);
    }

    /**
     * Parse message for prefix command
     */
    parseMessage(guildId, content) {
        const prefix = this.getPrefixSync(guildId);

        if (!content.toLowerCase().startsWith(prefix.toLowerCase())) {
            return null;
        }

        const withoutPrefix = content.slice(prefix.length).trim();
        const args = withoutPrefix.split(/\s+/);
        const command = args.shift()?.toLowerCase() || '';

        return {
            prefix,
            command,
            args,
            fullArgs: args.join(' ')
        };
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.localCache.clear();
        statsManager.clearCache();
    }
}

module.exports = new PrefixManager();
