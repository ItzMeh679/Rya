const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath('F:/Rya/ffmpeg-master-latest-win64-gpl-shared/ffmpeg-master-latest-win64-gpl-shared/bin/ffmpeg.exe');
ffmpeg.setFfprobePath('F:/Rya/ffmpeg-master-latest-win64-gpl-shared/ffmpeg-master-latest-win64-gpl-shared/bin/ffprobe.exe');
const { Transform, PassThrough } = require('stream');
const config = require('../config/config.js');
const EventEmitter = require('events');

class AudioEffects extends EventEmitter {
    constructor() {
        super();
        this.effectsCache = new Map();
        this.processingQueue = new Map();
        this.streamPool = new Map();
        this.maxCacheSize = 25;
        this.maxConcurrentProcesses = 1; // Reduced for stability
        this.activeProcesses = 0;
        this.processingStats = {
            success: 0,
            errors: 0,
            cacheHits: 0,
            cacheMisses: 0
        };

        // Advanced streaming configuration
        this.streamConfig = {
            inputFormat: 'webm',
            outputFormat: 'opus',
            audioCodec: 'libopus',
            sampleRate: 48000,
            channels: 2,
            bitrate: '128k',
            bufferSize: 128 * 1024, // 128KB buffer
            timeout: 55000, // Increased timeout
            reconnectStreams: true,
            prebuffer: true
        };

        // Pre-computed filter templates
        this.filterTemplates = this.initializeFilterTemplates();

        console.log('[AUDIO EFFECTS] Enhanced audio effects system initialized');
    }

    /**
     * Initialize optimized filter templates
     */
    initializeFilterTemplates() {
        return {
            spatial3D: [
                'apulsator=hz=0.1:amount=0.3',
                'chorus=0.6:0.8:45:0.35:0.2:1.5',
                'extrastereo=m=1.8',
                'highpass=f=20',
                'lowpass=f=18000'
            ],
            speedUp: [
                'atempo=1.25',
                'equalizer=f=80:width_type=h:width=50:g=4',
                'equalizer=f=3000:width_type=h:width=1000:g=2'
            ],
            slowedReverb: [
                'atempo=0.85',
                'aecho=0.6:0.7:700:0.3',
                'equalizer=f=100:width_type=h:width=80:g=3',
                'equalizer=f=8000:width_type=h:width=2000:g=-1'
            ],
            bassBoost: [
                'equalizer=f=60:width_type=h:width=50:g=8',
                'equalizer=f=120:width_type=h:width=80:g=6',
                'equalizer=f=250:width_type=h:width=100:g=3'
            ],
            trebleBoost: [
                'equalizer=f=4000:width_type=h:width=1000:g=4',
                'equalizer=f=8000:width_type=h:width=2000:g=5',
                'equalizer=f=12000:width_type=h:width=3000:g=3'
            ],
            nightcore: [
                'atempo=1.3',
                'asetrate=48000*1.25',
                'aresample=48000',
                'equalizer=f=200:width_type=h:width=100:g=2',
                'equalizer=f=2000:width_type=h:width=500:g=1'
            ],
            lofi: [
                'highpass=f=40',
                'lowpass=f=6000',
                'equalizer=f=120:width_type=h:width=80:g=4',
                'aecho=0.4:0.5:200:0.1',
                'volume=0.9'
            ],
            electronic: [
                'equalizer=f=80:width_type=h:width=60:g=5',
                'equalizer=f=2000:width_type=h:width=800:g=3',
                'equalizer=f=8000:width_type=h:width=2000:g=2',
                'chorus=0.4:0.6:20:0.3:0.4:1.2'
            ],
            acoustic: [
                'equalizer=f=200:width_type=h:width=150:g=2',
                'equalizer=f=1000:width_type=h:width=300:g=1',
                'equalizer=f=3000:width_type=h:width=800:g=1',
                'volume=1.1'
            ],
            // NEW EFFECTS
            vaporwave: [
                'atempo=0.8',
                'aecho=0.5:0.6:800:0.35',
                'equalizer=f=80:width_type=h:width=60:g=4',
                'equalizer=f=4000:width_type=h:width=1500:g=-2',
                'chorus=0.3:0.4:30:0.25:0.2:1',
                'lowpass=f=12000'
            ],
            phonk: [
                'equalizer=f=40:width_type=h:width=30:g=10',
                'equalizer=f=80:width_type=h:width=50:g=8',
                'equalizer=f=150:width_type=h:width=80:g=5',
                'compand=0.01|0.01:0.2|0.2:-40/-10|-8/-8:8:0:-40:0.01',
                'equalizer=f=2500:width_type=h:width=1000:g=2',
                'volume=0.85'
            ],
            concert: [
                'aecho=0.7:0.8:1000:0.4',
                'aecho=0.3:0.4:500:0.2',
                'equalizer=f=100:width_type=h:width=80:g=2',
                'equalizer=f=2000:width_type=h:width=600:g=1',
                'stereotools=mlev=0.9:slev=1.2',
                'volume=0.9'
            ],
            intimate: [
                'highpass=f=80',
                'lowpass=f=12000',
                'equalizer=f=200:width_type=h:width=100:g=3',
                'equalizer=f=3000:width_type=h:width=800:g=2',
                'compand=0.1|0.1:1|1:-30/-15|-15/-5|-5/-5:3:0:-30:0.1',
                'volume=1.05'
            ],
            radio: [
                'highpass=f=100',
                'lowpass=f=8000',
                'compand=0.02|0.02:0.3|0.3:-30/-10|-10/-5|-5/-5:5:0:-30:0.05',
                'equalizer=f=3000:width_type=h:width=1000:g=3',
                'volume=0.95'
            ],
            '8d': [
                'apulsator=hz=0.08:amount=0.5',
                'extrastereo=m=2.5',
                'chorus=0.5:0.7:40:0.3:0.2:1.5',
                'highpass=f=25',
                'lowpass=f=16000'
            ],
            karaoke: [
                'pan=mono|c0=0.5*c0+-0.5*c1',
                'aecho=0.5:0.6:400:0.2',
                'equalizer=f=300:width_type=h:width=200:g=2'
            ]
        };
    }

