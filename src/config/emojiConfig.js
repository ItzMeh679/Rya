// config/emojiConfig.js
// Enhanced Rya Music Bot Emoji Configuration

/**
 * Custom Emoji Configuration for Rya Music Bot
 * 
 * To get your emoji IDs:
 * 1. Upload your custom emojis to your Discord server with exact names below
 * 2. Type \:emoji_name: in any channel to get the full emoji code
 * 3. Copy the ID from <:emoji_name:ID_HERE> and paste below
 * 4. Make sure your bot has access to these emojis
 */

const EMOJI_CONFIG = {
    // Core playback controls
    PLAYBACK: {
        play: {
            id: '1412037694221058058',
            name: 'Ryaplay',
            animated: false,
            fallback: '▶️'
        },
        pause: {
            id: '1412037507935240235',
            name: 'Ryapause',
            animated: false,
            fallback: '⏸️'
        },
        stop: {
            id: '1412037767352815696',
            name: 'Ryastop',
            animated: false,
            fallback: '⏹️'
        },
        skip: {
            id: '1412037603556986921',
            name: 'Ryaskip',
            animated: false,
            fallback: '⏭️'
        },
        previous: {
            id: '1412039878744608909',
            name: 'Ryaprevious',
            animated: false,
            fallback: '⏮️'
        },
        replay: {
            id: '1412037655536992356',
            name: 'Ryareplay',
            animated: false,
            fallback: '🔂'
        }
    },

    // Queue and playlist controls
    QUEUE: {
        queue: {
            id: '1412037265353609286',
            name: 'Ryaqueue',
            animated: false,
            fallback: '📑'
        },
        shuffle: {
            id: '1412037787582206062',
            name: 'Ryashuffle',
            animated: false,
            fallback: '🔀'
        },
        loop: {
            id: '1412036841783296131',
            name: 'Ryaloop',
            animated: false,
            fallback: '🔁'
        },
        autoplay: {
            id: '1412037745240707215',
            name: 'Ryaautoplay',
            animated: false,
            fallback: '🎲'
        }
    },

    // Information and features
    INFO: {
        lyrics: {
            id: '1412037852551708772',
            name: 'Ryalyrics',
            animated: false,
            fallback: '📝'
        },
        history: {
            id: '1412037449110261780',
            name: 'Ryahistory',
            animated: false,
            fallback: '🕐'
        },
        stats: {
            id: '1412037427044024400',
            name: 'Ryastats',
            animated: false,
            fallback: 'ℹ️'
        },
        views: {
            id: '1412037407041126460',
            name: 'Ryaviews',
            animated: false,
            fallback: '👁️'
        },
        browse: {
            id: '1412037532077654129',
            name: 'Ryabrowse',
            animated: false,
            fallback: '🔍'
        },
        live: {
            id: '1412391139457110087', // Updated with a real ID
            name: 'Ryalive',
            animated: true, // Usually live indicators are animated
            fallback: '🔴'
        }
    },

    // Audio and effects
    AUDIO: {
        sound: {
            id: '1412036510072700989',
            name: 'Ryasound',
            animated: false,
            fallback: '🔊'
        },
        volume: {
            id: '1412390624929513634', // Updated with a real ID
            name: 'Ryavolume',
            animated: false,
            fallback: '🔊'
        },
        mute: {
            id: '1412390470587387986', // Updated with a real ID
            name: 'Ryamute',
            animated: false,
            fallback: '🔇'
        },
        features: {
            id: '1412037336299999293',
            name: 'Ryafeatures',
            animated: false,
            fallback: '⚙️'
        },
        effects: {
            id: '1412388390602674326',
            name: 'Ryaeffects',
            animated: false,
            fallback: '🎛️'
        },
        equalizer: {
            id: '1449318106534121493',
            name: 'equilizer',
            animated: false,
            fallback: '🎚️'
        }
    }
};

/**
 * Enhanced color scheme for Rya Music Bot (Cyan + Purple gradient theme)
 */
const RYA_COLORS = {
    // Primary brand colors
    PRIMARY: 0x6366F1,          // Indigo-500 - Main brand color
    SECONDARY: 0x8B5CF6,        // Violet-500 - Secondary brand
    ACCENT: 0x06B6D4,           // Cyan-500 - Accent highlights

    // Status colors  
    SUCCESS: 0x10B981,          // Emerald-500 - Success states
    WARNING: 0xF59E0B,          // Amber-500 - Warning states
    ERROR: 0xEF4444,            // Red-500 - Error states

    // Feature-specific colors
    MUSIC: 0x6366F1,            // Indigo for music embeds
    QUEUE: 0x8B5CF6,            // Violet for queue
    LYRICS: 0x06B6D4,           // Cyan for lyrics
    EFFECTS: 0x7C3AED,          // Purple-600 for effects
    HISTORY: 0x9333EA,          // Purple-500 for history
    VOLUME: 0x10B981,           // Emerald for volume
    LIVE: 0xEF4444,             // Red for live status

    // Gradient colors for special effects
    GRADIENT_START: 0x06B6D4,   // Cyan
    GRADIENT_END: 0x8B5CF6      // Violet
};

/**
 * Build emoji string for Discord
 */
function buildEmoji(category, name) {
    const emoji = EMOJI_CONFIG[category]?.[name];
    if (!emoji || emoji.id === '1234567890123456789') return null;

    if (emoji.animated) {
        return `<a:${emoji.name}:${emoji.id}>`;
    } else {
        return `<:${emoji.name}:${emoji.id}>`;
    }
}

/**
 * Get emoji with fallback support
 */
