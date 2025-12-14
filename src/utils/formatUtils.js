// src/utils/formatUtils.js - Centralized formatting utilities
// Eliminates duplicate formatDuration/formatUptime across files

/**
 * Format milliseconds to human-readable duration (MM:SS or HH:MM:SS)
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration string
 */
function formatDuration(ms) {
    if (!ms || ms <= 0 || isNaN(ms)) return '0:00';

    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Format milliseconds to long-form uptime (e.g., "2d 5h 30m")
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted uptime string
 */
function formatUptime(ms) {
    if (!ms || ms <= 0) return '0s';

    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 && days === 0) parts.push(`${seconds}s`);

    return parts.join(' ') || '0s';
}

/**
 * Format a date to relative time ago (e.g., "5 minutes ago")
 * @param {Date} date - Date to format
 * @returns {string} Relative time string
 */
function getTimeAgo(date) {
    if (!date) return 'Unknown';

    const seconds = Math.floor((new Date() - new Date(date)) / 1000);

    if (seconds < 0) return 'Just now';

    const intervals = [
        { label: 'year', seconds: 31536000 },
        { label: 'month', seconds: 2592000 },
        { label: 'week', seconds: 604800 },
        { label: 'day', seconds: 86400 },
        { label: 'hour', seconds: 3600 },
        { label: 'minute', seconds: 60 },
        { label: 'second', seconds: 1 }
    ];

    for (const interval of intervals) {
        const count = Math.floor(seconds / interval.seconds);
        if (count >= 1) {
            return `${count} ${interval.label}${count > 1 ? 's' : ''} ago`;
        }
    }

    return 'Just now';
}

/**
 * Format bytes to human-readable size (e.g., "256 MB")
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string
 */
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
}

/**
 * Format a number with locale-aware separators
 * @param {number} num - Number to format
 * @returns {string} Formatted number string
 */
function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return num.toLocaleString();
}

/**
 * Format percentage with optional decimal places
 * @param {number} value - Value (0-1 or 0-100)
 * @param {boolean} isDecimal - If true, value is 0-1
 * @param {number} decimals - Decimal places (default: 1)
 * @returns {string} Formatted percentage string
 */
function formatPercentage(value, isDecimal = false, decimals = 1) {
    if (value === null || value === undefined) return '0%';

    const percent = isDecimal ? value * 100 : value;
    return `${percent.toFixed(decimals)}%`;
}

/**
 * Truncate text with ellipsis if too long
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length (default: 100)
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength = 100) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
}

/**
 * Format track title for display (clean YouTube artifacts)
 * @param {string} title - Raw title
 * @returns {string} Cleaned title
 */
function cleanTrackTitle(title) {
    if (!title) return 'Unknown';

    return title
        .replace(/\(Official\s*(Music\s*)?Video\)/gi, '')
        .replace(/\(Official\s*Audio\)/gi, '')
        .replace(/\(Lyrics?\s*(Video)?\)/gi, '')
        .replace(/\[Official\s*(Music\s*)?Video\]/gi, '')
        .replace(/\[Official\s*Audio\]/gi, '')
        .replace(/\[Lyrics?\s*(Video)?\]/gi, '')
        .replace(/\(Audio\)/gi, '')
        .replace(/\[Audio\]/gi, '')
        .replace(/\(HD\)/gi, '')
        .replace(/\[HD\]/gi, '')
        .replace(/\(HQ\)/gi, '')
        .replace(/\[HQ\]/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Create a progress bar visualization
 * @param {number} current - Current value
 * @param {number} total - Total value
 * @param {number} length - Bar length (default: 15)
 * @param {string} filled - Filled character (default: ▓)
 * @param {string} empty - Empty character (default: ░)
 * @returns {string} Progress bar string
 */
function createProgressBar(current, total, length = 15, filled = '▓', empty = '░') {
    if (!total || total <= 0) return empty.repeat(length);

    const progress = Math.min(current / total, 1);
    const filledLength = Math.round(progress * length);

    return filled.repeat(filledLength) + empty.repeat(length - filledLength);
}

/**
 * Create a volume bar visualization
 * @param {number} volume - Volume level (0-100 or 0-150)
 * @param {number} length - Bar length (default: 10)
 * @returns {string} Volume bar string
 */
function createVolumeBar(volume, length = 10) {
    const normalizedVolume = Math.min(volume / 100, 1.5);
    const filledLength = Math.round((normalizedVolume / 1.5) * length);

    return '█'.repeat(Math.min(filledLength, length)) + '░'.repeat(Math.max(length - filledLength, 0));
}

/**
 * Shuffle an array using Fisher-Yates algorithm
 * @param {Array} array - Array to shuffle
 * @returns {Array} Shuffled array (mutates original)
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

module.exports = {
    formatDuration,
    formatUptime,
    getTimeAgo,
    formatBytes,
    formatNumber,
    formatPercentage,
    truncateText,
    cleanTrackTitle,
    createProgressBar,
    createVolumeBar,
    shuffleArray
};
