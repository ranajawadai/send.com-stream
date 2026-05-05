const express = require('express');
const axios = require('axios');
const cors = require('cors');
const compression = require('compression');

const app = express();
app.use(cors());
app.use(compression());

var BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://send.now/',
    'Origin': 'https://send.now'
};

app.get('/', function (req, res) {
    res.send('<html><head><title>Send.now Proxy</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#0a0a0a;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center}.c{text-align:center;max-width:600px;padding:40px}h1{font-size:2.5rem;margin-bottom:16px;background:linear-gradient(to right,#6366f1,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent}p{color:#9ca3af;font-size:1.1rem;margin-bottom:24px}.s{display:inline-block;padding:8px 20px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);border-radius:9999px;color:#22c55e;font-weight:600}.e{margin-top:32px;padding:16px;background:rgba(255,255,255,.05);border-radius:12px;border:1px solid rgba(255,255,255,.1)}code{color:#a78bfa}</style></head><body><div class="c"><h1>Send.now Proxy</h1><p>Video streaming proxy with auto-resolve.</p><div class="s">Server Running</div><div class="e"><p style="color:#fff;margin-bottom:8px">Endpoints:</p><code>GET /stream?url=DIRECT_URL</code><br><br><code>GET /resolve?url=SENDNOW_URL</code></div></div></body></html>');
});

app.get('/health', function (req, res) {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Resolve send.now landing page to get direct download link
app.get('/resolve', async function (req, res) {
    var sendnowUrl = req.query.url;

    if (!sendnowUrl) {
        res.status(400).json({ error: 'url parameter required' });
        return;
    }

    console.log('Resolving:', sendnowUrl);

    // Extract file ID from URL
    var fileId = sendnowUrl.split('/').pop().split('?')[0];
    console.log('File ID:', fileId);

    try {
        // Step 1: Fetch the landing page
        var pageResp = await axios({
            method: 'get',
            url: sendnowUrl,
            headers: BROWSER_HEADERS,
            timeout: 30000,
            maxRedirects: 10
        });

        var html = String(pageResp.data);

        // Step 2: Check if captcha is required
        if (html.includes('turnstile') || html.includes('Security verification') || html.includes('captcha')) {
            console.log('Captcha detected for:', fileId);

            // Try to extract file info from the page
            var fileNameMatch = html.match(/<title>\s*Download\s+(.+?)\s*<\/title>/i);
            var fileName = fileNameMatch ? fileNameMatch[1].trim() : fileId;

            // Try POST approach with op=download1
            try {
                var postResp = await axios({
                    method: 'post',
                    url: 'https://send.now',
                    headers: Object.assign({}, BROWSER_HEADERS, {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }),
                    data: 'op=download1&id=' + fileId + '&rand=&referer=',
                    timeout: 30000,
                    maxRedirects: 10,
                    validateStatus: function (s) { return s < 500; }
                });

                var postHtml = String(postResp.data);

                // Check if we got a download page
                var directLink = extractDownloadLink(postHtml);
                if (directLink) {
                    console.log('Direct link found via POST:', directLink);
                    res.json({
                        status: 'resolved',
                        direct_url: directLink,
                        file_name: fileName,
                        method: 'post_bypass'
                    });
                    return;
                }
            } catch (postErr) {
                console.log('POST approach failed:', postErr.message);
            }

            // Try API approach
            try {
                var apiResp = await axios({
                    method: 'get',
                    url: 'https://send.now/api/v1/file/' + fileId,
                    headers: BROWSER_HEADERS,
                    timeout: 15000,
                    maxRedirects: 5,
                    validateStatus: function (s) { return s < 500; }
                });

                if (apiResp.data && apiResp.data.download_url) {
                    console.log('Direct link found via API:', apiResp.data.download_url);
                    res.json({
                        status: 'resolved',
                        direct_url: apiResp.data.download_url,
                        file_name: fileName,
                        method: 'api'
                    });
                    return;
                }

                if (apiResp.data && apiResp.data.url) {
                    console.log('Direct link found via API:', apiResp.data.url);
                    res.json({
                        status: 'resolved',
                        direct_url: apiResp.data.url,
                        file_name: fileName,
                        method: 'api'
                    });
                    return;
                }
            } catch (apiErr) {
                console.log('API approach failed:', apiErr.message);
            }

            // All automated approaches failed - return captcha info
            res.json({
                status: 'captcha_required',
                file_id: fileId,
                file_name: fileName,
                message: 'Send.now requires captcha verification. Follow these steps:',
                steps: [
                    'Step 1: Open this link in your browser: ' + sendnowUrl,
                    'Step 2: Complete the Cloudflare captcha',
                    'Step 3: Click "CONTINUE" button',
                    'Step 4: On the next page, click the Download button',
                    'Step 5: While downloading, copy the URL from browser address bar or download manager',
                    'Step 6: Paste that direct URL here to stream it'
                ]
            });
            return;
        }

        // No captcha - try to extract direct link from page
        var directLink = extractDownloadLink(html);
        if (directLink) {
            res.json({
                status: 'resolved',
                direct_url: directLink,
                method: 'direct'
            });
            return;
        }

        // Check for download form
        var formMatch = html.match(/action=["']([^"']+)["']/i);
        if (formMatch) {
            res.json({
                status: 'form_found',
                form_action: formMatch[1],
                message: 'Found download form. May need manual interaction.'
            });
            return;
        }

        res.json({
            status: 'not_found',
            message: 'Could not find download link on the page.',
            html_preview: html.substring(0, 1000)
        });

    } catch (error) {
        var statusCode = error.response ? error.response.status : 0;
        console.error('Resolve error:', statusCode, error.message);
        res.status(500).json({
            error: 'Failed to resolve',
            status: statusCode,
            details: error.message
        });
    }
});

function extractDownloadLink(html) {
    // Try various patterns to find direct download links
    var patterns = [
        /href=["'](https?:\/\/[^"']*\.mp4[^"']*?)["']/i,
        /href=["'](https?:\/\/[^"']*\.mkv[^"']*?)["']/i,
        /href=["'](https?:\/\/[^"']*\.webm[^"']*?)["']/i,
        /href=["'](https?:\/\/[^"']*\.avi[^"']*?)["']/i,
        /["'](https?:\/\/[^"']*cdn[^"']*\/[^"']*?)["']/i,
        /["'](https?:\/\/[^"']*download[^"']*?)["']/i,
        /window\.location\.href\s*=\s*["'](https?:\/\/[^"']+)["']/i,
        /window\.open\(["'](https?:\/\/[^"']+)["']/i,
        /data-url=["'](https?:\/\/[^"']+)["']/i,
        /src=["'](https?:\/\/[^"']*\.mp4[^"']*?)["']/i
    ];

    for (var i = 0; i < patterns.length; i++) {
        var match = html.match(patterns[i]);
        if (match && match[1]) {
            return match[1];
        }
    }

    return null;
}

// Streaming endpoint
app.get('/stream', async function (req, res) {
    var videoUrl = req.query.url;
    var range = req.headers.range;

    if (!videoUrl) {
        res.status(400).json({ error: 'url parameter is required' });
        return;
    }

    console.log('Stream request:', videoUrl, 'Range:', range || 'none');

    try {
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
        console.error('Stream error:', statusCode, message);
        res.status(500).json({ error: 'Stream failed', status: statusCode, details: message });
    }
});

var PORT = process.env.PORT || 7860;
app.listen(PORT, function () {
    console.log('Proxy running on port ' + PORT);
});
