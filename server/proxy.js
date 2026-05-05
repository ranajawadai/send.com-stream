const express = require('express');
const axios = require('axios');
const cors = require('cors');
const compression = require('compression');

const app = express();
app.use(cors());
app.use(compression());

app.get('/stream', async (req, res) => {
    const videoUrl = req.query.url;
    const range = req.headers.range;

    if (!videoUrl) {
        res.status(400).send('URL required');
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
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Streaming Error:', message);
        res.status(500).send('Stream failed');
    }
});

const PORT = process.env.PORT || 7860;
app.listen(PORT, function () {
    console.log('Proxy running on port ' + PORT);
});