function getEmoji(category, name, fallback = null) {
    const customEmoji = buildEmoji(category, name);
    if (customEmoji) return customEmoji;

    // Try to find fallback in config
    const emoji = EMOJI_CONFIG[category]?.[name];
    if (emoji?.fallback) return emoji.fallback;

    // Use provided fallback or default
    return fallback || '🎵';
}

/**
 * Get all emojis for a category
 */
function getCategoryEmojis(category) {
    const categoryEmojis = EMOJI_CONFIG[category];
    if (!categoryEmojis) return {};

    const result = {};
    Object.keys(categoryEmojis).forEach(name => {
        result[name] = getEmoji(category, name);
    });

    return result;
}

/**
 * Quick access functions for commonly used emojis
 */
const RYA_EMOJIS = {
    // Playback controls
    play: () => getEmoji('PLAYBACK', 'play'),
    pause: () => getEmoji('PLAYBACK', 'pause'),
    stop: () => getEmoji('PLAYBACK', 'stop'),
    skip: () => getEmoji('PLAYBACK', 'skip'),
    previous: () => getEmoji('PLAYBACK', 'previous'),
    replay: () => getEmoji('PLAYBACK', 'replay'),

    // Queue controls
    queue: () => getEmoji('QUEUE', 'queue'),
    shuffle: () => getEmoji('QUEUE', 'shuffle'),
    loop: () => getEmoji('QUEUE', 'loop'),
    autoplay: () => getEmoji('QUEUE', 'autoplay'),

    // Info and features
    lyrics: () => getEmoji('INFO', 'lyrics'),
    history: () => getEmoji('INFO', 'history'),
    stats: () => getEmoji('INFO', 'stats'),
    views: () => getEmoji('INFO', 'views'),
    browse: () => getEmoji('INFO', 'browse'),
    live: () => getEmoji('INFO', 'live'),

    // Audio controls
    sound: () => getEmoji('AUDIO', 'sound'),
    volume: () => getEmoji('AUDIO', 'volume'),
    mute: () => getEmoji('AUDIO', 'mute'),
    features: () => getEmoji('AUDIO', 'features'),
    effects: () => getEmoji('AUDIO', 'effects'),
    equalizer: () => getEmoji('AUDIO', 'equalizer')
};

/**
 * Volume level emojis for better UX
 */
const VOLUME_EMOJIS = {
    0: () => getEmoji('AUDIO', 'mute'),
    low: () => getEmoji('AUDIO', 'volume'), // 1-33%
    medium: () => getEmoji('AUDIO', 'sound'), // 34-66%  
    high: () => getEmoji('AUDIO', 'sound'), // 67-100%
    getVolumeEmoji: (volume) => {
        if (volume === 0) return VOLUME_EMOJIS[0]();
        if (volume <= 33) return VOLUME_EMOJIS.low();
        if (volume <= 66) return VOLUME_EMOJIS.medium();
        return VOLUME_EMOJIS.high();
    }
};

/**
 * Validate emoji configuration
 */
function validateEmojiConfig() {
    const issues = [];
    let validCount = 0;

    Object.keys(EMOJI_CONFIG).forEach(category => {
        Object.keys(EMOJI_CONFIG[category]).forEach(name => {
            const emoji = EMOJI_CONFIG[category][name];

            // Check required fields
            if (!emoji.id || emoji.id === '1234567890123456789') {
                issues.push(`${category}.${name}: Missing or placeholder emoji ID`);
            } else {
                validCount++;
            }

            if (!emoji.name) {
                issues.push(`${category}.${name}: Missing emoji name`);
            }

            if (!emoji.fallback) {
                issues.push(`${category}.${name}: Missing fallback emoji`);
            }
        });
    });

    if (issues.length > 0) {
        console.warn('[RYA EMOJIS] Configuration issues found:');
        issues.forEach(issue => console.warn(`  - ${issue}`));
        console.warn(`[RYA EMOJIS] ${validCount} emojis configured, ${issues.length} missing`);
        return false;
    }

    console.log(`[RYA EMOJIS] All ${validCount} emojis configured correctly!`);
    return true;
}

// Export configuration - FIXED EXPORT STRUCTURE
module.exports = {
    EMOJI_CONFIG,
    RYA_COLORS,
    buildEmoji,
    getEmoji,
    getCategoryEmojis,
    RYA_EMOJIS,
    VOLUME_EMOJIS,
    validateEmojiConfig,

    // Legacy exports for compatibility
    QUICK_EMOJIS: RYA_EMOJIS,
    PREMIUM_COLORS: RYA_COLORS  // This ensures backward compatibility
};

/**
 * SETUP INSTRUCTIONS FOR RYA MUSIC BOT:
 * 
 * 1. Upload these custom emojis to your Discord server with EXACT names:
 *    - Ryaplay, Ryapause, Ryastop, Ryaskip, Ryaprevious, Ryareplay
 *    - Ryaqueue, Ryashuffle, Ryaloop, Ryaautoplay  
 *    - Ryalyrics, Ryahistory, Ryastats, Ryaviews, Ryabrowse, Ryalive
 *    - Ryasound, Ryavolume, Ryamute, Ryafeatures, Ryaeffects, Ryaequalizer
 * 
 * 2. Get emoji IDs by typing \:Ryaplay: etc. in any channel
 *    This shows: <:Ryaplay:1234567890123456789>
 * 
 * 3. Replace the placeholder IDs (1234567890123456789) with your real IDs
 * 
 * 4. Update your interactionCreate.js to import this config:
 *    const { RYA_EMOJIS, RYA_COLORS } = require('../config/emojiConfig.js');
 * 
 * 5. Run validateEmojiConfig() to test your setup
 * 
 * 6. All fallback emojis will be used if custom ones fail
 */