const axios = require('axios');
const config = require('../config/config.js');
const SpotifyHelper = require('./spotifyHelper.js');

class RecommendationsHelper {
    constructor() {
        this.openaiClient = this.initializeOpenAI();
        this.geminiClient = this.initializeGemini();
        this.cache = new Map();
        this.cacheTimeout = 1800000; // 30 minutes

        // Enhanced rate limiting with exponential backoff
        this.rateLimiter = {
            openai: {
                requests: 0,
                resetTime: 0,
                lastRequest: 0,
                backoffDelay: 1000,
                maxBackoff: 300000 // 5 minutes
            },
            gemini: {
                requests: 0,
                resetTime: 0,
                lastRequest: 0,
                backoffDelay: 1000,
                maxBackoff: 300000
            }
        };

        // Circuit breaker pattern
        this.circuitBreaker = {
            openai: { failures: 0, isOpen: false, nextAttempt: 0 },
            gemini: { failures: 0, isOpen: false, nextAttempt: 0 }
        };
    }

    initializeOpenAI() {
        const apiKey = config.apis?.openai?.apiKey || config.openai?.apiKey;
        if (!apiKey || apiKey === 'undefined' || apiKey.length < 20) {
            console.error('[RECOMMENDATIONS] FATAL: OpenAI API key not properly configured or missing. OpenAI will be disabled.');
            return { apiKey: null, disabled: true }; // Add a disabled flag
        }

        return {
            apiKey: apiKey,
            baseURL: config.apis?.openai?.apiUrl || config.openai?.apiUrl || 'https://api.openai.com/v1',
            model: config.apis?.openai?.model || config.openai?.model || 'gpt-3.5-turbo',
            maxTokens: config.apis?.openai?.maxTokens || config.openai?.maxTokens || 150,
            temperature: config.apis?.openai?.temperature || config.openai?.temperature || 0.7
        };

    }

    initializeGemini() {
        const apiKey = config.apis?.gemini?.apiKey || config.gemini?.apiKey;

        // Validate API key
        if (!apiKey || apiKey === 'undefined' || apiKey.length < 20) {
            console.warn('[RECOMMENDATIONS] Gemini API key not properly configured');
            return { apiKey: null };
        }

        return {
            apiKey: apiKey,
            baseURL: config.apis?.gemini?.apiUrl || config.gemini?.apiUrl || 'https://generativelanguage.googleapis.com/v1beta',
            model: config.apis?.gemini?.model || config.gemini?.model || 'gemini-1.5-flash', // Updated model
            maxTokens: config.apis?.gemini?.maxTokens || config.gemini?.maxTokens || 150,
            temperature: config.apis?.gemini?.temperature || config.gemini?.temperature || 0.7
        };
    }

    /**
     * MAIN ENTRY POINT: Get AI-powered music recommendations with enhanced error handling
     */
    async getRecommendations(currentTrack, history = [], options = {}) {
        try {
            const {
                count = 5,
                genre = null,
                mood = null,
                energy = null,
                preferredProvider = 'openai',
                includeSpotifyData = true
            } = options;

            // Validate input
            if (!currentTrack || !currentTrack.title || !currentTrack.artist) {
                console.warn('[RECOMMENDATIONS] Invalid current track data');
                return this.getBasicFallbackRecommendations(currentTrack, history, options);
            }

            // Generate cache key
            const cacheKey = this.generateCacheKey(currentTrack, history, options);

            // Check cache first
            const cached = this.getFromCache(cacheKey);
            if (cached) {
                console.log('[RECOMMENDATIONS] Serving from cache');
                return cached;
            }

            let recommendations = [];

            // Try AI recommendations with proper error handling
            try {
                recommendations = await this.getAIRecommendationsWithFallback(
                    currentTrack,
                    history,
                    options
                );
            } catch (error) {
                console.error('[RECOMMENDATIONS] All AI providers failed:', error.message);
                recommendations = [];
            }

            // If AI fails completely, use enhanced fallback
            if (!recommendations || recommendations.length === 0) {
                console.log('[RECOMMENDATIONS] Using enhanced fallback due to AI failure');
                recommendations = await this.getEnhancedFallbackRecommendations(
                    currentTrack,
                    history,
                    options
                );
            }

            // Post-process and validate recommendations
            recommendations = await this.processRecommendations(recommendations, options);

            // Ensure we have at least some recommendations
            if (recommendations.length === 0) {
                console.log('[RECOMMENDATIONS] Using basic fallback as ultimate safety net');
                recommendations = this.getBasicFallbackRecommendations(currentTrack, history, options);
            }

            // Cache the results
            this.setCache(cacheKey, recommendations);

            return recommendations;

        } catch (error) {
            console.error('[RECOMMENDATIONS] Critical error in getRecommendations:', error);

            // Ultimate fallback - always return something
            return this.getBasicFallbackRecommendations(currentTrack, history, options);
        }
    }

