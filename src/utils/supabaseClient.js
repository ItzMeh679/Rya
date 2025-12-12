const { createClient } = require('@supabase/supabase-js');
const config = require('../config/config.js');

class SupabaseClient {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.retryCount = 0;
        this.maxRetries = 3;
    }

    /**
     * Initialize Supabase client with connection pooling
     */
    async initialize() {
        if (this.client && this.isConnected) {
            return this.client;
        }

        try {
            const supabaseUrl = config.supabase?.url;
            const supabaseKey = config.supabase?.anonKey;

            if (!supabaseUrl || !supabaseKey) {
                console.warn('[SUPABASE] Not configured - user tracking disabled');
                return null;
            }

            this.client = createClient(supabaseUrl, supabaseKey, {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false
                },
                db: {
                    schema: 'public'
                },
                global: {
                    headers: {
                        'x-client-info': 'discord-music-bot/2.0'
                    }
                },
                realtime: {
                    enabled: false // Disable realtime for performance
                }
            });

            // Test connection
            const { error } = await this.client.from('users').select('count').limit(1);

            if (error && error.code !== 'PGRST116') { // PGRST116 = table not found (acceptable)
                throw error;
            }

            this.isConnected = true;
            this.retryCount = 0;
            console.log('[SUPABASE] Connected successfully');

            return this.client;

        } catch (error) {
            console.error('[SUPABASE] Connection error:', error.message);

            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                console.log(`[SUPABASE] Retry attempt ${this.retryCount}/${this.maxRetries}`);
                await new Promise(resolve => setTimeout(resolve, 2000 * this.retryCount));
                return this.initialize();
            }

            this.isConnected = false;
            return null;
        }
    }

    /**
     * Get Supabase client instance
     */
    async getClient() {
        if (!this.client || !this.isConnected) {
            return await this.initialize();
        }
        return this.client;
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            const client = await this.getClient();
            if (!client) return false;

            const { error } = await client.from('users').select('count').limit(1);
            return !error || error.code === 'PGRST116';
        } catch (error) {
            console.error('[SUPABASE] Health check failed:', error.message);
            this.isConnected = false;
            return false;
        }
    }

    /**
     * Graceful shutdown
     */
    async disconnect() {
        // Supabase client doesn't need explicit disconnection
        this.isConnected = false;
        console.log('[SUPABASE] Disconnected');
    }
}

// Singleton instance
const supabaseClient = new SupabaseClient();

module.exports = supabaseClient;
