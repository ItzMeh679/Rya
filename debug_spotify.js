const axios = require('axios');
const cheerio = require('cheerio');

async function debug() {
    const url = 'https://open.spotify.com/embed/playlist/37i9dQZF1DZ06evO0ORgym';

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const nextData = $('#__NEXT_DATA__').html();

        if (nextData) {
            const data = JSON.parse(nextData);
            console.log('Keys:', Object.keys(data));

            // Search deeply for accessToken
            function findKey(obj, key, path = '') {
                if (!obj || typeof obj !== 'object') return;
                if (obj[key]) console.log(`FOUND ${key} at: ${path}.${key} = ${String(obj[key]).substring(0, 20)}...`);

                Object.keys(obj).forEach(k => {
                    findKey(obj[k], key, `${path}.${k}`);
                });
            }

            findKey(data, 'accessToken');
            findKey(data, 'entity'); // Track data might be here
        } else {
            console.log('No __NEXT_DATA__ found');
        }

    } catch (e) {
        console.error('Error:', e.message);
    }
}

debug();