    /**
     * Main effects application method with advanced error handling
     */
    async applyEffects(inputStream, options = {}) {
        const startTime = Date.now();
        let outputStream = null;

        try {
            // Validate input stream
            if (!inputStream || typeof inputStream.pipe !== 'function') {
                console.warn('[AUDIO EFFECTS] Invalid input stream, returning passthrough');
                return this.createPassthroughStream();
            }

            // Check processing limits
            if (this.activeProcesses >= this.maxConcurrentProcesses) {
                console.log('[AUDIO EFFECTS] Processing limit reached, using passthrough');
                this.processingStats.errors++;
                return this.createPassthroughStream(inputStream);
            }

            const {
                effect = null,
                bass = 0,
                treble = 0,
                volume = 1.0,
                normalize = false,
                compressor = false
            } = options;

            // Return original stream if no effects needed
            if (!this.hasEffects(options)) {
                return inputStream;
            }

            // Generate cache key
            const cacheKey = this.generateCacheKey(options);

            // Check processing queue
            if (this.processingQueue.has(cacheKey)) {
                console.log('[AUDIO EFFECTS] Effect already processing, waiting...');
                return await this.processingQueue.get(cacheKey);
            }

            // Create processing promise
            const processingPromise = this.processAudioStreamAdvanced(inputStream, options);
            this.processingQueue.set(cacheKey, processingPromise);

            outputStream = await processingPromise;

            // Clean up
            this.processingQueue.delete(cacheKey);

            const processingTime = Date.now() - startTime;
            console.log(`[AUDIO EFFECTS] Processing completed in ${processingTime}ms`);

            this.processingStats.success++;
            this.emit('effectApplied', { options, processingTime });

            return outputStream;

        } catch (error) {
            this.processingStats.errors++;
            console.error('[AUDIO EFFECTS] Effect application error:', error);

            // Always return a working stream
            return this.createPassthroughStream(inputStream);
        }
    }

