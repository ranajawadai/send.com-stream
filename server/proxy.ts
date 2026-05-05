import express from 'express';
import axios from 'axios';
import cors from 'cors';
import compression from 'compression';

const app = express();
app.use(cors());
app.use(compression()); // Optimizes data transfer

app.get('/stream', async (req, res) => {
    const videoUrl = req.query.url as string;
    const range = req.headers.range;

    if (!videoUrl) return res.status(400).send('URL required');

    try {
        const headResponse = await axios.head(videoUrl);
        const totalSize = parseInt(headResponse.headers['content-length'] || '0');
        const contentType = headResponse.headers['content-type'];

        if (!range) {
            const response = await axios({ method: 'get', url: videoUrl, responseType: 'stream' });
            res.setHeader('Content-Type', contentType);
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
            headers: { Range: `bytes=${start}-${end}` },
            timeout: 60000 // 60 seconds timeout for large chunks
        });

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': contentType,
        });

        response.data.pipe(res);
    } catch (error: any) {
        console.error('Streaming Error:', error.message);
        res.status(500).send('Stream failed');
    }
});

const PORT = process.env.PORT || 7860;
app.listen(PORT, () => console.log(`🚀 High-Performance Proxy on port ${PORT}`));
