const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
const PORT = 8443;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'], 
    allowedHeaders: ['Content-Type', 'Authorization', 'x-expected-content-length', 'Range', 'user-agent', 'referer', 'origin'], 
    exposedHeaders: ['Content-Length', 'Content-Range'] 
}));

app.use(express.json());

// Reverse Proxy for GoogleVideo
app.use('/video/:host/', createProxyMiddleware({
    target: 'https://:host.googlevideo.com',
    changeOrigin: true,
    followRedirects: true,
    secure: false,
    logLevel: 'debug',
    pathRewrite: (path, req) => {
        const newPath = path.replace(/^\/video\/[^\/]+\//, '/');
        return `videoplayback${newPath}`;
    },
    onProxyReq: (proxyReq, req, res) => {
        console.log(`[${new Date().toISOString()}] Proxied request to GoogleVideo: ${req.method} ${req.url}`);
        console.log(`[${new Date().toISOString()}] Request Headers: ${JSON.stringify(req.headers)}`);

        if (req.headers['x-expected-content-length']) {
            proxyReq.setHeader('x-expected-content-length', req.headers['x-expected-content-length']);
            console.log(`[${new Date().toISOString()}] Adding Expected Content-Length header: ${req.headers['x-expected-content-length']}`);
        }

        if (req.headers['range']) {
            proxyReq.setHeader('Range', req.headers['range']);
            console.log(`[${new Date().toISOString()}] Adding Range header: ${req.headers['range']}`);
        }

        // Set headers to mimic a browser more closely
        proxyReq.setHeader('Referer', 'https://www.youtube.com');
        proxyReq.setHeader('Origin', 'https://www.youtube.com');
        proxyReq.setHeader('User-Agent', req.headers['user-agent']);

        // Forward cookies from the original request
        if (req.headers['cookie']) {
            proxyReq.setHeader('Cookie', req.headers['cookie']);
        }

        // Set the Host header to match the target server
        const targetHost = `${req.params.host}.googlevideo.com`;
        proxyReq.setHeader('Host', targetHost);
    },
    onProxyRes: (proxyRes, req, res) => {
        console.log(`[${new Date().toISOString()}] Response from GoogleVideo: ${proxyRes.statusCode}`);
        console.log(`[${new Date().toISOString()}] Response Headers: ${JSON.stringify(proxyRes.headers)}`);

        if (proxyRes.headers['content-length']) {
            console.log(`[${new Date().toISOString()}] GoogleVideo response Content-Length: ${proxyRes.headers['content-length']}`);
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-expected-content-length, Range');
    },
    onError: (err, req, res) => {
        console.error(`[${new Date().toISOString()}] Proxy error for GoogleVideo: ${err.message}`);
        res.status(500).send('Proxy error occurred while trying to contact GoogleVideo');
    },
    timeout: 1200000,
    proxyTimeout: 1200000,
}));

app.listen(PORT, () => {
    console.log(`Express Proxy server is running at http://localhost:${PORT}`);
});
