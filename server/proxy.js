const express = require('express');
const axios = require('axios');
const cors = require('cors');
const compression = require('compression');
const fs = require('fs');
const path = require('path');
const { execSync, exec } = require('child_process');

const app = express();
app.use(cors());
app.use(compression());
app.use(express.json());

const DOWNLOADS_DIR = '/data/downloads';
const EXTRACTED_DIR = '/data/extracted';

// Ensure directories exist
fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
fs.mkdirSync(EXTRACTED_DIR, { recursive: true });

var BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9'
};

// Store active downloads
var activeDownloads = {};

// Landing page
app.get('/', function (req, res) {
    res.send('<html><head><title>Send.now Streamer</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#0a0a0a;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center}.c{text-align:center;max-width:700px;padding:40px}h1{font-size:2.5rem;margin-bottom:16px;background:linear-gradient(to right,#6366f1,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent}p{color:#9ca3af;font-size:1.1rem;margin-bottom:24px}.s{display:inline-block;padding:8px 20px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);border-radius:9999px;color:#22c55e;font-weight:600}.e{margin-top:32px;padding:16px;background:rgba(255,255,255,.05);border-radius:12px;border:1px solid rgba(255,255,255,.1);text-align:left}code{color:#a78bfa;display:block;margin:4px 0}</style></head><body><div class="c"><h1>Send.now Streamer</h1><p>Download RAR files, extract them, and stream videos online.</p><div class="s">Server Running</div><div class="e"><p style="color:#fff;margin-bottom:12px;font-weight:bold">API Endpoints:</p><code>POST /download-extract {url: "DIRECT_RAR_URL"}</code><code>GET /download-status/:id</code><code>GET /files</code><code>GET /stream-file?path=FILE_PATH</code><code>GET /resolve?url=SENDNOW_URL</code><code>GET /stream?url=DIRECT_VIDEO_URL</code><code>DELETE /cleanup</code></div></div></body></html>');
});

app.get('/health', function (req, res) {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), activeDownloads: Object.keys(activeDownloads).length });
});

// ===== RAR DOWNLOAD AND EXTRACTION =====

// Generate unique download ID
function generateId() {
    return 'dl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
}

// Download and extract RAR file
app.post('/download-extract', function (req, res) {
    var rarUrl = req.body.url;

    if (!rarUrl) {
        res.status(400).json({ error: 'url parameter required in body' });
        return;
    }

    var downloadId = generateId();
    var fileName = decodeURIComponent(rarUrl.split('/').pop().split('?')[0]);
    var filePath = path.join(DOWNLOADS_DIR, downloadId + '_' + fileName);
    var extractDir = path.join(EXTRACTED_DIR, downloadId);

    fs.mkdirSync(extractDir, { recursive: true });

    // Initialize download status
    activeDownloads[downloadId] = {
        id: downloadId,
        status: 'downloading',
        fileName: fileName,
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        speed: 0,
        eta: null,
        files: [],
        error: null,
        startTime: Date.now()
    };

    console.log('Starting download:', fileName, 'ID:', downloadId);

    // Start download in background
    downloadFile(rarUrl, filePath, downloadId)
        .then(function () {
            return extractRar(filePath, extractDir, downloadId);
        })
        .then(function () {
            return listVideoFiles(extractDir, downloadId);
        })
        .then(function (files) {
            activeDownloads[downloadId].status = 'completed';
            activeDownloads[downloadId].files = files;
            activeDownloads[downloadId].progress = 100;
            console.log('Download completed:', downloadId, 'Files:', files.length);

            // Delete the RAR file to save space
            try { fs.unlinkSync(filePath); } catch (e) { }
        })
        .catch(function (err) {
            activeDownloads[downloadId].status = 'error';
            activeDownloads[downloadId].error = err.message;
            console.error('Download failed:', downloadId, err.message);
        });

    res.json({
        downloadId: downloadId,
        status: 'downloading',
        message: 'Download started. Check status with GET /download-status/' + downloadId,
        fileName: fileName
    });
});