    /**
     * FIXED: Get AI recommendations with intelligent provider switching and proper error handling
     */
    async getAIRecommendationsWithFallback(currentTrack, history, options) {
        const providers = [];

        // Only add providers that are properly configured
        if (this.openaiClient.apiKey) {
            providers.push('openai');
        }

        if (this.geminiClient.apiKey) {
            providers.push('gemini');
        }

        if (providers.length === 0) {
            throw new Error('No AI providers configured');
        }

        let lastError = null;

        for (const provider of providers) {
            try {
                // Check circuit breaker
                if (this.isCircuitOpen(provider)) {
                    console.log(`[RECOMMENDATIONS] Circuit breaker open for ${provider}`);
                    continue;
                }

                // Check rate limits with backoff
                if (!await this.checkRateLimitWithBackoff(provider)) {
                    console.log(`[RECOMMENDATIONS] Rate limit active for ${provider}`);
                    continue;
                }

                let recommendations;
                if (provider === 'openai') {
                    recommendations = await this.getOpenAIRecommendations(currentTrack, history, options);
                } else if (provider === 'gemini') {
                    recommendations = await this.getGeminiRecommendations(currentTrack, history, options);
                }

                // Validate recommendations
                if (recommendations && Array.isArray(recommendations) && recommendations.length > 0) {
                    // Success - reset circuit breaker
                    this.resetCircuitBreaker(provider);
                    console.log(`[RECOMMENDATIONS] Successfully got ${recommendations.length} recommendations from ${provider}`);
                    return recommendations;
                }

            } catch (error) {
                lastError = error;
                console.error(`[RECOMMENDATIONS] ${provider} failed:`, error.message);

                // Update circuit breaker for persistent failures
                if (error.message.includes('rate limit') || error.response?.status === 429) {
                    // Don't count rate limits as failures for circuit breaker
                    this.updateRateLimit(provider);
                } else {
                    this.recordFailure(provider);
                }

                // Continue to next provider
                continue;
            }
        }

        // All providers failed
        throw lastError || new Error('All AI providers failed');
    }

