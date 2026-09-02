/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NEXT_DIST_DIR lets a dev server run alongside the production `next start`
  // in this folder without overwriting its .next build output.
  distDir: process.env.NEXT_DIST_DIR || '.next',
}

module.exports = nextConfig
