const express = require('express');
const axios = require('axios');
const cors = require('cors');
const compression = require('compression');

const app = express();
app.use(cors());
app.use(compression());

var BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://send.now/',
    'Origin': 'https://send.now'
};

app.get('/', function (req, res) {
    res.send('<html><head><title>Send.now Proxy</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#0a0a0a;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center}.c{text-align:center;max-width:600px;padding:40px}h1{font-size:2.5rem;margin-bottom:16px;background:linear-gradient(to right,#6366f1,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent}p{color:#9ca3af;font-size:1.1rem;margin-bottom:24px}.s{display:inline-block;padding:8px 20px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);border-radius:9999px;color:#22c55e;font-weight:600}.e{margin-top:32px;padding:16px;background:rgba(255,255,255,.05);border-radius:12px;border:1px solid rgba(255,255,255,.1)}code{color:#a78bfa}</style></head><body><div class="c"><h1>Send.now Proxy</h1><p>Video streaming proxy with Range Request support.</p><div class="s">Server Running</div><div class="e"><p style="color:#fff;margin-bottom:8px">API:</p><code>GET /stream?url=VIDEO_URL</code></div></div></body></html>');
});

app.get('/health', function (req, res) {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/stream', async function (req, res) {
    var videoUrl = req.query.url;
    var range = req.headers.range;

    if (!videoUrl) {
        res.status(400).json({ error: 'url parameter is required' });
        return;
    }

    console.log('Request:', videoUrl, 'Range:', range || 'none');

    try {
        // Probe with small range to get total size
        var probeResp = await axios({
            method: 'get',
            url: videoUrl,
            headers: Object.assign({}, BROWSER_HEADERS, { 'Range': 'bytes=0-0' }),
            timeout: 30000,
            maxRedirects: 10,
            validateStatus: function (s) { return s === 200 || s === 206; }
        });

        var totalSize = 0;
        var contentType = String(probeResp.headers['content-type'] || 'video/mp4');
        var contentRange = probeResp.headers['content-range'];
        if (contentRange) {
            var m = contentRange.match(/\/(\d+)/);
            if (m) totalSize = parseInt(m[1], 10);
        }
        if (!totalSize) {
            totalSize = parseInt(String(probeResp.headers['content-length'] || '0'), 10);
        }

        console.log('Size:', totalSize, 'Type:', contentType);

        if (!range) {
            var resp = await axios({
                method: 'get',
                url: videoUrl,
                responseType: 'stream',
                headers: BROWSER_HEADERS,
                timeout: 120000,
                maxRedirects: 10
            });
            res.setHeader('Content-Type', contentType);
            if (totalSize) res.setHeader('Content-Length', String(totalSize));
            res.setHeader('Accept-Ranges', 'bytes');
            resp.data.pipe(res);
            return;
        }

        var parts = range.replace(/bytes=/, "").split("-");
        var start = parseInt(parts[0], 10);
        var end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
        var chunksize = (end - start) + 1;

        console.log('Range: bytes ' + start + '-' + end + '/' + totalSize);

        var resp = await axios({
            method: 'get',
            url: videoUrl,
            responseType: 'stream',
            headers: Object.assign({}, BROWSER_HEADERS, { 'Range': 'bytes=' + start + '-' + end }),
            timeout: 120000,
            maxRedirects: 10,
            validateStatus: function (s) { return s === 200 || s === 206; }
        });

        res.writeHead(206, {
            'Content-Range': 'bytes ' + start + '-' + end + '/' + totalSize,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunksize),
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*'
        });

        resp.data.pipe(res);

    } catch (error) {
        var statusCode = error.response ? error.response.status : 0;
        var message = error.message || 'Unknown error';
        console.error('Error:', statusCode, message);
        res.status(500).json({ error: 'Stream failed', status: statusCode, details: message });
    }
});

var PORT = process.env.PORT || 7860;
app.listen(PORT, function () {
    console.log('Proxy running on port ' + PORT);
});