// Download file using wget (better for file hosting sites)
function downloadFile(url, filePath, downloadId) {
    return new Promise(function (resolve, reject) {
        console.log('Starting wget download:', url);

        var wgetCmd = 'wget --no-check-certificate --tries=3 --timeout=60 --continue ' +
            '--user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36" ' +
            '--header="Accept: */*" ' +
            '--header="Accept-Language: en-US,en;q=0.9" ' +
            '--header="Referer: https://send.now/" ' +
            '-O "' + filePath + '" ' +
            '"' + url + '"';

        var wgetProcess = exec(wgetCmd, { timeout: 0, maxBuffer: 1024 * 1024 }, function (err, stdout, stderr) {
            if (err) {
                reject(new Error('wget failed: ' + (stderr || err.message)));
            } else {
                activeDownloads[downloadId].status = 'extracting';
                activeDownloads[downloadId].progress = 100;
                resolve();
            }
        });

        // Track progress by watching file size
        var progressInterval = setInterval(function () {
            try {
                if (fs.existsSync(filePath)) {
                    var stat = fs.statSync(filePath);
                    var downloadedBytes = stat.size;
                    activeDownloads[downloadId].downloadedBytes = downloadedBytes;

                    if (activeDownloads[downloadId].totalBytes > 0) {
                        activeDownloads[downloadId].progress = Math.round((downloadedBytes / activeDownloads[downloadId].totalBytes) * 100);
                    }

                    var now = Date.now();
                    var elapsed = (now - activeDownloads[downloadId].startTime) / 1000;
                    if (elapsed > 0) {
                        activeDownloads[downloadId].speed = downloadedBytes / elapsed;
                    }
                }
            } catch (e) { }
        }, 2000);

        wgetProcess.on('close', function () {
            clearInterval(progressInterval);
        });
    });
}

// Extract RAR file
function extractRar(filePath, extractDir, downloadId) {
    return new Promise(function (resolve, reject) {
        activeDownloads[downloadId].status = 'extracting';
        console.log('Extracting:', filePath);

        try {
            // Use 7z to extract (supports RAR, ZIP, 7z)
            execSync('7z x -y -o"' + extractDir + '" "' + filePath + '"', {
                timeout: 600000,
                stdio: 'pipe'
            });
            console.log('Extraction completed:', extractDir);
            resolve();
        } catch (err) {
            reject(new Error('Extraction failed: ' + err.message));
        }
    });
}

// List video files in extracted directory
function listVideoFiles(dir, downloadId) {
    var videoExtensions = ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.wmv', '.m4v'];
    var files = [];

    function scanDir(currentDir) {
        try {
            var items = fs.readdirSync(currentDir);
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var fullPath = path.join(currentDir, item);
                try {
                    var stat = fs.statSync(fullPath);
                    if (stat.isDirectory()) {
                        scanDir(fullPath);
                    } else {
                        var ext = path.extname(item).toLowerCase();
                        if (videoExtensions.indexOf(ext) !== -1) {
                            files.push({
                                name: path.relative(EXTRACTED_DIR, fullPath),
                                path: fullPath,
                                size: stat.size,
                                sizeFormatted: formatBytes(stat.size)
                            });
                        }
                    }
                } catch (e) { }
            }
        } catch (e) { }
    }

    scanDir(dir);

    // Sort by name
    files.sort(function (a, b) { return a.name.localeCompare(b.name); });

    return files;
}

// Get download status
app.get('/download-status/:id', function (req, res) {
    var downloadId = req.params.id;
    var download = activeDownloads[downloadId];

    if (!download) {
        res.status(404).json({ error: 'Download not found' });
        return;
    }

    res.json({
        id: download.id,
        status: download.status,
        fileName: download.fileName,
        progress: download.progress,
        downloadedBytes: download.downloadedBytes,
        downloadedFormatted: formatBytes(download.downloadedBytes),
        totalBytes: download.totalBytes,
        totalFormatted: formatBytes(download.totalBytes),
        speed: download.speed,
        speedFormatted: formatBytes(download.speed) + '/s',
        eta: download.eta,
        files: download.files,
        error: download.error,
        elapsed: Math.round((Date.now() - download.startTime) / 1000)
    });
});

// List all extracted video files
app.get('/files', function (req, res) {
    var allFiles = [];

    try {
        var dirs = fs.readdirSync(EXTRACTED_DIR);
        for (var i = 0; i < dirs.length; i++) {
            var dirPath = path.join(EXTRACTED_DIR, dirs[i]);
            try {
                var stat = fs.statSync(dirPath);
                if (stat.isDirectory()) {
                    var files = listVideoFiles(dirPath, dirs[i]);
                    for (var j = 0; j < files.length; j++) {
                        allFiles.push({
                            name: files[j].name,
                            streamUrl: '/stream-file?path=' + encodeURIComponent(files[j].path),
                            size: files[j].size,
                            sizeFormatted: files[j].sizeFormatted
                        });
                    }
                }
            } catch (e) { }
        }
    } catch (e) { }

    res.json({ files: allFiles, count: allFiles.length });
});

