#!/usr/bin/env node
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./src/config/config.js');


class CommandDeployer {
    constructor() {
        this.commands = [];
        this.rest = new REST({ version: '10' }).setToken(config.discord.token);
        this.startTime = Date.now();
    }

    /**
     * Load all commands from the commands directory
     */
    async loadCommands() {
        console.log('\n🔄 Loading slash commands...');
        
        const commandsPath = path.join(__dirname, 'src', 'commands');
        
        try {
            const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
            
            if (commandFiles.length === 0) {
                throw new Error('No command files found in commands directory');
            }

            for (const file of commandFiles) {
                const filePath = path.join(commandsPath, file);
                
                try {
                    // Clear require cache for hot reloading during development
                    delete require.cache[require.resolve(filePath)];
                    
                    const command = require(filePath);
                    
                    // Validate command structure
                    if (!this.validateCommand(command, file)) {
                        continue;
                    }
                    
                    this.commands.push(command.data.toJSON());
                    console.log(`   ✅ Loaded: ${command.data.name} (${file})`);
                    
                } catch (error) {
                    console.error(`   ❌ Failed to load ${file}:`, error.message);
                    
                    // In production, fail fast on command load errors
                    if (config.isProduction()) {
                        throw error;
                    }
                }
            }
            
            if (this.commands.length === 0) {
                throw new Error('No valid commands were loaded');
            }
            
            console.log(`\n📊 Successfully loaded ${this.commands.length} commands`);
            return this.commands;
            
        } catch (error) {
            console.error('\n❌ Error loading commands:', error.message);
            throw error;
        }
    }

    /**
     * Validate command structure
     */
    validateCommand(command, filename) {
        const requiredProperties = ['data', 'execute'];
        const issues = [];

        // Check for required properties
        requiredProperties.forEach(prop => {
            if (!command[prop]) {
                issues.push(`Missing required property: ${prop}`);
            }
        });

        // Validate command data
        if (command.data) {
            if (!command.data.name) {
                issues.push('Command data is missing name');
            }
            
            if (!command.data.description) {
                issues.push('Command data is missing description');
            }

            // Validate command name format
            if (command.data.name && !/^[a-z0-9_-]{1,32}$/.test(command.data.name)) {
                issues.push('Command name must be lowercase alphanumeric with dashes/underscores, 1-32 characters');
            }

            // Validate description length
            if (command.data.description && command.data.description.length > 100) {
                issues.push('Command description must be 100 characters or less');
            }
        }

        // Validate execute function
        if (command.execute && typeof command.execute !== 'function') {
            issues.push('execute must be a function');
        }

        // Log issues and return validation result
        if (issues.length > 0) {
            console.error(`   ❌ Validation failed for ${filename}:`);
            issues.forEach(issue => console.error(`      - ${issue}`));
            return false;
        }

        return true;
    }

    /**
     * Deploy commands globally
     */
    async deployGlobal() {
        try {
            console.log('\n🌍 Deploying commands globally...');
            console.log(`   📤 Deploying ${this.commands.length} commands to Discord API...`);
            
            const data = await this.rest.put(
                Routes.applicationCommands(config.discord.clientId),
                { body: this.commands }
            );

            console.log(`   ✅ Successfully deployed ${data.length} global commands`);
            this.logDeploymentDetails(data, 'global');
            
            return data;
            
        } catch (error) {
            console.error('\n❌ Global deployment failed:', error);
            throw error;
        }
    }

    /**
     * Deploy commands to specific guild (for testing)
     */
    async deployGuild(guildId) {
        try {
            console.log(`\n🏠 Deploying commands to guild: ${guildId}...`);
            console.log(`   📤 Deploying ${this.commands.length} commands to guild...`);
            
            const data = await this.rest.put(
                Routes.applicationGuildCommands(config.discord.clientId, guildId),
                { body: this.commands }
            );

            console.log(`   ✅ Successfully deployed ${data.length} guild commands`);
            this.logDeploymentDetails(data, 'guild', guildId);
            
            return data;
            
        } catch (error) {
            console.error(`\n❌ Guild deployment failed for ${guildId}:`, error);
            throw error;
        }
    }

    /**
     * Delete all global commands (cleanup utility)
     */
    async deleteGlobalCommands() {
        try {
            console.log('\n🗑️  Deleting all global commands...');
            
            const data = await this.rest.put(
                Routes.applicationCommands(config.discord.clientId),
                { body: [] }
            );

            console.log('   ✅ Successfully deleted all global commands');
            return data;
            
        } catch (error) {
            console.error('\n❌ Failed to delete global commands:', error);
            throw error;
        }
    }