    /**
     * Advanced audio stream processing with better stability
     */
    async processAudioStreamAdvanced(inputStream, options) {
        return new Promise((resolve, reject) => {
            this.activeProcesses++;

            const cleanup = () => {
                this.activeProcesses--;
            };

            // Create stable output stream
            const outputStream = new PassThrough({
                highWaterMark: this.streamConfig.bufferSize
            });

            // Timeout handler
            const timeoutId = setTimeout(() => {
                console.warn('[AUDIO EFFECTS] Processing timeout, using passthrough');
                cleanup();
                resolve(this.createPassthroughStream(inputStream));
            }, this.streamConfig.timeout);

            try {
                // Build optimized filter chain
                const filters = this.buildOptimizedFilterChain(options);

                if (filters.length === 0) {
                    clearTimeout(timeoutId);
                    cleanup();
                    resolve(inputStream);
                    return;
                }

                console.log('[AUDIO EFFECTS] Applying filters:', filters);

                // Create FFmpeg command with enhanced stability and simplified approach
                const command = ffmpeg()
                    .input(inputStream)
                    .inputFormat(this.streamConfig.inputFormat)
                    .audioCodec(this.streamConfig.audioCodec)
                    .audioChannels(this.streamConfig.channels)
                    .audioFrequency(this.streamConfig.sampleRate)
                    .audioBitrate(this.streamConfig.bitrate)
                    .format(this.streamConfig.outputFormat)
                    .addOption('-avoid_negative_ts', 'make_zero')
                    .addOption('-fflags', '+genpts')
                    .addOption('-bufsize', '256k')
                    .addOption('-thread_queue_size', '256');

                // Apply filters using audioFilters for better compatibility
                if (filters.length > 0) {
                    // Join filters with comma - this is the correct way for audioFilters
                    command.audioFilters(filters.join(','));
                }

                // Enhanced error handling
                command
                    .on('start', (cmd) => {
                        console.log('[AUDIO EFFECTS] FFmpeg started:', cmd.substring(0, 200) + '...');
                    })
                    .on('stderr', (stderrLine) => {
                        // Only log significant errors, not normal processing output
                        if (stderrLine.includes('Error') || stderrLine.includes('Failed')) {
                            console.warn('[AUDIO EFFECTS] FFmpeg stderr:', stderrLine);
                        }
                    })
                    .on('error', (error) => {
                        clearTimeout(timeoutId);
                        console.error('[AUDIO EFFECTS] FFmpeg processing error:', error.message);
                        cleanup();

                        // Provide fallback stream
                        resolve(this.createPassthroughStream(inputStream));
                    })
                    .on('end', () => {
                        clearTimeout(timeoutId);
                        cleanup();
                        console.log('[AUDIO EFFECTS] FFmpeg processing completed successfully');
                    });

                // Pipe to output stream with error handling
                const ffmpegStream = command.pipe();

                ffmpegStream.on('error', (error) => {
                    console.error('[AUDIO EFFECTS] Output stream error:', error);
                    outputStream.emit('error', error);
                });

                ffmpegStream.on('data', (chunk) => {
                    outputStream.write(chunk);
                });

                ffmpegStream.on('end', () => {
                    outputStream.end();
                });

                resolve(outputStream);

            } catch (error) {
                clearTimeout(timeoutId);
                cleanup();
                console.error('[AUDIO EFFECTS] Stream processing setup error:', error);
                resolve(this.createPassthroughStream(inputStream));
            }
        });
    }

