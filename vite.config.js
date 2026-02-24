import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'; // 引入 fs 模組來讀取憑證檔案
import path from 'path'; // 引入 path 模組用於路徑別名

console.log(`[VITE-CONFIG-LOAD] ${new Date().toISOString()} - vite.config.js file is being parsed.`);
import { visualizer } from 'rollup-plugin-visualizer'; // 引入 visualizer

// 自訂插件用於記錄 IP 和請求
const MyIpLoggerPlugin = () => {
  console.log(`[MY-PLUGIN-INIT] ${new Date().toISOString()} - MyIpLoggerPlugin initialized.`);
  return {
    name: 'my-ip-logger-plugin',
    configureServer(server) {
      console.log(`[MY-PLUGIN-CONFIGURESERVER] ${new Date().toISOString()} - Plugin's configureServer hook is being executed.`);
      server.middlewares.use((req, res, next) => {
        // Generate timestamp in Asia/Taipei timezone
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('sv-SE', { // sv-SE gives YYYY-MM-DD HH:MM:SS like format
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          fractionalSecondDigits: 3,
          hour12: false,
          timeZone: 'Asia/Taipei'
        });
        const timestamp = formatter.format(now).replace(' ', 'T') + ' (Asia/Taipei)';

        // Only log IP for initial HTML page requests
        if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
          const clientIpFromReal = req.headers['x-real-ip'];
          const clientIpFromForwarded = req.headers['x-forwarded-for']?.split(',')[0].trim();
          const clientIp = clientIpFromReal || clientIpFromForwarded;

          if (clientIp) {
            const userAgent = req.headers['user-agent'] || 'N/A';
            const userAgentDisplayLength = 95; // Further increased length for User-Agent
            const userAgentShort = userAgent.length > userAgentDisplayLength ? userAgent.substring(0, userAgentDisplayLength) + '...' : userAgent;
            // Human-readable plain text log format
            console.log(`[WEB_ACCESS] ${timestamp} | IP: ${clientIp} | URL: ${req.url} | Agent: ${userAgentShort}`);
          } else {
            // Log if IP is not found
            console.log(`[WEB_ACCESS_IP_NOT_FOUND] ${timestamp} | URL: ${req.url} | x-real-ip: [${req.headers['x-real-ip']}], x-forwarded-for: [${req.headers['x-forwarded-for']}]`);
          }
        }

        // API endpoint logic (kept for potential future use, does not log IP itself unless called)
        // Note: If /api/get-ip is called, it will be logged by the above if statement if req.url matches.
        // If you want /api/get-ip to *always* log, it needs its own logging logic or be excluded from the conditional.
        // For now, it's fine as is, as the primary goal is logging initial page access.
        if (req.url === '/api/get-ip') {
          // This logic is for the API response, not for general logging here.
          // The IP logging for this specific path would have happened above if it's a GET request to '/api/get-ip'.
          // However, the current condition is `req.url === '/' || req.url.startsWith('/?')`.
          // If you want /api/get-ip to also log IP, you'd add it to the condition or have separate logic.
          // For simplicity, we assume /api/get-ip is not the "initial page access" point.
          const clientIpFromReal = req.headers['x-real-ip']; // Re-fetch for API context if needed
          const clientIpFromForwarded = req.headers['x-forwarded-for']?.split(',')[0].trim(); // Re-fetch
          const clientIp = clientIpFromReal || clientIpFromForwarded;

          if (clientIp) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ip: clientIp }));
          } else {
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Client IP not found in request headers.' }));
          }
          return;
        }
        next();
      });
    }
  };
};

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  console.log(`[VITE-CONFIG-DEFINE] ${new Date().toISOString()} - defineConfig called. Command: ${command}`);
  // HTTPS 由 Nginx 處理（SSL Termination），容器內使用 HTTP
  // 這樣可以避免雙重加密，提高性能
  let httpsConfig = false;

  return {
    // 生產環境時移除 console 和 debugger (提升效能和減少包大小)
    esbuild: {
      drop: command === 'build' ? ['console', 'debugger'] : [],
    },
    // 路徑別名配置 (支持 @/ 導入)
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // configureServer: (server) => { ... }, // <-- 原來的 configureServer 已移至插件
    plugins: [
      react(),
      MyIpLoggerPlugin(), // <-- 加入自訂插件
      // 只在 build 指令時啟用 visualizer (open: false 避免在 Docker 中打開瀏覽器)
      ...(command === 'build' ? [visualizer({ open: false, gzipSize: true, brotliSize: true, filename: 'stats.html' })] : []),
    ],
    server: {
      host: '0.0.0.0', // 監聽所有網絡接口
      port: 13579,
      strictPort: true,
      https: httpsConfig, // 使用 HTTPS
      hmr: {
        // 只配置客戶端如何連接，不改變服務器監聽地址
        clientPort: 443, // 客戶端通過 Nginx 的 443 端口連接
        path: '/ws', // WebSocket 路徑（Nginx 會代理到容器的 13579）
      },
      allowedHosts: ['koimsurai.blogsyte.com', 'localhost'], // 允許此主機訪問
      proxy: {
        // 將 /api 的請求代理到後端服務
        '/api': {
          // Docker compose service name is 'backend', port is 3000
          target: command === 'build' ? (process.env.BACKEND_URL || 'http://backend:3000') : 'http://localhost:3000',
          changeOrigin: true, // 改變請求來源，對於虛擬主機是必要的
          configure: (proxy, options) => {
            proxy.on('error', (err, req, res) => {
              console.log('[VITE-PROXY-ERROR]', err);
            });
            proxy.on('proxyReq', (proxyReq, req, res) => {
              console.log(`[VITE-PROXY-REQ] Sending request: ${req.method} ${req.url} to ${options.target}${proxyReq.path}`);
            });
          }
        },
        '/rss': {
          target: command === 'build' ? (process.env.BACKEND_URL || 'http://backend:3000') : 'http://localhost:3000',
          changeOrigin: true,
        },
        // LLM API proxy — 前端 AI 文章產生器直接呼叫 copilot-api
        '/llm-api': {
          // For Docker, localhost refers to the container. We need host machine.
          // Try host.docker.internal (needs extra_hosts in compose) or allow ENV override.
          // Fallback to localhost for dev mode.
          target: process.env.LLM_API_URL || 'http://localhost:4141/v1',
          changeOrigin: true,
          timeout: 300000,        // 5 分鐘，多段生成需要更多時間
          proxyTimeout: 300000,
          rewrite: (path) => path.replace(/^\/llm-api/, ''),
          configure: (proxy, options) => {
            proxy.on('error', (err, req, res) => {
              console.log('[LLM-PROXY-ERROR]', err.message);
            });
            proxy.on('proxyRes', (proxyRes, req, res) => {
              console.log(`[LLM-PROXY-RES] ${req.method} ${req.url} → ${proxyRes.statusCode}`);
            });
          }
        },
      },
    },
    preview: { // Add explicit preview server config
      host: true, // Listen on all hosts (important for Docker)
      port: 13579, // Match the desired port
      // HTTPS is disabled
    },
    assetsInclude: ['**/*.JPG'], // 告訴 Vite 將 .JPG 視為靜態資源
    optimizeDeps: {
      include: [
        'tsparticles-slim',
        'react-tsparticles',
        'three',
        '@react-three/fiber',
        '@react-three/drei',
        '@react-spring/three',
        '@react-spring/core'
      ], // 同時包含引擎和 React 元件以及 3D 相關庫
    },
  }
})