    /**
     * Delete all guild commands (cleanup utility)
     */
    async deleteGuildCommands(guildId) {
        try {
            console.log(`\n🗑️  Deleting all guild commands for: ${guildId}...`);
            
            const data = await this.rest.put(
                Routes.applicationGuildCommands(config.discord.clientId, guildId),
                { body: [] }
            );

            console.log(`   ✅ Successfully deleted all guild commands for ${guildId}`);
            return data;
            
        } catch (error) {
            console.error(`\n❌ Failed to delete guild commands for ${guildId}:`, error);
            throw error;
        }
    }

    /**
     * Get currently deployed commands
     */
    async getDeployedCommands(guildId = null) {
        try {
            let route;
            let scope;
            
            if (guildId) {
                route = Routes.applicationGuildCommands(config.discord.clientId, guildId);
                scope = `guild ${guildId}`;
            } else {
                route = Routes.applicationCommands(config.discord.clientId);
                scope = 'globally';
            }
            
            console.log(`\n📋 Fetching deployed commands ${scope}...`);
            
            const data = await this.rest.get(route);
            
            console.log(`   ℹ️  Found ${data.length} deployed commands ${scope}`);
            
            if (data.length > 0) {
                console.log('   📝 Deployed commands:');
                data.forEach(cmd => {
                    console.log(`      - ${cmd.name} (ID: ${cmd.id})`);
                });
            }
            
            return data;
            
        } catch (error) {
            console.error(`\n❌ Failed to fetch deployed commands:`, error);
            throw error;
        }
    }

    /**
     * Compare local and deployed commands
     */
    async compareCommands(guildId = null) {
        try {
            const deployedCommands = await this.getDeployedCommands(guildId);
            const localCommands = this.commands;
            
            console.log('\n🔍 Comparing local vs deployed commands...');
            
            const deployedNames = new Set(deployedCommands.map(cmd => cmd.name));
            const localNames = new Set(localCommands.map(cmd => cmd.name));
            
            const onlyDeployed = [...deployedNames].filter(name => !localNames.has(name));
            const onlyLocal = [...localNames].filter(name => !deployedNames.has(name));
            const common = [...localNames].filter(name => deployedNames.has(name));
            
            console.log(`   📊 Common commands: ${common.length}`);
            console.log(`   📤 Only deployed: ${onlyDeployed.length}`);
            console.log(`   📥 Only local: ${onlyLocal.length}`);
            
            if (onlyDeployed.length > 0) {
                console.log('   🔴 Commands only in deployment:', onlyDeployed.join(', '));
            }
            
            if (onlyLocal.length > 0) {
                console.log('   🟡 Commands only locally:', onlyLocal.join(', '));
            }
            
            return {
                common,
                onlyDeployed,
                onlyLocal,
                needsUpdate: onlyDeployed.length > 0 || onlyLocal.length > 0
            };
            
        } catch (error) {
            console.error('\n❌ Failed to compare commands:', error);
            throw error;
        }
    }

    /**
     * Log deployment details
     */
    logDeploymentDetails(deployedCommands, scope, guildId = null) {
        const duration = Date.now() - this.startTime;
        
        console.log(`\n📋 Deployment Summary (${scope}${guildId ? ` - ${guildId}` : ''}):`);
        console.log(`   ⏱️  Duration: ${duration}ms`);
        console.log(`   📊 Commands deployed: ${deployedCommands.length}`);
        console.log(`   📝 Command list:`);
        
        deployedCommands.forEach(command => {
            const options = command.options?.length > 0 ? ` (${command.options.length} options)` : '';
            console.log(`      - ${command.name}: ${command.description}${options}`);
        });
        
        console.log(`\n✨ Deployment completed successfully!`);
        
        if (scope === 'global') {
            console.log('⚠️  Note: Global commands may take up to 1 hour to update across all servers.');
        }
    }

