import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fetchReleases, summarize, type ReleaseSummary } from './src/release'

export default defineConfig(async () => {
  let snapshot: ReleaseSummary | null = null
  try {
    snapshot = summarize(await fetchReleases(process.env.GITHUB_TOKEN))
  } catch (err) {
    console.warn(`Release snapshot unavailable, the page will load it at runtime: ${err}`)
  }
  return {
    base: '/youtube-downloader/',
    plugins: [react()],
    define: { __RELEASE_SNAPSHOT__: JSON.stringify(snapshot) },
    build: { target: 'es2022', assetsInlineLimit: 0 }
  }
})