    /**
     * Build optimized filter chain with proper sequencing
     */
    buildOptimizedFilterChain(options) {
        const {
            effect,
            bass,
            treble,
            volume,
            normalize,
            compressor
        } = options;

        let filters = [];

        // Apply preset effect first (most important)
        if (effect && this.filterTemplates[effect]) {
            filters = [...this.filterTemplates[effect]];
        }

        // Add custom EQ adjustments
        if (bass !== 0) {
            const bassGain = Math.max(-15, Math.min(bass * 2.5, 15));
            filters.push(`equalizer=f=80:width_type=h:width=60:g=${bassGain}`);
        }

        if (treble !== 0) {
            const trebleGain = Math.max(-15, Math.min(treble * 2.5, 15));
            filters.push(`equalizer=f=6000:width_type=h:width=2000:g=${trebleGain}`);
        }

        // Apply compressor before volume (proper audio chain order)
        if (compressor) {
            filters.push('compand=0.1|0.1:1|1:-45/-15|-15/-5|-5/-5:5:0:-45:0.1');
        }

        // Apply normalization before final volume
        if (normalize) {
            filters.push('loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=-16:measured_LRA=11:measured_TP=-1.5:measured_thresh=-26.12:offset=0.0');
        }

        // Apply volume adjustment last
        if (volume !== 1.0) {
            const volumeLevel = Math.max(0.1, Math.min(volume, 2.5));
            filters.push(`volume=${volumeLevel}`);
        }

        return filters;
    }

    /**
     * Create passthrough stream for fallback
     */
    createPassthroughStream(inputStream = null) {
        const passthrough = new PassThrough({
            highWaterMark: this.streamConfig.bufferSize
        });

        if (inputStream) {
            inputStream.pipe(passthrough);
        }

        return passthrough;
    }

    /**
     * Check if any effects need to be applied
     */
    hasEffects(options) {
        const {
            effect,
            bass = 0,
            treble = 0,
            volume = 1.0,
            normalize = false,
            compressor = false
        } = options;

        return effect !== null ||
            bass !== 0 ||
            treble !== 0 ||
            volume !== 1.0 ||
            normalize ||
            compressor;
    }

    /**
     * Enhanced 3D Spatial Audio with room simulation
     */
    apply3DSpatialSound(inputStream, intensity = 'medium') {
        const intensityMap = {
            low: {
                pulsator: 'apulsator=hz=0.08:amount=0.2',
                chorus: 'chorus=0.5:0.7:35:0.25:0.15:1.2',
                stereo: 'extrastereo=m=1.3'
            },
            medium: {
                pulsator: 'apulsator=hz=0.1:amount=0.3',
                chorus: 'chorus=0.6:0.8:45:0.35:0.2:1.5',
                stereo: 'extrastereo=m=1.8'
            },
            high: {
                pulsator: 'apulsator=hz=0.125:amount=0.4',
                chorus: 'chorus=0.7:0.9:55:0.4:0.25:2.0',
                stereo: 'extrastereo=m=2.2'
            }
        };

        const config = intensityMap[intensity] || intensityMap.medium;

        const options = {
            effect: null,
            customFilters: [
                config.pulsator,
                config.chorus,
                config.stereo,
                'highpass=f=20',
                'lowpass=f=18000'
            ]
        };

        return this.applyCustomFilters(inputStream, options.customFilters);
    }

    /**
     * Perfect Slowed + Reverb effect (fixed double sound issue)
     */
    applySlowedReverb(inputStream, slowFactor = 0.85, reverbIntensity = 'medium') {
        const reverbConfigs = {
            light: {
                echo: 'aecho=0.4:0.5:500:0.2',
                bass: 2,
                treble: -0.5
            },
            medium: {
                echo: 'aecho=0.6:0.7:700:0.3',
                bass: 3,
                treble: -1
            },
            heavy: {
                echo: 'aecho=0.7:0.8:900:0.4',
                bass: 4,
                treble: -1.5
            }
        };

        const reverbConfig = reverbConfigs[reverbIntensity] || reverbConfigs.medium;
        const clampedSlowFactor = Math.max(0.5, Math.min(slowFactor, 1.0));

        const filters = [
            `atempo=${clampedSlowFactor}`,
            reverbConfig.echo,
            `equalizer=f=100:width_type=h:width=80:g=${reverbConfig.bass}`,
            `equalizer=f=8000:width_type=h:width=2000:g=${reverbConfig.treble}`
        ];

        return this.applyCustomFilters(inputStream, filters);
    }

