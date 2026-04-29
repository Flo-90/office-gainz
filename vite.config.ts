import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  new Date().toISOString()

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'inject-build-meta',
      transformIndexHtml(html) {
        return html.replace(
          '</head>',
          `    <meta name="officegainz-build" content="${buildId}" />\n  </head>`,
        )
      },
    },
  ],
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
})
