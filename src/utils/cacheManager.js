// src/utils/cacheManager.js - Centralized LRU Cache with TTL
// Performance optimization for frequently accessed data

const config = require('../config/config.js');

/**
 * LRU Cache implementation with TTL support
 */
class LRUCache {
    constructor(options = {}) {
        this.maxSize = options.maxSize || 1000;
        this.ttl = options.ttl || 300000; // 5 minutes default
        this.cache = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            evictions: 0
        };
    }

    /**
     * Get a value from cache
     */
    get(key) {
        const item = this.cache.get(key);

        if (!item) {
            this.stats.misses++;
            return null;
        }

        // Check TTL
        if (item.expiry && Date.now() > item.expiry) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }

        // Move to end (most recently used)
        this.cache.delete(key);
        this.cache.set(key, item);

        this.stats.hits++;
        return item.value;
    }

    /**
     * Set a value in cache
     */
    set(key, value, ttl = this.ttl) {
        // Evict LRU if at capacity
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
            this.stats.evictions++;
        }

        this.cache.set(key, {
            value,
            expiry: ttl > 0 ? Date.now() + ttl : null,
            createdAt: Date.now()
        });

        this.stats.sets++;
        return true;
    }

    /**
     * Check if key exists
     */
    has(key) {
        const item = this.cache.get(key);
        if (!item) return false;

        if (item.expiry && Date.now() > item.expiry) {
            this.cache.delete(key);
            return false;
        }

        return true;
    }

    /**
     * Delete a key
     */
    delete(key) {
        return this.cache.delete(key);
    }

    /**
     * Clear all entries
     */
    clear() {
        this.cache.clear();
        return true;
    }

    /**
     * Get cache size
     */
    get size() {
        return this.cache.size;
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const hitRate = this.stats.hits + this.stats.misses > 0
            ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
            : 0;

        return {
            ...this.stats,
            size: this.cache.size,
            maxSize: this.maxSize,
            hitRate: `${hitRate}%`
        };
    }

    /**
     * Cleanup expired entries
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, item] of this.cache.entries()) {
            if (item.expiry && now > item.expiry) {
                this.cache.delete(key);
                cleaned++;
            }
        }

        return cleaned;
    }
}

/**
 * CacheManager - Manages multiple cache namespaces
 */
class CacheManager {
    constructor() {
        this.caches = new Map();
        this.cleanupInterval = null;

        // Create default caches
        this.createCache('spotify', { maxSize: 500, ttl: 3600000 }); // 1 hour
        this.createCache('lyrics', { maxSize: 200, ttl: 86400000 }); // 24 hours
        this.createCache('search', { maxSize: 300, ttl: 1800000 }); // 30 mins
        this.createCache('recommendations', { maxSize: 100, ttl: 900000 }); // 15 mins
        this.createCache('userStats', { maxSize: 500, ttl: 300000 }); // 5 mins
        this.createCache('playlists', { maxSize: 200, ttl: 600000 }); // 10 mins

        // Start periodic cleanup
        this.startCleanup();
    }

    /**
     * Create a new cache namespace
     */
    createCache(name, options = {}) {
        this.caches.set(name, new LRUCache(options));
        return this.caches.get(name);
    }

    /**
     * Get a cache by name
     */
    getCache(name) {
        return this.caches.get(name);
    }

    /**
     * Get value from specific cache
     */
    get(cacheName, key) {
        const cache = this.caches.get(cacheName);
        return cache ? cache.get(key) : null;
    }

    /**
     * Set value in specific cache
     */
    set(cacheName, key, value, ttl) {
        const cache = this.caches.get(cacheName);
        return cache ? cache.set(key, value, ttl) : false;
    }

    /**
     * Delete from specific cache
     */
    delete(cacheName, key) {
        const cache = this.caches.get(cacheName);
        return cache ? cache.delete(key) : false;
    }

    /**
     * Clear specific cache
     */
    clearCache(cacheName) {
        const cache = this.caches.get(cacheName);
        return cache ? cache.clear() : false;
    }

    /**
     * Clear all caches
     */
    clearAll() {
        for (const cache of this.caches.values()) {
            cache.clear();
        }
        return true;
    }

    /**
     * Get all cache statistics
     */
    getAllStats() {
        const stats = {};
        for (const [name, cache] of this.caches.entries()) {
            stats[name] = cache.getStats();
        }
        return stats;
    }

    /**
     * Get total memory estimate
     */
    getMemoryEstimate() {
        let totalItems = 0;
        for (const cache of this.caches.values()) {
            totalItems += cache.size;
        }
        // Rough estimate: 1KB per item average
        return {
            items: totalItems,
            estimatedBytes: totalItems * 1024,
            estimatedMB: (totalItems * 1024 / 1024 / 1024).toFixed(2)
        };
    }

    /**
     * Start periodic cleanup
     */
    startCleanup(interval = 60000) { // Every minute
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        this.cleanupInterval = setInterval(() => {
            let totalCleaned = 0;
            for (const cache of this.caches.values()) {
                totalCleaned += cache.cleanup();
            }
            if (totalCleaned > 0) {
                console.log(`[CACHE] Cleaned up ${totalCleaned} expired entries`);
            }
        }, interval);
    }

    /**
     * Stop periodic cleanup
     */
    stopCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * Graceful shutdown
     */
    shutdown() {
        this.stopCleanup();
        this.clearAll();
    }
}

// Singleton instance
const cacheManager = new CacheManager();

module.exports = cacheManager;