    /**
     * Enhanced Nightcore effect
     */
    applyNightcore(inputStream, intensity = 'medium') {
        const intensityConfigs = {
            light: { tempo: 1.15, pitch: 1.1 },
            medium: { tempo: 1.3, pitch: 1.25 },
            extreme: { tempo: 1.5, pitch: 1.4 }
        };

        const config = intensityConfigs[intensity] || intensityConfigs.medium;

        const filters = [
            `atempo=${config.tempo}`,
            `asetrate=48000*${config.pitch}`,
            'aresample=48000',
            'equalizer=f=200:width_type=h:width=100:g=2',
            'equalizer=f=2000:width_type=h:width=500:g=1',
            'volume=0.9'
        ];

        return this.applyCustomFilters(inputStream, filters);
    }

    /**
     * Professional Lo-Fi Hip Hop effect
     */
    applyLofi(inputStream, warmth = 'medium') {
        const warmthConfigs = {
            light: {
                highpass: 60,
                lowpass: 8000,
                bass: 2,
                echo: 'aecho=0.3:0.4:150:0.08'
            },
            medium: {
                highpass: 40,
                lowpass: 6000,
                bass: 4,
                echo: 'aecho=0.4:0.5:200:0.1'
            },
            warm: {
                highpass: 30,
                lowpass: 5000,
                bass: 6,
                echo: 'aecho=0.5:0.6:250:0.12'
            }
        };

        const config = warmthConfigs[warmth] || warmthConfigs.medium;

        const filters = [
            `highpass=f=${config.highpass}`,
            `lowpass=f=${config.lowpass}`,
            `equalizer=f=120:width_type=h:width=80:g=${config.bass}`,
            config.echo,
            'volume=0.85'
        ];

        return this.applyCustomFilters(inputStream, filters);
    }

    /**
     * Advanced Bass Boost with frequency targeting
     */
    applyAdvancedBassBoost(inputStream, level = 5, frequency = 'sub') {
        const frequencyConfigs = {
            sub: [
                { freq: 40, gain: level * 0.8 },
                { freq: 80, gain: level },
                { freq: 160, gain: level * 0.6 }
            ],
            mid: [
                { freq: 80, gain: level * 0.6 },
                { freq: 160, gain: level },
                { freq: 320, gain: level * 0.8 }
            ],
            punch: [
                { freq: 60, gain: level * 0.7 },
                { freq: 120, gain: level },
                { freq: 250, gain: level * 0.9 }
            ]
        };

        const config = frequencyConfigs[frequency] || frequencyConfigs.sub;
        const clampedLevel = Math.max(1, Math.min(level, 10));

        const filters = config.map(band =>
            `equalizer=f=${band.freq}:width_type=h:width=${band.freq * 0.5}:g=${Math.min(band.gain * 2, 15)}`
        );

        return this.applyCustomFilters(inputStream, filters);
    }

    /**
     * Apply custom filter array with enhanced error handling
     */
    async applyCustomFilters(inputStream, filters) {
        if (!Array.isArray(filters) || filters.length === 0) {
            return inputStream;
        }

        return this.applyEffects(inputStream, { customFilters: filters });
    }