    /**
     * Validate environment and configuration
     */
    validateEnvironment() {
        const issues = [];
        
        if (!config.discord.token) {
            issues.push('DISCORD_TOKEN is not set');
        }
        
        if (!config.discord.clientId) {
            issues.push('DISCORD_CLIENT_ID is not set');
        }
        
        // Validate token format (Discord bot tokens have a specific format)
        if (config.discord.token && !config.discord.token.match(/^[A-Za-z0-9._-]{20,}$/)) {
            issues.push('DISCORD_TOKEN appears to be invalid format');
        }
        
        // Validate client ID format (Discord snowflakes are 17-19 digit numbers)
        if (config.discord.clientId && !config.discord.clientId.match(/^\d{17,19}$/)) {
            issues.push('DISCORD_CLIENT_ID appears to be invalid format');
        }
        
        if (issues.length > 0) {
            console.error('\n❌ Environment validation failed:');
            issues.forEach(issue => console.error(`   - ${issue}`));
            console.error('\nPlease check your .env file and configuration.');
            return false;
        }
        
        return true;
    }

    /**
     * Interactive deployment menu
     */
    async interactiveMenu() {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

        try {
            console.log('\n🎛️  Interactive Command Deployment');
            console.log('=====================================');
            console.log('1. Deploy globally (recommended for production)');
            console.log('2. Deploy to specific guild (recommended for testing)');
            console.log('3. Compare local vs deployed commands');
            console.log('4. Delete all global commands');
            console.log('5. Delete all guild commands');
            console.log('6. View deployed commands');
            console.log('0. Exit');
            
            const choice = await question('\nSelect an option (0-6): ');
            
            switch (choice) {
                case '1':
                    await this.deployGlobal();
                    break;
                    
                case '2':
                    const guildId = await question('Enter guild ID: ');
                    if (guildId.match(/^\d{17,19}$/)) {
                        await this.deployGuild(guildId);
                    } else {
                        console.log('❌ Invalid guild ID format');
                    }
                    break;
                    
                case '3':
                    const compareGuildId = await question('Enter guild ID (or press Enter for global): ');
                    await this.compareCommands(compareGuildId || null);
                    break;
                    
                case '4':
                    const confirmGlobal = await question('⚠️  Delete ALL global commands? (y/N): ');
                    if (confirmGlobal.toLowerCase() === 'y') {
                        await this.deleteGlobalCommands();
                    }
                    break;
                    
                case '5':
                    const deleteGuildId = await question('Enter guild ID: ');
                    if (deleteGuildId.match(/^\d{17,19}$/)) {
                        const confirmGuild = await question(`⚠️  Delete ALL commands for guild ${deleteGuildId}? (y/N): `);
                        if (confirmGuild.toLowerCase() === 'y') {
                            await this.deleteGuildCommands(deleteGuildId);
                        }
                    } else {
                        console.log('❌ Invalid guild ID format');
                    }
                    break;
                    
                case '6':
                    const viewGuildId = await question('Enter guild ID (or press Enter for global): ');
                    await this.getDeployedCommands(viewGuildId || null);
                    break;
                    
                case '0':
                    console.log('👋 Goodbye!');
                    break;
                    
                default:
                    console.log('❌ Invalid option selected');
            }
            
        } finally {
            rl.close();
        }
    }
}