// Stream a local file
app.get('/stream-file', function (req, res) {
    var filePath = req.query.path;
    var range = req.headers.range;

    if (!filePath) {
        res.status(400).json({ error: 'path parameter required' });
        return;
    }

    // Security: only allow files from EXTRACTED_DIR
    if (!filePath.startsWith(EXTRACTED_DIR)) {
        res.status(403).json({ error: 'Access denied' });
        return;
    }

    if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'File not found' });
        return;
    }

    var stat = fs.statSync(filePath);
    var totalSize = stat.size;
    var ext = path.extname(filePath).toLowerCase();
    var contentTypeMap = {
        '.mp4': 'video/mp4',
        '.mkv': 'video/x-matroska',
        '.webm': 'video/webm',
        '.avi': 'video/x-msvideo',
        '.mov': 'video/quicktime',
        '.flv': 'video/x-flv',
        '.wmv': 'video/x-ms-wmv',
        '.m4v': 'video/mp4'
    };
    var contentType = contentTypeMap[ext] || 'application/octet-stream';

    if (!range) {
        res.writeHead(200, {
            'Content-Length': totalSize,
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*'
        });
        fs.createReadStream(filePath).pipe(res);
        return;
    }

    var parts = range.replace(/bytes=/, "").split("-");
    var start = parseInt(parts[0], 10);
    var end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
    var chunksize = (end - start) + 1;

    res.writeHead(206, {
        'Content-Range': 'bytes ' + start + '-' + end + '/' + totalSize,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
    });

    fs.createReadStream(filePath, { start: start, end: end }).pipe(res);
});

// Cleanup all data
app.delete('/cleanup', function (req, res) {
    try {
        execSync('rm -rf ' + DOWNLOADS_DIR + '/* ' + EXTRACTED_DIR + '/*');
        activeDownloads = {};
        res.json({ status: 'cleaned', message: 'All downloads and extractions deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Cleanup failed', details: err.message });
    }
});

// ===== RESOLVE SEND.NOW URL =====

app.get('/resolve', async function (req, res) {
    var sendnowUrl = req.query.url;

    if (!sendnowUrl) {
        res.status(400).json({ error: 'url parameter required' });
        return;
    }

    var fileId = sendnowUrl.split('/').pop().split('?')[0];

    try {
        var pageResp = await axios({
            method: 'get',
            url: sendnowUrl,
            headers: BROWSER_HEADERS,
            timeout: 30000,
            maxRedirects: 10
        });

        var html = String(pageResp.data);

        if (html.includes('turnstile') || html.includes('Security verification')) {
            res.json({
                status: 'captcha_required',
                file_id: fileId,
                message: 'Captcha required. Open in browser, complete captcha, get direct link from Downloads (Ctrl+J).',
                open_url: sendnowUrl
            });
            return;
        }

        var directLink = extractDownloadLink(html);
        if (directLink) {
            res.json({ status: 'resolved', direct_url: directLink });
            return;
        }

        res.json({ status: 'not_found', message: 'Could not find download link.' });

    } catch (error) {
        res.json({
            status: 'captcha_required',
            file_id: fileId,
            message: 'Cloudflare blocked. Open in browser, complete captcha, get direct link from Downloads (Ctrl+J).',
            open_url: sendnowUrl
        });
    }
});

function extractDownloadLink(html) {
    var patterns = [
        /href=["'](https?:\/\/[^"']*\.mp4[^"']*?)["']/i,
        /href=["'](https?:\/\/[^"']*\.mkv[^"']*?)["']/i,
        /["'](https?:\/\/[^"']*cdn[^"']*\/[^"']*?)["']/i,
        /["'](https?:\/\/[^"']*download[^"']*?)["']/i,
        /window\.location\.href\s*=\s*["'](https?:\/\/[^"']+)["']/i
    ];

    for (var i = 0; i < patterns.length; i++) {
        var match = html.match(patterns[i]);
        if (match && match[1]) return match[1];
    }
    return null;
}

// ===== STREAM REMOTE URL =====

app.get('/stream', async function (req, res) {
    var videoUrl = req.query.url;
    var range = req.headers.range;

    if (!videoUrl) {
        res.status(400).json({ error: 'url parameter required' });
        return;
    }

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
        res.status(500).json({ error: 'Stream failed', status: statusCode });
    }
});

// ===== HELPER =====

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ===== START SERVER =====

var PORT = process.env.PORT || 7860;
app.listen(PORT, function () {
    console.log('Send.now Streamer running on port ' + PORT);
    console.log('Downloads dir:', DOWNLOADS_DIR);
    console.log('Extracted dir:', EXTRACTED_DIR);
});
