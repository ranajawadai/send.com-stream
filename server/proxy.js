const express = require('express');
const axios = require('axios');
const cors = require('cors');
const compression = require('compression');

const app = express();
app.use(cors());
app.use(compression());

// Landing page
app.get('/', function (req, res) {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Send.now Proxy Server</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: #0a0a0a;
                color: #fff;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .container {
                text-align: center;
                max-width: 600px;
                padding: 40px;
            }
            h1 {
                font-size: 2.5rem;
                margin-bottom: 16px;
                background: linear-gradient(to right, #6366f1, #a855f7);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }
            p {
                color: #9ca3af;
                font-size: 1.1rem;
                margin-bottom: 24px;
            }
            .status {
                display: inline-block;
                padding: 8px 20px;
                background: rgba(34, 197, 94, 0.1);
                border: 1px solid rgba(34, 197, 94, 0.3);
                border-radius: 9999px;
                color: #22c55e;
                font-weight: 600;
            }
            .endpoint {
                margin-top: 32px;
                padding: 16px;
                background: rgba(255,255,255,0.05);
                border-radius: 12px;
                border: 1px solid rgba(255,255,255,0.1);
            }
            code {
                color: #a78bfa;
                font-size: 0.95rem;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Send.now Proxy</h1>
            <p>High-performance video streaming proxy with HTTP Range Request support.</p>
            <div class="status">● Server Running</div>
            <div class="endpoint">
                <p style="color:#fff; margin-bottom:8px;">API Endpoint:</p>
                <code>GET /stream?url=VIDEO_URL</code>
            </div>
        </div>
    </body>
    </html>
    `);
});

// Health check
app.get('/health', function (req, res) {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Streaming endpoint
app.get('/stream', async function (req, res) {
    const videoUrl = req.query.url;
    const range = req.headers.range;

    if (!videoUrl) {
        res.status(400).json({ error: 'url parameter is required' });
        return;
    }

    try {
        const headResponse = await axios.head(videoUrl);
        const rawContentLength = headResponse.headers['content-length'];
        const totalSize = parseInt(String(rawContentLength || '0'), 10);
        const contentType = String(headResponse.headers['content-type'] || 'video/mp4');

        if (!range) {
            const response = await axios({ method: 'get', url: videoUrl, responseType: 'stream' });
            res.setHeader('Content-Type', contentType);
            if (rawContentLength) {
                res.setHeader('Content-Length', String(rawContentLength));
            }
            response.data.pipe(res);
            return;
        }

        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
        const chunksize = (end - start) + 1;

        const response = await axios({
            method: 'get',
            url: videoUrl,
            responseType: 'stream',
            headers: { Range: 'bytes=' + start + '-' + end },
            timeout: 60000
        });

        res.writeHead(206, {
            'Content-Range': 'bytes ' + start + '-' + end + '/' + totalSize,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunksize),
            'Content-Type': contentType,
        });

        response.data.pipe(res);
    } catch (error) {
        var message = error.message || 'Unknown error';
        console.error('Streaming Error:', message);
        res.status(500).json({ error: 'Stream failed', details: message });
    }
});

var PORT = process.env.PORT || 7860;
app.listen(PORT, function () {
    console.log('Proxy running on port ' + PORT);
});