// Main execution logic
async function main() {
    const deployer = new CommandDeployer();
    
    console.log('🎵 Advanced Discord Music Bot - Command Deployer');
    console.log('=================================================');
    console.log(`Environment: ${config.isDevelopment() ? 'Development' : 'Production'}`);
    console.log(`Client ID: ${config.discord.clientId}`);
    console.log(`Token: ${config.discord.token ? '***' + config.discord.token.slice(-4) : 'NOT SET'}`);
    
    try {
        // Validate environment
        if (!deployer.validateEnvironment()) {
            process.exit(1);
        }
        
        // Load commands
        await deployer.loadCommands();
        
        // Parse command line arguments
        const args = process.argv.slice(2);
        const command = args[0];
        const guildId = args[1];
        
        switch (command) {
            case 'global':
            case 'g':
                console.log('\n🌍 Starting global deployment...');
                await deployer.deployGlobal();
                break;
                
            case 'guild':
            case 'test':
                if (!guildId) {
                    console.error('❌ Guild ID required for guild deployment');
                    console.log('Usage: node deploy-commands.js guild <GUILD_ID>');
                    process.exit(1);
                }
                
                if (!guildId.match(/^\d{17,19}$/)) {
                    console.error('❌ Invalid guild ID format');
                    process.exit(1);
                }
                
                console.log(`\n🏠 Starting guild deployment for: ${guildId}...`);
                await deployer.deployGuild(guildId);
                break;
                
            case 'delete-global':
                console.log('\n⚠️  WARNING: This will delete ALL global commands!');
                if (config.isProduction()) {
                    console.log('❌ Global command deletion is disabled in production mode');
                    console.log('Use interactive mode if you really need to do this');
                    process.exit(1);
                }
                await deployer.deleteGlobalCommands();
                break;
                
            case 'delete-guild':
                if (!guildId) {
                    console.error('❌ Guild ID required');
                    console.log('Usage: node deploy-commands.js delete-guild <GUILD_ID>');
                    process.exit(1);
                }
                
                console.log(`\n⚠️  Deleting ALL commands for guild: ${guildId}`);
                await deployer.deleteGuildCommands(guildId);
                break;
                
            case 'compare':
                console.log('\n🔍 Comparing commands...');
                const result = await deployer.compareCommands(guildId || null);
                
                if (result.needsUpdate) {
                    console.log('\n💡 Commands are out of sync. Consider redeploying.');
                    process.exit(1);
                } else {
                    console.log('\n✅ Commands are in sync!');
                }
                break;
                
            case 'list':
            case 'ls':
                await deployer.getDeployedCommands(guildId || null);
                break;
                
            case 'interactive':
            case 'i':
                await deployer.interactiveMenu();
                break;
                
            case 'help':
            case '--help':
            case '-h':
                displayHelp();
                break;
                
            default:
                if (config.isDevelopment()) {
                    // In development, default to interactive mode
                    await deployer.interactiveMenu();
                } else {
                    // In production, require explicit command
                    console.log('❌ No command specified');
                    displayHelp();
                    process.exit(1);
                }
        }
        
        console.log('\n🎉 Operation completed successfully!');
        
    } catch (error) {
        console.error('\n💥 Deployment failed:', error.message);
        
        if (config.isDevelopment()) {
            console.error('\nFull error details:');
            console.error(error);
        }
        
        // Provide helpful error messages for common issues
        if (error.message.includes('401')) {
            console.error('\n💡 This looks like an authentication error. Please check:');
            console.error('   - Your DISCORD_TOKEN is correct');
            console.error('   - The bot token has not been regenerated');
            console.error('   - The token has proper permissions');
        } else if (error.message.includes('403')) {
            console.error('\n💡 This looks like a permissions error. Please check:');
            console.error('   - Your bot has the applications.commands scope');
            console.error('   - You have permission to manage the target guild');
        } else if (error.message.includes('404')) {
            console.error('\n💡 This looks like a not found error. Please check:');
            console.error('   - Your DISCORD_CLIENT_ID is correct');
            console.error('   - The guild ID exists and is correct');
        }
        
        process.exit(1);
    }
}

// Display help information
function displayHelp() {
    console.log('\n📖 Command Deployment Help');
    console.log('===========================');
    console.log('\nUsage: node deploy-commands.js [command] [options]\n');
    console.log('Commands:');
    console.log('  global, g                Deploy commands globally');
    console.log('  guild <id>, test <id>    Deploy commands to specific guild');
    console.log('  delete-global            Delete all global commands (dev only)');
    console.log('  delete-guild <id>        Delete all guild commands');
    console.log('  compare [guild_id]       Compare local vs deployed commands');
    console.log('  list [guild_id], ls      List deployed commands');
    console.log('  interactive, i           Interactive deployment menu');
    console.log('  help, --help, -h         Show this help message');
    console.log('\nExamples:');
    console.log('  node deploy-commands.js global');
    console.log('  node deploy-commands.js guild 123456789012345678');
    console.log('  node deploy-commands.js compare');
    console.log('  node deploy-commands.js interactive');
    console.log('\nEnvironment Variables Required:');
    console.log('  DISCORD_TOKEN     - Bot token from Discord Developer Portal');
    console.log('  DISCORD_CLIENT_ID - Application ID from Discord Developer Portal');
    console.log('\nNotes:');
    console.log('  - Global commands can take up to 1 hour to update');
    console.log('  - Guild commands update immediately');
    console.log('  - Use guild deployment for testing');
    console.log('  - Use global deployment for production');
}

// Handle process signals gracefully
process.on('SIGINT', () => {
    console.log('\n\n👋 Deployment interrupted. Goodbye!');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n👋 Deployment terminated. Goodbye!');
    process.exit(0);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('\n💥 Unhandled Promise Rejection:', reason);
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('\n💥 Uncaught Exception:', error);
    process.exit(1);
});

// Run main function if this script is executed directly
if (require.main === module) {
    main().catch(error => {
        console.error('💥 Fatal error:', error);
        process.exit(1);
    });
}

module.exports = CommandDeployer;