    /**
     * Real-time EQ with smooth transitions
     */
    createSmoothEqualizer(bassLevel, midLevel, trebleLevel) {
        const filters = [];

        // Sub bass (20-80 Hz)
        if (bassLevel !== 0) {
            const gain = Math.max(-12, Math.min(bassLevel * 2, 12));
            filters.push(`equalizer=f=60:width_type=h:width=40:g=${gain}`);
        }

        // Mid bass (80-250 Hz)
        if (bassLevel !== 0) {
            const gain = Math.max(-8, Math.min(bassLevel * 1.5, 8));
            filters.push(`equalizer=f=160:width_type=h:width=80:g=${gain}`);
        }

        // Mid frequencies (250-4000 Hz)
        if (midLevel !== 0) {
            const gain = Math.max(-10, Math.min(midLevel * 2, 10));
            filters.push(`equalizer=f=1000:width_type=h:width=500:g=${gain}`);
        }

        // High mids (4-8 kHz)
        if (trebleLevel !== 0) {
            const gain = Math.max(-10, Math.min(trebleLevel * 1.8, 10));
            filters.push(`equalizer=f=6000:width_type=h:width=2000:g=${gain}`);
        }

        // High frequencies (8-20 kHz)
        if (trebleLevel !== 0) {
            const gain = Math.max(-8, Math.min(trebleLevel * 1.5, 8));
            filters.push(`equalizer=f=12000:width_type=h:width=4000:g=${gain}`);
        }

        return filters;
    }

    /**
     * Enhanced karaoke effect with vocal isolation options
     */
    createAdvancedKaraokeEffect(mode = 'vocal_remove') {
        const modes = {
            vocal_remove: [
                'pan=mono|c0=0.5*c0+-0.5*c1',
                'aecho=0.5:0.6:400:0.2',
                'equalizer=f=300:width_type=h:width=200:g=2'
            ],
            vocal_isolate: [
                'pan=mono|c0=0.5*c0+0.5*c1',
                'equalizer=f=1000:width_type=h:width=2000:g=3',
                'compand=0.02|0.02:0.3|0.3:-30/-10|-10/-10:5'
            ],
            center_cut: [
                'extrastereo=m=-1',
                'pan=stereo|c0=c0|c1=c1',
                'volume=1.2'
            ]
        };

        return modes[mode] || modes.vocal_remove;
    }

    /**
     * Get comprehensive effect statistics
     */
    getDetailedStats() {
        const memoryUsage = process.memoryUsage();

        return {
            processing: {
                active: this.activeProcesses,
                maxConcurrent: this.maxConcurrentProcesses,
                queueSize: this.processingQueue.size
            },
            cache: {
                size: this.effectsCache.size,
                maxSize: this.maxCacheSize,
                hitRate: this.processingStats.cacheHits + this.processingStats.cacheMisses > 0
                    ? ((this.processingStats.cacheHits / (this.processingStats.cacheHits + this.processingStats.cacheMisses)) * 100).toFixed(2) + '%'
                    : '0%'
            },
            performance: {
                successRate: this.processingStats.success + this.processingStats.errors > 0
                    ? ((this.processingStats.success / (this.processingStats.success + this.processingStats.errors)) * 100).toFixed(2) + '%'
                    : '0%',
                totalProcessed: this.processingStats.success + this.processingStats.errors,
                errors: this.processingStats.errors
            },
            memory: {
                rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
                heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
                external: Math.round(memoryUsage.external / 1024 / 1024) + 'MB'
            },
            availableEffects: Object.keys(this.filterTemplates).length
        };
    }