    /**
     * FIXED: OpenAI recommendations with better error handling and validation
     */
    async getOpenAIRecommendations(currentTrack, history, options) {
        if (!this.openaiClient.apiKey) {
            throw new Error('OpenAI API key not configured');
        }

        const prompt = this.buildOpenAIPrompt(currentTrack, history, options);

        try {
            console.log('[RECOMMENDATIONS] Requesting OpenAI recommendations...');

            const response = await axios.post(`${this.openaiClient.baseURL}/chat/completions`, {
                model: this.openaiClient.model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a music recommendation AI assistant. Provide song recommendations in JSON format with specific track and artist names that actually exist. Always respond with valid JSON containing a "recommendations" array.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: this.openaiClient.maxTokens,
                temperature: this.openaiClient.temperature,
                response_format: { type: 'json_object' }
            }, {
                headers: {
                    'Authorization': `Bearer ${this.openaiClient.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            this.updateRateLimit('openai');
            const recommendations = this.parseOpenAIResponse(response.data);

            if (!recommendations || recommendations.length === 0) {
                throw new Error('OpenAI returned empty recommendations');
            }

            return recommendations;

        } catch (error) {
            // Handle specific error codes
            if (error.response?.status === 429) {
                const retryAfter = error.response.headers['retry-after'] || 60;
                const limit = this.rateLimiter.openai;
                limit.backoffDelay = Math.min(retryAfter * 1000, limit.maxBackoff);
                throw new Error(`OpenAI rate limit exceeded. Backoff: ${limit.backoffDelay}ms`);
            } else if (error.response?.status === 401) {
                throw new Error('OpenAI API key invalid or expired');
            } else if (error.response?.status >= 500) {
                throw new Error(`OpenAI server error: ${error.response.status}`);
            } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                throw new Error('OpenAI API unreachable - network error');
            } else {
                throw new Error(`OpenAI request failed: ${error.message}`);
            }
        }
    }

    /**
     * COMPLETELY FIXED: Gemini recommendations implementation with proper error handling
     */
    async getGeminiRecommendations(currentTrack, history, options) {
        if (!this.geminiClient.apiKey) {
            throw new Error('Gemini API key not configured');
        }

        const prompt = this.buildGeminiPrompt(currentTrack, history, options);

        try {
            console.log('[RECOMMENDATIONS] Requesting Gemini recommendations...');

            const response = await axios.post(
                `${this.geminiClient.baseURL}/models/${this.geminiClient.model}:generateContent?key=${this.geminiClient.apiKey}`,
                {
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }],
                    generationConfig: {
                        temperature: this.geminiClient.temperature,
                        maxOutputTokens: this.geminiClient.maxTokens,
                        candidateCount: 1
                    }
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'DiscordBot/1.0'
                    },
                    timeout: 15000
                }
            );

            this.updateRateLimit('gemini');

            // Validate response structure
            if (!response.data || !response.data.candidates || response.data.candidates.length === 0) {
                throw new Error('Gemini returned invalid response structure');
            }

            const recommendations = this.parseGeminiResponse(response.data);

            if (!recommendations || recommendations.length === 0) {
                throw new Error('Gemini returned empty recommendations');
            }

            return recommendations;

        } catch (error) {
            // Handle specific error codes
            if (error.response?.status === 429) {
                const limit = this.rateLimiter.gemini;
                limit.backoffDelay = Math.min(limit.backoffDelay * 2, limit.maxBackoff);
                throw new Error(`Gemini rate limit exceeded. Backoff: ${limit.backoffDelay}ms`);
            } else if (error.response?.status === 403) {
                // Check if it's an API key issue or quota issue
                const errorData = error.response.data?.error;
                if (errorData?.message?.includes('API key')) {
                    throw new Error('Gemini API key invalid or not configured properly');
                } else if (errorData?.message?.includes('quota')) {
                    throw new Error('Gemini API quota exceeded');
                } else {
                    throw new Error('Gemini API access forbidden - check API key permissions');
                }
            } else if (error.response?.status === 400) {
                const errorData = error.response.data?.error;
                throw new Error(`Gemini API request invalid: ${errorData?.message || 'Bad request'}`);
            } else if (error.response?.status === 404) {
                throw new Error(`Gemini model not found - may need to enable API at console.cloud.google.com`);
            } else if (error.response?.status >= 500) {
                throw new Error(`Gemini server error: ${error.response.status}`);
            } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                throw new Error('Gemini API unreachable - network error');
            } else {
                throw new Error(`Gemini request failed: ${error.message}`);
            }
        }
    }

    /**
     * IMPROVED: Build Gemini prompt with better structure
     */
    buildGeminiPrompt(currentTrack, history, options) {
        const { count = 5, genre, mood, energy } = options;

        let prompt = `You are a music recommendation AI. Based on the current track and listening history, recommend ${count} similar songs that actually exist and are available on streaming platforms.\n\n`;

        prompt += `Current Track:\n`;
        prompt += `- Title: "${currentTrack.title}"\n`;
        prompt += `- Artist: "${currentTrack.artist}"\n`;
        if (currentTrack.genre) prompt += `- Genre: ${currentTrack.genre}\n`;

        if (history && history.length > 0) {
            prompt += `\nRecent Listening History (last ${Math.min(5, history.length)} tracks):\n`;
            history.slice(-5).forEach((track, index) => {
                if (track && track.title && track.artist) {
                    prompt += `${index + 1}. "${track.title}" by ${track.artist}\n`;
                }
            });
        }

        if (genre) prompt += `\nPreferred Genre: ${genre}\n`;
        if (mood) prompt += `Desired Mood: ${mood}\n`;
        if (energy) prompt += `Energy Level: ${energy}\n`;

        prompt += `\nIMPORTANT: Respond ONLY with a valid JSON object in this exact format:\n`;
        prompt += `{\n`;
        prompt += `  "recommendations": [\n`;
        prompt += `    {\n`;
        prompt += `      "title": "exact song title",\n`;
        prompt += `      "artist": "exact artist name",\n`;
        prompt += `      "reason": "brief explanation",\n`;
        prompt += `      "similarity": 0.8\n`;
        prompt += `    }\n`;
        prompt += `  ]\n`;
        prompt += `}\n\n`;
        prompt += `Do not include any text outside the JSON object. Only recommend real songs that exist on major streaming platforms.`;

        return prompt;
    }

    /**
     * IMPROVED: Parse Gemini response with better error handling
     */
    parseGeminiResponse(response) {
        try {
            if (!response.candidates || response.candidates.length === 0) {
                throw new Error('No candidates in Gemini response');
            }

            const candidate = response.candidates[0];
            if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
                throw new Error('No content in Gemini candidate');
            }

            let content = candidate.content.parts[0].text;
            if (!content) {
                throw new Error('Empty content from Gemini');
            }

            // Clean up the response text (Gemini sometimes includes markdown formatting)
            content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

            // Try to find JSON within the response if it's wrapped in other text
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                content = jsonMatch[0];
            }

            const parsed = JSON.parse(content);

            if (!parsed.recommendations || !Array.isArray(parsed.recommendations)) {
                throw new Error('Invalid recommendations format from Gemini');
            }

            return parsed.recommendations.filter(rec => rec && rec.title && rec.artist);

        } catch (error) {
            console.error('[RECOMMENDATIONS] Error parsing Gemini response:', error);
            console.error('[RECOMMENDATIONS] Raw response:', JSON.stringify(response, null, 2));
            return [];
        }
    }

    /**
     * IMPROVED: Enhanced rate limit checking with exponential backoff
     */
    async checkRateLimitWithBackoff(provider) {
        const limit = this.rateLimiter[provider];
        const now = Date.now();

        // Check if we're in backoff period
        if (now - limit.lastRequest < limit.backoffDelay) {
            console.log(`[RECOMMENDATIONS] ${provider} in backoff period (${limit.backoffDelay}ms remaining)`);
            return false;
        }

        // Reset window if needed (1 minute windows)
        if (now > limit.resetTime) {
            limit.requests = 0;
            limit.resetTime = now + 60000; // 1 minute window
            // Don't reset backoff here, let successful requests reset it
        }

        // Check request limit (conservative limits)
        const maxRequests = provider === 'openai' ? 3 : 10; // More generous for Gemini
        if (limit.requests >= maxRequests) {
            // Apply exponential backoff
            limit.backoffDelay = Math.min(limit.backoffDelay * 1.5, limit.maxBackoff);
            console.log(`[RECOMMENDATIONS] ${provider} rate limited, backoff: ${limit.backoffDelay}ms`);
            return false;
        }

        return true;
    }

    /**
     * Update rate limit tracking and reset backoff on success
     */
    updateRateLimit(provider) {
        const limit = this.rateLimiter[provider];
        limit.requests++;
        limit.lastRequest = Date.now();

        // Reset backoff on successful request
        if (limit.backoffDelay > 1000) {
            limit.backoffDelay = Math.max(1000, limit.backoffDelay * 0.5);
        }
    }

    /**
     * Circuit breaker methods - unchanged but improved logging
     */
    isCircuitOpen(provider) {
        const breaker = this.circuitBreaker[provider];
        const now = Date.now();

        if (breaker.isOpen && now > breaker.nextAttempt) {
            breaker.isOpen = false;
            breaker.failures = 0;
            console.log(`[RECOMMENDATIONS] Circuit breaker reset for ${provider}`);
        }

        return breaker.isOpen;
    }

    recordFailure(provider) {
        const breaker = this.circuitBreaker[provider];
        breaker.failures++;

        // Open circuit after 3 failures
        if (breaker.failures >= 3) {
            breaker.isOpen = true;
            breaker.nextAttempt = Date.now() + 300000; // 5 minutes
            console.log(`[RECOMMENDATIONS] Circuit breaker opened for ${provider} after ${breaker.failures} failures`);
        }
    }

    resetCircuitBreaker(provider) {
        const breaker = this.circuitBreaker[provider];
        breaker.failures = 0;
        breaker.isOpen = false;
        breaker.nextAttempt = 0;
    }

    buildOpenAIPrompt(currentTrack, history, options) {
        const { count = 5, genre, mood, energy } = options;

        let prompt = `Based on the current track and listening history, recommend ${count} similar songs that actually exist on streaming platforms.\n\n`;

        prompt += `Current Track:\n`;
        prompt += `- Title: "${currentTrack.title}"\n`;
        prompt += `- Artist: "${currentTrack.artist}"\n`;
        if (currentTrack.genre) prompt += `- Genre: ${currentTrack.genre}\n`;

        if (history && history.length > 0) {
            prompt += `\nRecent Listening History:\n`;
            history.slice(-5).forEach((track, index) => {
                if (track && track.title && track.artist) {
                    prompt += `${index + 1}. "${track.title}" by ${track.artist}\n`;
                }
            });
        }

        if (genre) prompt += `\nPreferred Genre: ${genre}\n`;
        if (mood) prompt += `Desired Mood: ${mood}\n`;
        if (energy) prompt += `Energy Level: ${energy}\n`;

        prompt += `\nRespond with a JSON object containing an array of recommendations. Each recommendation should have:\n`;
        prompt += `- "title": exact song title\n`;
        prompt += `- "artist": exact artist name\n`;
        prompt += `- "reason": brief explanation for the recommendation\n`;
        prompt += `- "similarity": similarity score (0-1)\n`;
        prompt += `\nFormat: {"recommendations": [...]}\n`;
        prompt += `Only recommend songs that actually exist and are available on major streaming platforms.`;

        return prompt;
    }

    parseOpenAIResponse(response) {
        try {
            if (!response.choices || response.choices.length === 0) {
                throw new Error('No choices in OpenAI response');
            }

            const content = response.choices[0].message?.content;
            if (!content) {
                throw new Error('No content in OpenAI response');
            }

            const parsed = JSON.parse(content);

            if (!parsed.recommendations || !Array.isArray(parsed.recommendations)) {
                throw new Error('Invalid recommendations format from OpenAI');
            }

            return parsed.recommendations.filter(rec => rec && rec.title && rec.artist);

        } catch (error) {
            console.error('[RECOMMENDATIONS] Error parsing OpenAI response:', error);
            console.error('[RECOMMENDATIONS] Raw response:', JSON.stringify(response, null, 2));
            return [];
        }
    }

    // Rest of the methods remain largely the same but with improved error handling...
    // [Including all the fallback methods, caching, utility functions etc.]

    /**
     * Enhanced fallback recommendations using multiple strategies
     */
    async getEnhancedFallbackRecommendations(currentTrack, history, options) {
        const { count = 5 } = options;
        let recommendations = [];

        try {
            console.log('[RECOMMENDATIONS] Using enhanced fallback strategies');

            // Strategy 1: Artist-based recommendations from history
            if (history && history.length > 0) {
                const artistRecs = this.getArtistBasedRecommendations(currentTrack, history, Math.min(count, 2));
                recommendations.push(...artistRecs);
            }

            // Strategy 2: Genre-based recommendations
            if (recommendations.length < count && currentTrack.genre) {
                const genreRecs = this.getGenreBasedRecommendations(currentTrack.genre, count - recommendations.length);
                recommendations.push(...genreRecs);
            }

            // Strategy 3: Popular tracks from same era/style
            if (recommendations.length < count) {
                const popularRecs = this.getPopularRecommendations(currentTrack, count - recommendations.length);
                recommendations.push(...popularRecs);
            }

            // Strategy 4: Random from predefined quality tracks
            if (recommendations.length < count) {
                const randomRecs = this.getQualityRandomRecommendations(count - recommendations.length);
                recommendations.push(...randomRecs);
            }

            return recommendations.slice(0, count);

        } catch (error) {
            console.error('[RECOMMENDATIONS] Enhanced fallback error:', error);
            return this.getBasicFallbackRecommendations(currentTrack, history, options);
        }
    }

    /**
     * Artist-based recommendations from listening history
     */
    getArtistBasedRecommendations(currentTrack, history, maxCount) {
        const recommendations = [];
        const seenTracks = new Set();

        // Add current track to seen set
        if (currentTrack && currentTrack.artist && currentTrack.title) {
            seenTracks.add(`${currentTrack.artist}:${currentTrack.title}`.toLowerCase());
        }

        // Find tracks by same artist
        const sameArtistTracks = history.filter(track =>
            track && track.artist && track.title &&
            track.artist.toLowerCase() === currentTrack.artist.toLowerCase() &&
            !seenTracks.has(`${track.artist}:${track.title}`.toLowerCase())
        );

        // Add same artist tracks
        sameArtistTracks.slice(0, Math.min(2, maxCount)).forEach(track => {
            const key = `${track.artist}:${track.title}`.toLowerCase();
            if (!seenTracks.has(key)) {
                recommendations.push({
                    title: track.title,
                    artist: track.artist,
                    query: `${track.artist} ${track.title}`,
                    reason: `Same artist as current track`,
                    similarity: 0.9,
                    source: 'artist_history'
                });
                seenTracks.add(key);
            }
        });

        return recommendations;
    }

    /**
     * Get popular recommendations based on current track characteristics
     */
    getPopularRecommendations(currentTrack, count) {
        // Curated popular tracks by category
        const popularTracks = {
            upbeat: [
                { artist: 'Dua Lipa', title: 'Levitating' },
                { artist: 'The Weeknd', title: 'Blinding Lights' },
                { artist: 'Harry Styles', title: 'As It Was' },
                { artist: 'Olivia Rodrigo', title: 'good 4 u' },
                { artist: 'Doja Cat', title: 'Kiss Me More' }
            ],
            chill: [
                { artist: 'Billie Eilish', title: 'lovely' },
                { artist: 'Lorde', title: 'Solar Power' },
                { artist: 'Rex Orange County', title: 'Pluto Projector' },
                { artist: 'Mac Miller', title: 'Self Care' },
                { artist: 'Frank Ocean', title: 'Pink + White' }
            ],
            rock: [
                { artist: 'Imagine Dragons', title: 'Enemy' },
                { artist: 'Coldplay', title: 'Higher Power' },
                { artist: 'Arctic Monkeys', title: 'Do I Wanna Know?' },
                { artist: 'The 1975', title: 'Somebody Else' },
                { artist: 'Twenty One Pilots', title: 'Stressed Out' }
            ],
            indie: [
                { artist: 'Tame Impala', title: 'The Less I Know The Better' },
                { artist: 'Glass Animals', title: 'Heat Waves' },
                { artist: 'Clairo', title: 'Pretty Girl' },
                { artist: 'Boy Pablo', title: 'Everytime' },
                { artist: 'Still Woozy', title: 'Goodie Bag' }
            ]
        };

        // Determine category based on current track
        let category = 'upbeat'; // default

        if (currentTrack && currentTrack.artist) {
            const artist = currentTrack.artist.toLowerCase();
            if (artist.includes('billie') || artist.includes('lorde') || artist.includes('frank')) {
                category = 'chill';
            } else if (artist.includes('coldplay') || artist.includes('imagine') || artist.includes('arctic')) {
                category = 'rock';
            } else if (artist.includes('tame') || artist.includes('glass') || artist.includes('clairo')) {
                category = 'indie';
            }
        }

        const tracks = popularTracks[category] || popularTracks.upbeat;

        return this.shuffleArray([...tracks])
            .slice(0, count)
            .map(track => ({
                title: track.title,
                artist: track.artist,
                query: `${track.artist} ${track.title}`,
                reason: `Popular ${category} track`,
                similarity: 0.7,
                source: 'popular_recommendation'
            }));
    }

    /**
     * Get quality random recommendations as last resort
     */
    getQualityRandomRecommendations(count) {
        const qualityTracks = [
            { artist: 'Taylor Swift', title: 'Anti-Hero' },
            { artist: 'Bad Bunny', title: 'Me Porto Bonito' },
            { artist: 'Lizzo', title: 'About Damn Time' },
            { artist: 'Post Malone', title: 'Circles' },
            { artist: 'Ariana Grande', title: 'positions' },
            { artist: 'Ed Sheeran', title: 'Perfect' },
            { artist: 'Drake', title: 'God\'s Plan' },
            { artist: 'SZA', title: 'Good Days' },
            { artist: 'The Kid LAROI', title: 'STAY' },
            { artist: 'Lil Nas X', title: 'MONTERO' }
        ];

        return this.shuffleArray([...qualityTracks])
            .slice(0, count)
            .map(track => ({
                title: track.title,
                artist: track.artist,
                query: `${track.artist} ${track.title}`,
                reason: 'High-quality popular track',
                similarity: 0.6,
                source: 'quality_random'
            }));
    }

    /**
     * Basic fallback as ultimate safety net
     */
    getBasicFallbackRecommendations(currentTrack, history, options) {
        const { count = 5 } = options;

        console.log('[RECOMMENDATIONS] Using basic fallback recommendations');

        return [
            { title: 'Blinding Lights', artist: 'The Weeknd', query: 'The Weeknd Blinding Lights', reason: 'Popular recommendation', similarity: 0.7, source: 'basic_fallback' },
            { title: 'Levitating', artist: 'Dua Lipa', query: 'Dua Lipa Levitating', reason: 'Popular recommendation', similarity: 0.7, source: 'basic_fallback' },
            { title: 'As It Was', artist: 'Harry Styles', query: 'Harry Styles As It Was', reason: 'Popular recommendation', similarity: 0.7, source: 'basic_fallback' },
            { title: 'Heat Waves', artist: 'Glass Animals', query: 'Glass Animals Heat Waves', reason: 'Popular recommendation', similarity: 0.7, source: 'basic_fallback' },
            { title: 'Stay', artist: 'The Kid LAROI', query: 'The Kid LAROI Stay', reason: 'Popular recommendation', similarity: 0.7, source: 'basic_fallback' }
        ].slice(0, count);
    }

    /**
     * Utility function to shuffle array
     */
    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    /**
     * Process and validate recommendations
     */
    async processRecommendations(recommendations, options) {
        if (!Array.isArray(recommendations)) {
            console.warn('[RECOMMENDATIONS] Invalid recommendations format - not array');
            return [];
        }

        const processed = [];

        for (const rec of recommendations.slice(0, options.count || 5)) {
            try {
                if (!rec || typeof rec !== 'object') {
                    console.warn('[RECOMMENDATIONS] Skipping invalid recommendation object');
                    continue;
                }

                if (!rec.title || !rec.artist || typeof rec.title !== 'string' || typeof rec.artist !== 'string') {
                    console.warn('[RECOMMENDATIONS] Skipping recommendation with missing title/artist');
                    continue;
                }

                const query = `${rec.artist.trim()} ${rec.title.trim()}`;

                processed.push({
                    title: rec.title.trim(),
                    artist: rec.artist.trim(),
                    query: query,
                    reason: rec.reason || 'AI recommended based on your listening patterns',
                    similarity: typeof rec.similarity === 'number' ? rec.similarity : 0.8,
                    source: rec.source || 'ai_recommendation'
                });

            } catch (error) {
                console.warn('[RECOMMENDATIONS] Error processing recommendation:', error);
                continue;
            }
        }

        return processed;
    }

    /**
     * Generate cache key for recommendations
     */
    generateCacheKey(currentTrack, history, options) {
        try {
            const trackKey = currentTrack ? `${currentTrack.artist || 'unknown'}-${currentTrack.title || 'unknown'}` : 'no-track';
            const historyKey = history && history.length > 0
                ? history.slice(-3).map(t => t && t.artist && t.title ? `${t.artist}-${t.title}` : 'unknown').join(',')
                : 'no-history';
            const optionsKey = JSON.stringify({
                count: options.count || 5,
                genre: options.genre || null,
                mood: options.mood || null,
                energy: options.energy || null
            });

            return `rec_${trackKey}_${historyKey}_${optionsKey}`.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 200);
        } catch (error) {
            console.warn('[RECOMMENDATIONS] Error generating cache key:', error);
            return `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
    }

    /**
     * Get recommendations from cache
     */
    getFromCache(key) {
        try {
            const cached = this.cache.get(key);
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }

            if (cached) {
                this.cache.delete(key);
            }
            return null;
        } catch (error) {
            console.warn('[RECOMMENDATIONS] Cache get error:', error);
            return null;
        }
    }

    /**
     * Set recommendations in cache
     */
    setCache(key, data) {
        try {
            // Clean up old entries if cache is getting large
            if (this.cache.size > 100) {
                const oldestKey = this.cache.keys().next().value;
                this.cache.delete(oldestKey);
            }

            this.cache.set(key, {
                data,
                timestamp: Date.now()
            });
        } catch (error) {
            console.warn('[RECOMMENDATIONS] Cache set error:', error);
        }
    }

    /**
     * Get genre-based recommendations
     */
    getGenreBasedRecommendations(genre, count) {
        const genreRecommendations = {
            pop: [
                { artist: 'Dua Lipa', title: 'Levitating' },
                { artist: 'The Weeknd', title: 'Blinding Lights' },
                { artist: 'Harry Styles', title: 'As It Was' },
                { artist: 'Olivia Rodrigo', title: 'good 4 u' }
            ],
            rock: [
                { artist: 'Imagine Dragons', title: 'Enemy' },
                { artist: 'Coldplay', title: 'Higher Power' },
                { artist: 'OneRepublic', title: 'Counting Stars' },
                { artist: 'The 1975', title: 'Somebody Else' }
            ],
            'hip-hop': [
                { artist: 'Drake', title: 'God\'s Plan' },
                { artist: 'Post Malone', title: 'Circles' },
                { artist: 'The Weeknd', title: 'Save Your Tears' },
                { artist: 'Doja Cat', title: 'Kiss Me More' }
            ],
            electronic: [
                { artist: 'Calvin Harris', title: 'Feel So Close' },
                { artist: 'David Guetta', title: 'Titanium' },
                { artist: 'Marshmello', title: 'Happier' },
                { artist: 'The Chainsmokers', title: 'Closer' }
            ],
            indie: [
                { artist: 'Tame Impala', title: 'The Less I Know The Better' },
                { artist: 'Glass Animals', title: 'Heat Waves' },
                { artist: 'Arctic Monkeys', title: 'Do I Wanna Know?' },
                { artist: 'The 1975', title: 'Somebody Else' }
            ]
        };

        const recommendations = genreRecommendations[genre.toLowerCase()] || genreRecommendations.pop || [];

        return this.shuffleArray([...recommendations])
            .slice(0, count)
            .map(rec => ({
                title: rec.title,
                artist: rec.artist,
                query: `${rec.artist} ${rec.title}`,
                reason: `Popular ${genre} track`,
                similarity: 0.7,
                source: 'genre_fallback'
            }));
    }

    /**
     * Get comprehensive statistics about the recommendation system
     */
    getStats() {
        return {
            cacheSize: this.cache.size,
            cacheTimeout: this.cacheTimeout,
            rateLimits: {
                openai: {
                    requests: this.rateLimiter.openai.requests,
                    backoffDelay: this.rateLimiter.openai.backoffDelay,
                    resetTime: new Date(this.rateLimiter.openai.resetTime).toISOString(),
                    configured: !!this.openaiClient.apiKey
                },
                gemini: {
                    requests: this.rateLimiter.gemini.requests,
                    backoffDelay: this.rateLimiter.gemini.backoffDelay,
                    resetTime: new Date(this.rateLimiter.gemini.resetTime).toISOString(),
                    configured: !!this.geminiClient.apiKey
                }
            },
            circuitBreakers: {
                openai: {
                    failures: this.circuitBreaker.openai.failures,
                    isOpen: this.circuitBreaker.openai.isOpen,
                    nextAttempt: new Date(this.circuitBreaker.openai.nextAttempt).toISOString()
                },
                gemini: {
                    failures: this.circuitBreaker.gemini.failures,
                    isOpen: this.circuitBreaker.gemini.isOpen,
                    nextAttempt: new Date(this.circuitBreaker.gemini.nextAttempt).toISOString()
                }
            }
        };
    }

    // ============================================================================
    // CONSOLIDATED CONTEXT-AWARE FEATURES (from recommender.js, EnhancedML)
    // ============================================================================

    /**
     * Get mood-based recommendation adjustments
     */
    getMoodConfig(mood) {
        const configs = {
            'happy': { discovery: 0.4, energy: 0.8, genres: ['pop', 'dance', 'funk'] },
            'sad': { discovery: 0.3, energy: 0.3, genres: ['indie', 'alternative', 'acoustic'] },
            'energetic': { discovery: 0.6, energy: 0.9, genres: ['rock', 'electronic', 'hip-hop'] },
            'calm': { discovery: 0.2, energy: 0.2, genres: ['ambient', 'jazz', 'classical'] },
            'angry': { discovery: 0.5, energy: 0.9, genres: ['rock', 'metal', 'punk'] },
            'romantic': { discovery: 0.3, energy: 0.4, genres: ['r&b', 'soul', 'jazz'] },
            'nostalgic': { discovery: 0.2, energy: 0.5, genres: ['classic-rock', 'oldies', 'retro'] },
            'focus': { discovery: 0.2, energy: 0.4, genres: ['lo-fi', 'ambient', 'instrumental'] },
            'party': { discovery: 0.6, energy: 0.95, genres: ['dance', 'hip-hop', 'electronic'] }
        };
        return configs[mood] || { discovery: 0.5, energy: 0.5, genres: ['pop'] };
    }

    /**
     * Get activity-based recommendation adjustments
     */
    getActivityConfig(activity) {
        const configs = {
            'workout': { energy: 0.9, tempo: 'high', discovery: 0.4, genres: ['electronic', 'rock', 'hip-hop'] },
            'study': { energy: 0.3, tempo: 'low', discovery: 0.2, genres: ['ambient', 'classical', 'lo-fi'] },
            'party': { energy: 0.9, tempo: 'high', discovery: 0.6, genres: ['dance', 'pop', 'hip-hop'] },
            'relax': { energy: 0.2, tempo: 'low', discovery: 0.3, genres: ['ambient', 'jazz', 'acoustic'] },
            'focus': { energy: 0.4, tempo: 'medium', discovery: 0.1, genres: ['instrumental', 'ambient'] },
            'sleep': { energy: 0.1, tempo: 'very-low', discovery: 0.1, genres: ['ambient', 'classical'] },
            'driving': { energy: 0.7, tempo: 'medium', discovery: 0.5, genres: ['rock', 'pop', 'indie'] },
            'gaming': { energy: 0.8, tempo: 'high', discovery: 0.4, genres: ['electronic', 'rock', 'soundtrack'] }
        };
        return configs[activity] || { energy: 0.5, tempo: 'medium', discovery: 0.5, genres: ['pop'] };
    }

    /**
     * Get current time-of-day context
     */
    getTimeOfDayContext() {
        const hour = new Date().getHours();

        if (hour >= 5 && hour < 12) return {
            period: 'morning',
            energy: 0.7,
            genres: ['pop', 'indie', 'alternative'],
            description: 'upbeat morning music'
        };
        if (hour >= 12 && hour < 17) return {
            period: 'afternoon',
            energy: 0.6,
            genres: ['rock', 'pop', 'hip-hop'],
            description: 'energizing afternoon vibes'
        };
        if (hour >= 17 && hour < 22) return {
            period: 'evening',
            energy: 0.5,
            genres: ['indie', 'alternative', 'r&b'],
            description: 'relaxing evening tunes'
        };
        return {
            period: 'night',
            energy: 0.3,
            genres: ['ambient', 'chill', 'lo-fi'],
            description: 'calm late night music'
        };
    }

    /**
     * Apply diversity filtering to avoid repetition
     */
    applyDiversityFilter(recommendations, maxSameArtist = 2, maxSameGenre = 3) {
        const filtered = [];
        const artistCounts = new Map();
        const genreCounts = new Map();

        for (const rec of recommendations) {
            const artistCount = artistCounts.get(rec.artist) || 0;

            // Skip if too many from same artist
            if (artistCount >= maxSameArtist) continue;

            // Check genre diversity
            const genre = rec.genre || 'unknown';
            const genreCount = genreCounts.get(genre) || 0;

            if (genreCount >= maxSameGenre) {
                // Allow with 50% probability to maintain some diversity
                if (Math.random() > 0.5) continue;
            }

            filtered.push(rec);
            artistCounts.set(rec.artist, artistCount + 1);
            genreCounts.set(genre, genreCount + 1);
        }

        return filtered;
    }

    /**
     * Calculate diversity score for recommendations
     */
    calculateDiversity(recommendations) {
        if (!recommendations || recommendations.length === 0) return 0;

        const artists = new Set(recommendations.map(r => r.artist));
        const genres = new Set(recommendations.map(r => r.genre).filter(Boolean));

        const artistDiversity = artists.size / recommendations.length;
        const genreDiversity = genres.size / Math.max(1, recommendations.length);

        return ((artistDiversity + genreDiversity) / 2).toFixed(2);
    }

    /**
     * Enhance recommendation reason with context
     */
    enhanceReasonWithContext(originalReason, options = {}) {
        const enhancements = [];

        if (options.mood) enhancements.push(`${options.mood} mood`);
        if (options.activity) enhancements.push(`${options.activity}`);

        const timeContext = this.getTimeOfDayContext();
        if (timeContext.period) enhancements.push(timeContext.description);

        if (enhancements.length > 0) {
            return `${originalReason} • Perfect for ${enhancements.join(', ')}`;
        }
        return originalReason;
    }

    /**
     * Get context-aware recommendations (enhanced entry point)
     */
    async getContextAwareRecommendations(currentTrack, history = [], options = {}) {
        // Merge with context
        const timeContext = this.getTimeOfDayContext();
        const moodConfig = options.mood ? this.getMoodConfig(options.mood) : null;
        const activityConfig = options.activity ? this.getActivityConfig(options.activity) : null;

        // Enhanced options with context
        const enhancedOptions = {
            ...options,
            timeContext,
            preferredGenres: [
                ...(moodConfig?.genres || []),
                ...(activityConfig?.genres || []),
                ...(timeContext.genres || [])
            ].slice(0, 3) // Top 3 genres
        };

        // Get base recommendations
        let recommendations = await this.getRecommendations(currentTrack, history, enhancedOptions);

        // Apply diversity filter
        recommendations = this.applyDiversityFilter(recommendations);

        // Enhance reasons with context
        recommendations = recommendations.map(rec => ({
            ...rec,
            reason: this.enhanceReasonWithContext(rec.reason, options),
            diversity: this.calculateDiversity(recommendations)
        }));

        return recommendations;
    }

    /**
     * Clean up resources
     */
    cleanup() {
        try {
            this.cache.clear();

            // Reset rate limiters
            this.rateLimiter.openai = { requests: 0, resetTime: 0, lastRequest: 0, backoffDelay: 1000, maxBackoff: 300000 };
            this.rateLimiter.gemini = { requests: 0, resetTime: 0, lastRequest: 0, backoffDelay: 1000, maxBackoff: 300000 };

            // Reset circuit breakers
            this.circuitBreaker.openai = { failures: 0, isOpen: false, nextAttempt: 0 };
            this.circuitBreaker.gemini = { failures: 0, isOpen: false, nextAttempt: 0 };

            console.log('[RECOMMENDATIONS] Cleaned up recommendation resources');
        } catch (error) {
            console.error('[RECOMMENDATIONS] Error during cleanup:', error);
        }
    }

    /**
     * Test the recommendation system with a sample track
     */
    async testRecommendations() {
        const testTrack = {
            title: 'Blinding Lights',
            artist: 'The Weeknd',
            genre: 'pop'
        };

        try {
            console.log('[RECOMMENDATIONS] Testing recommendation system...');
            const recommendations = await this.getRecommendations(testTrack, [], { count: 3 });
            console.log(`[RECOMMENDATIONS] Test successful - got ${recommendations.length} recommendations`);
            return {
                success: true,
                recommendations: recommendations,
                stats: this.getStats()
            };
        } catch (error) {
            console.error('[RECOMMENDATIONS] Test failed:', error);
            return {
                success: false,
                error: error.message,
                stats: this.getStats()
            };
        }
    }
}

module.exports = new RecommendationsHelper();