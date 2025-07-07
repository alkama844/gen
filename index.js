const express = require('express');
const puppeteer = require('puppeteer');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json());

// Serve static files from the 'public' directory
// This is the correct and only static middleware needed if index.html is in public/
app.use(express.static(path.join(__dirname, 'public'))); 

// Explicitly serve index.html from the 'public' folder when the root URL is accessed
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// REMOVED THE REDUNDANT: app.use(express.static(path.join(__dirname)));

async function generateImageFromPerchance(prompt) {
    let browser;
    try {
        // Most reliable executablePath for Render deployments
        const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable';

        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--window-size=1920,1080',
                '--no-zygote',
                '--single-process'
            ],
            executablePath: executablePath,
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Linux; Android 13; CPH2205) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36');

        await page.goto('https://perchance.org/ai-image-generator', {
            waitUntil: 'networkidle0',
            timeout: 60000
        });

        let userKey = null;
        let imageId = null;

        page.on('response', async response => {
            const url = response.url();
            const requestMethod = response.request().method();

            if (url.startsWith('https://image-generation.perchance.org/api/generate') && requestMethod === 'POST') {
                try {
                    const responseJson = await response.json();
                    if (responseJson && responseJson.imageId) {
                        imageId = responseJson.imageId;
                    } else if (responseJson && responseJson.data && responseJson.data.imageId) {
                        imageId = responseJson.data.imageId;
                    }
                } catch (e) {
                }
            }
            if (url.startsWith('https://image-generation.perchance.org/api/') && url.includes('userKey=')) {
                const urlParams = new URLSearchParams(url.split('?')[1]);
                const foundUserKey = urlParams.get('userKey');
                if (foundUserKey && !userKey) {
                    userKey = foundUserKey;
                }
            }
        });

        const promptInputSelector = 'textarea.form-control[aria-label="Prompt"]';
        const generateButtonSelector = 'button.btn.btn-primary.submit-button';

        await page.waitForSelector(promptInputSelector, { timeout: 30000 });
        await page.waitForSelector(generateButtonSelector, { timeout: 30000 });

        await page.focus(promptInputSelector);
        await page.keyboard.down('Control');
        await page.keyboard.press('A');
        await page.keyboard.up('Control');
        await page.keyboard.press('Delete');
        await page.type(promptInputSelector, prompt);

        await page.click(generateButtonSelector);

        let queuePosition = -1;
        let maxRetries = 60;
        let retryCount = 0;

        while (queuePosition !== 0 && retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            retryCount++;

            if (!userKey) {
                continue;
            }

            try {
                const queueUrl = `https://image-generation.perchance.org/api/getUserQueuePosition?userKey=${userKey}&requestId=${Date.now() + Math.random()}&__cacheBust=${Math.random()}`;
                const queueResponse = await page.evaluate(async (url) => {
                    const response = await fetch(url);
                    return response.json();
                }, queueUrl);

                if (queueResponse && typeof queueResponse.position === 'number') {
                    queuePosition = queueResponse.position;
                } else if (queueResponse && queueResponse.status === 'ready') {
                    queuePosition = 0;
                }
                if (queuePosition === 0 && !imageId && queueResponse && queueResponse.imageId) {
                    imageId = queueResponse.imageId;
                }

            } catch (e) {
            }
        }

        if (queuePosition !== 0 || !imageId) {
            throw new Error("Image generation timed out or could not retrieve image ID.");
        }

        const downloadUrl = `https://image-generation.perchance.org/api/downloadTemporaryImage?imageId=${imageId}`;

        const imageBuffer = await page.evaluate(async (url) => {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const buffer = await response.arrayBuffer();
            return Array.from(new Uint8Array(buffer));
        }, downloadUrl);

        if (!imageBuffer || imageBuffer.length === 0) {
            throw new Error("Failed to get image data or image is empty.");
        }

        return `data:image/png;base64,${Buffer.from(imageBuffer).toString('base64')}`;

    } catch (error) {
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

app.post('/generate-image', async (req, res) => {
    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required.' });
    }

    try {
        const imageDataUri = await generateImageFromPerchance(prompt);

        if (imageDataUri) {
            res.json({ success: true, imageData: imageDataUri });
        } else {
            res.status(500).json({ success: false, error: 'Image generation failed: No image data returned.' });
        }

    } catch (error) {
        res.status(500).json({ success: false, error: error.message || 'Internal server error during image generation.' });
    }
});

app.listen(PORT, () => {
});