    /**
     * Get all available effects with descriptions
     */
    getAvailableEffects() {
        return [
            {
                id: 'spatial3D',
                name: '3D Spatial Sound',
                description: 'Immersive 3D spatial audio with room simulation',
                parameters: ['intensity: low|medium|high']
            },
            {
                id: 'speedUp',
                name: 'Sped Up & Fast Beats',
                description: 'Energetic fast version with enhanced clarity',
                parameters: []
            },
            {
                id: 'slowedReverb',
                name: 'Slowed & Reverb',
                description: 'Perfect slowed version with atmospheric reverb',
                parameters: ['slowFactor: 0.5-1.0', 'reverbIntensity: light|medium|heavy']
            },
            {
                id: 'bassBoost',
                name: 'Advanced Bass Boost',
                description: 'Frequency-targeted bass enhancement',
                parameters: ['level: 1-10', 'frequency: sub|mid|punch']
            },
            {
                id: 'trebleBoost',
                name: 'Crystal Treble Boost',
                description: 'Enhanced high-frequency clarity',
                parameters: ['level: 1-5']
            },
            {
                id: 'nightcore',
                name: 'Enhanced Nightcore',
                description: 'High-energy anime-style enhancement',
                parameters: ['intensity: light|medium|extreme']
            },
            {
                id: 'lofi',
                name: 'Professional Lo-Fi',
                description: 'Warm, nostalgic lo-fi hip hop sound',
                parameters: ['warmth: light|medium|warm']
            },
            {
                id: 'electronic',
                name: 'Electronic Dance',
                description: 'EDM-optimized frequency response',
                parameters: []
            },
            {
                id: 'acoustic',
                name: 'Acoustic Enhancement',
                description: 'Natural instrument clarity boost',
                parameters: []
            }
        ];
    }

    /**
     * Apply preset effect with parameters
     */
    async applyPresetEffect(inputStream, presetName, parameters = {}) {
        switch (presetName) {
            case 'spatial3D':
                return this.apply3DSpatialSound(inputStream, parameters.intensity);
            case 'slowedReverb':
                return this.applySlowedReverb(inputStream, parameters.slowFactor, parameters.reverbIntensity);
            case 'nightcore':
                return this.applyNightcore(inputStream, parameters.intensity);
            case 'lofi':
                return this.applyLofi(inputStream, parameters.warmth);
            case 'bassBoost':
                return this.applyAdvancedBassBoost(inputStream, parameters.level, parameters.frequency);
            default:
                return this.applyEffects(inputStream, { effect: presetName });
        }
    }

    /**
     * Generate cache key
     */
    generateCacheKey(options) {
        const normalized = Object.keys(options)
            .sort()
            .map(key => `${key}:${JSON.stringify(options[key])}`)
            .join('|');
        return `fx_${Buffer.from(normalized).toString('base64').substring(0, 32)}`;
    }

    /**
     * Optimize cache performance
     */
    optimizeCache() {
        if (this.effectsCache.size > this.maxCacheSize * 0.8) {
            const entries = Array.from(this.effectsCache.entries());
            const sortedEntries = entries.sort((a, b) => a[1].lastUsed - b[1].lastUsed);

            // Remove oldest 25% of entries
            const removeCount = Math.floor(entries.length * 0.25);
            for (let i = 0; i < removeCount; i++) {
                this.effectsCache.delete(sortedEntries[i][0]);
            }

            console.log(`[AUDIO EFFECTS] Cache optimized: removed ${removeCount} old entries`);
        }
    }

    /**
     * Complete cleanup with memory optimization
     */
    cleanup() {
        // Clear all caches and queues
        this.effectsCache.clear();
        this.processingQueue.clear();
        this.streamPool.clear();

        // Reset counters
        this.activeProcesses = 0;
        this.processingStats = {
            success: 0,
            errors: 0,
            cacheHits: 0,
            cacheMisses: 0
        };

        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }

        console.log('[AUDIO EFFECTS] Complete cleanup performed');
    }

    /**
     * Health check for the audio effects system
     */
    healthCheck() {
        const stats = this.getDetailedStats();
        const issues = [];

        if (this.activeProcesses >= this.maxConcurrentProcesses) {
            issues.push('Processing at maximum capacity');
        }

        if (this.processingStats.errors > this.processingStats.success) {
            issues.push('High error rate detected');
        }

        if (this.effectsCache.size >= this.maxCacheSize) {
            issues.push('Cache at maximum capacity');
        }

        return {
            healthy: issues.length === 0,
            issues,
            stats,
            recommendations: issues.length > 0 ? [
                'Consider restarting the audio effects system',
                'Check FFmpeg installation and permissions',
                'Monitor system resources'
            ] : []
        };
    }
}

module.exports = AudioEffects;