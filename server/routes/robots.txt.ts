import { defineEventHandler, setHeader } from 'nitro/h3';

// serve.mjs 的 /robots.txt 移植。用 route 而非 public/ 靜態檔,因為 Sitemap 那行要吃 SITE_URL env。
const SITE_URL = process.env.SITE_URL || 'https://koimsurai.com';

const ROBOTS = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /admin/*
Disallow: /api/

Sitemap: ${SITE_URL}/sitemap.xml
`;

export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'text/plain');
  return ROBOTS;
});
