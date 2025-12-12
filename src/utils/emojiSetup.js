// utils/emojiSetup.js
// Utility script to help set up custom emojis for your Discord bot

const fs = require('fs');
const path = require('path');

/**
 * Interactive emoji setup utility
 * Run this script to automatically extract emoji IDs from your Discord server
 */
class EmojiSetup {
    constructor(client) {
        this.client = client;
        // UPDATED: Map your custom emoji names to the required function names
        this.emojiMappings = {
            // Your emoji name -> Function name in config
            'Ryaprevious': 'previous',
            'Ryalyrics': 'lyrics', 
            'Ryashuffle': 'shuffle',
            'Ryastop': 'stop',
            'Ryaautoplay': 'autoplay',
            'Ryaplay': 'play',
            'Ryareplay': 'replay',
            'Ryaskip': 'skip',
            'Ryabrowse': 'browse',
            'Ryapause': 'pause',
            'Ryahistory': 'history',
            'Ryastats': 'stats',
            'Ryaviews': 'views',
            'Ryafeatures': 'features',
            'Ryaqueue': 'queue',
            'Ryaloop': 'loop',
            'Ryasound': 'sound'
        };
    }

    /**
     * Scan all guilds for custom emojis and generate config
     */
    async generateEmojiConfig() {
        console.log('🔍 Scanning for custom emojis...\n');
        
        const foundEmojis = {};
        const missingEmojis = [];
        
        // Search through all guilds the bot has access to
        for (const guild of this.client.guilds.cache.values()) {
            console.log(`📂 Scanning guild: ${guild.name}`);
            
            for (const [emojiName, functionName] of Object.entries(this.emojiMappings)) {
                if (!foundEmojis[functionName]) {
                    // Try to find emoji by name (case insensitive)
                    const emoji = guild.emojis.cache.find(e => 
                        e.name.toLowerCase() === emojiName.toLowerCase()
                    );
                    
                    if (emoji) {
                        foundEmojis[functionName] = {
                            id: emoji.id,
                            name: emoji.name,
                            animated: emoji.animated,
                            guild: guild.name,
                            url: emoji.url
                        };
                        console.log(`  ✅ Found ${emojiName}: <${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`);
                    }
                }
            }
        }
        
        // Check for missing emojis
        for (const [emojiName, functionName] of Object.entries(this.emojiMappings)) {
            if (!foundEmojis[functionName]) {
                missingEmojis.push(emojiName);
            }
        }
        
        console.log('\n📊 Emoji Scan Results:');
        console.log(`  ✅ Found: ${Object.keys(foundEmojis).length}/${Object.keys(this.emojiMappings).length} emojis`);
        
        if (missingEmojis.length > 0) {
            console.log(`  ❌ Missing: ${missingEmojis.join(', ')}`);
            console.log('\n💡 To add missing emojis:');
            console.log('  1. Upload the emoji files to your Discord server');
            console.log('  2. Use the exact names listed above');
            console.log('  3. Run this script again');
        }
        
        // Generate the config file
        await this.generateConfigFile(foundEmojis);
        
        return foundEmojis;
    }

    /**
     * Generate the emoji configuration file
     */
    async generateConfigFile(foundEmojis) {
        const configTemplate = this.createConfigTemplate(foundEmojis);
        const configPath = path.join(__dirname, '../config/emojiConfig.js');
        
        try {
            // Create backup of existing config
            if (fs.existsSync(configPath)) {
                const backupPath = `${configPath}.backup.${Date.now()}`;
                fs.copyFileSync(configPath, backupPath);
                console.log(`\n💾 Backed up existing config to: ${path.basename(backupPath)}`);
            }
            
            // Write new config
            fs.writeFileSync(configPath, configTemplate);
            console.log(`\n✅ Generated emoji configuration: ${configPath}`);
            
        } catch (error) {
            console.error('❌ Error writing config file:', error.message);
        }
    }

    /**
     * Create the configuration file template
     */
    createConfigTemplate(foundEmojis) {
        const categories = {
            PLAYBACK: ['play', 'pause', 'stop', 'skip', 'previous', 'replay'],
            QUEUE: ['queue', 'shuffle', 'loop', 'autoplay'],
            INFO: ['lyrics', 'history', 'stats', 'views', 'browse'],
            AUDIO: ['sound', 'features']
        };

        const fallbacks = {
            play: '▶️', pause: '⏸️', stop: '⏹️', skip: '⏭️', previous: '⏮️', replay: '🔂',
            queue: '📑', shuffle: '🔀', loop: '🔁', autoplay: '🎲',
            lyrics: '📝', history: '🕐', stats: 'ℹ️', views: '👁️', browse: '🔍',
            sound: '🔊', features: '⚙️'
        };

        let template = `// config/emojiConfig.js
// Auto-generated emoji configuration
// Generated on: ${new Date().toISOString()}

const EMOJI_CONFIG = {\n`;

        for (const [category, emojis] of Object.entries(categories)) {
            template += `    // ${category.toLowerCase()} controls\n`;
            template += `    ${category}: {\n`;
            
            for (const emojiKey of emojis) {
                const emoji = foundEmojis[emojiKey];
                if (emoji) {
                    template += `        ${emojiKey}: {\n`;
                    template += `            id: '${emoji.id}',\n`;
                    template += `            name: '${emoji.name}',\n`;
                    template += `            animated: ${emoji.animated},\n`;
                    template += `            fallback: '${fallbacks[emojiKey] || '🎵'}'\n`;
                    template += `        },\n`;
                } else {
                    template += `        ${emojiKey}: {\n`;
                    template += `            id: '1234567890123456789', // MISSING - Please upload emoji\n`;
                    template += `            name: '${emojiKey}',\n`;
                    template += `            animated: false,\n`;
                    template += `            fallback: '${fallbacks[emojiKey] || '🎵'}'\n`;
                    template += `        },\n`;
                }
            }
            
            template += `    },\n\n`;
        }

        template += `};

// Premium color scheme (Cyan + Purple gradient theme)
const PREMIUM_COLORS = {
    PRIMARY: 0x6366F1,      // Indigo-500
    SECONDARY: 0x8B5CF6,    // Violet-500  
    ACCENT: 0x06B6D4,       // Cyan-500
    SUCCESS: 0x10B981,      // Emerald-500
    WARNING: 0xF59E0B,      // Amber-500
    ERROR: 0xEF4444,        // Red-500
    MUSIC: 0x6366F1,        // Music embeds
    QUEUE: 0x8B5CF6,        // Queue embeds
    LYRICS: 0x06B6D4,       // Lyrics embeds
    EFFECTS: 0x7C3AED,      // Effects embeds
    HISTORY: 0x9333EA       // History embeds
};

// Build emoji string for Discord
function buildEmoji(category, name) {
    const emoji = EMOJI_CONFIG[category]?.[name];
    if (!emoji || emoji.id === '1234567890123456789') return null;
    
    return emoji.animated ? 
        \`<a:\${emoji.name}:\${emoji.id}>\` : 
        \`<:\${emoji.name}:\${emoji.id}>\`;
}

// Get emoji with fallback support
function getEmoji(category, name, fallback = null) {
    const customEmoji = buildEmoji(category, name);
    if (customEmoji) return customEmoji;
    
    const emoji = EMOJI_CONFIG[category]?.[name];
    return emoji?.fallback || fallback || '🎵';
}

// Quick access functions for common emojis
const QUICK_EMOJIS = {
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
    
    // Info features
    lyrics: () => getEmoji('INFO', 'lyrics'),
    history: () => getEmoji('INFO', 'history'),
    stats: () => getEmoji('INFO', 'stats'),
    views: () => getEmoji('INFO', 'views'),
    browse: () => getEmoji('INFO', 'browse'),
    
    // Audio features
    sound: () => getEmoji('AUDIO', 'sound'),
    features: () => getEmoji('AUDIO', 'features')
};

// Validation function
function validateEmojiConfig() {
    const issues = [];
    let validCount = 0;
    
    Object.keys(EMOJI_CONFIG).forEach(category => {
        Object.keys(EMOJI_CONFIG[category]).forEach(name => {
            const emoji = EMOJI_CONFIG[category][name];
            if (emoji.id === '1234567890123456789') {
                issues.push(\`\${category}.\${name}: Missing emoji ID\`);
            } else {
                validCount++;
            }
        });
    });
    
    if (issues.length > 0) {
        console.warn('[EMOJI] Missing emojis:', issues);
        return false;
    }
    
    console.log(\`[EMOJI] All \${validCount} emojis configured correctly!\`);
    return true;
}

module.exports = {
    EMOJI_CONFIG,
    PREMIUM_COLORS,
    buildEmoji,
    getEmoji,
    QUICK_EMOJIS,
    validateEmojiConfig
};`;

        return template;
    }

    /**
     * Display setup instructions
     */
    displaySetupInstructions() {
        console.log('\n🎨 CUSTOM EMOJI SETUP GUIDE');
        console.log('═'.repeat(50));
        console.log('\n📋 Required Emojis (Your naming):');
        
        Object.entries(this.emojiMappings).forEach(([emojiName, functionName]) => {
            console.log(`  • ${emojiName} (for ${functionName} function)`);
        });
        
        console.log('\n📝 Setup Steps:');
        console.log('  1. Your emojis are already uploaded with the correct names ✅');
        console.log('  2. Run: node utils/emojiSetup.js');
        console.log('  3. The script will auto-generate your config');
        console.log('\n💡 Tips:');
        console.log('  • The bot needs access to the server with these emojis');
        console.log('  • All your emoji names match the expected pattern');
        console.log('  • Configuration will be generated automatically');
    }

    /**
     * Test emoji functionality
     */
    async testEmojis() {
        console.log('\n🧪 Testing Emoji Configuration...\n');
        
        try {
            const { QUICK_EMOJIS, validateEmojiConfig } = require('../config/emojiConfig.js');
            
            const isValid = validateEmojiConfig();
            
            if (isValid) {
                console.log('✅ All emojis are properly configured!\n');
                
                console.log('🎮 Available Emojis:');
                Object.entries(QUICK_EMOJIS).forEach(([name, func]) => {
                    console.log(`  ${name}: ${func()}`);
                });
            }
            
        } catch (error) {
            console.error('❌ Error testing emojis:', error.message);
            console.log('💡 Make sure to run the generator first!');
        }
    }
}

// Command-line usage
if (require.main === module) {
    console.log('🎨 Discord Bot Emoji Setup Utility\n');
    
    const args = process.argv.slice(2);
    const command = args[0];
    
    if (command === 'instructions') {
        const setup = new EmojiSetup(null);
        setup.displaySetupInstructions();
    } else if (command === 'test') {
        const setup = new EmojiSetup(null);
        setup.testEmojis();
    } else {
        console.log('📋 Available Commands:');
        console.log('  node utils/emojiSetup.js instructions  - Show setup guide');
        console.log('  node utils/emojiSetup.js test         - Test current config');
        console.log('\n💡 To generate config, call generateEmojiConfig() with your Discord client');
    }
}

module.exports = EmojiSetup;