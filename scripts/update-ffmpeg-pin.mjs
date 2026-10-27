#!/usr/bin/env node
/**
 * Maintains src/main/binaries/ffmpeg/pinned-builds.json, the FFmpeg builds the app downloads. Developer tool, not
 * shipped. A pin bump is an ordinary source change that reaches users with the next app release.
 *
 *   node scripts/update-ffmpeg-pin.mjs --check [--download]
 *     Verifies every pinned asset against its source without changing the pin: GitHub assets against the release
 *     API's size and sha256 digest, martin-riedl assets against their .sha256 file and Content-Length. --download also
 *     streams each asset and hashes the bytes. A held platform must still install its held build. A mismatch, a
 *     vanished asset, or a pin that no longer honors a hold is reported and exits 1.
 *
 *   node scripts/update-ffmpeg-pin.mjs [--branch 9.0] [--dry-run]
 *     Finds the newest month-end BtbN autobuild tag that carries a release-branch asset set for Windows and Linux
 *     (the newest branch, or --branch), the GyanD full build of the same version, and martin-riedl's release builds
 *     through their redirect URLs; downloads every asset, compares it with the published digest, and rewrites the pin
 *     (--dry-run prints it instead). Every source must name the same version, except a platform in HOLDS, which pins
 *     its held martin-riedl release folder and carries that release's version.
 *
 * Every run prints each hold and its reason.
 *
 * Set GITHUB_TOKEN to raise the GitHub API rate limit.
 */
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PIN_PATH = path.join(
  ROOT,
  'src',
  'main',
  'binaries',
  'ffmpeg',
  'pinned-builds.json'
)
const MRIEDL = 'https://ffmpeg.martin-riedl.de'
const USER_AGENT = 'youtube-downloader-pin-update'

const BTBN_TARGETS = [
  ['win32-x64', 'win64', 'zip'],
  ['win32-arm64', 'winarm64', 'zip'],
  ['linux-x64', 'linux64', 'tar.xz'],
  ['linux-arm64', 'linuxarm64', 'tar.xz']
]

const MRIEDL_TARGETS = [
  ['linux-x64', 'linux', 'amd64'],
  ['linux-arm64', 'linux', 'arm64'],
  ['darwin-arm64', 'macos', 'arm64'],
  ['darwin-x64', 'macos', 'amd64']
]

/**
 * Platforms held at one martin-riedl release folder instead of the newest release, keyed by pin key, each with
 * `folder` (such as 1741000090_7.1.1) and the `reason` it is held. A held platform installs only that build, with no
 * fallback, and names its own version in the pin. Lift a hold once the newer release no longer shows the problem.
 */
const HOLDS = {}

const HELD_FOLDER = /^\d+_(\d+(?:\.\d+)+)$/

const BTBN_ASSET =
  /^ffmpeg-n(\d+\.\d+(?:\.\d+)?)-(\d+)-g([0-9a-f]+)-(win64|winarm64|linux64|linuxarm64)-gpl-(\d+\.\d+)\.(zip|tar\.xz)$/
const MONTHLY_TAG = /^autobuild-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})$/
const MRIEDL_PATH =
  /^\/download\/(linux|macos)\/(amd64|arm64)\/(\d+)_([^/]+)\/(ffmpeg|ffprobe)\.zip$/

function fail(message) {
  console.error(message)
  process.exit(1)
}

function args() {
  const argv = process.argv.slice(2)
  const value = (name) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : undefined
  }
  return {
    check: argv.includes('--check'),
    download: argv.includes('--download'),
    dryRun: argv.includes('--dry-run'),
    branch: value('--branch')
  }
}

/** Every hold with its martin-riedl target and the version its folder names; fails on a hold the rewrite cannot honor. */
function holds() {
  return Object.entries(HOLDS).map(([key, hold]) => {
    const target = MRIEDL_TARGETS.find(([k]) => k === key)
    const m = HELD_FOLDER.exec(hold.folder)
    if (!target || !m) {
      fail(
        `The hold on ${key} must name a martin-riedl platform and a release folder such as 1741000090_7.1.1`
      )
    }
    return {
      key,
      os: target[1],
      arch: target[2],
      folder: hold.folder,
      version: m[1],
      reason: hold.reason
    }
  })
}

function announce(held) {
  for (const hold of held) {
    console.log(
      `HOLD ${hold.key} at martin-riedl ${hold.folder} (FFmpeg ${hold.version}): ${hold.reason}`
    )
  }
}

/** The download folder URL of a hold, which every asset of the held platform must live in. */
function heldBase(hold) {
  return `${MRIEDL}/download/${hold.os}/${hold.arch}/${hold.folder}/`
}

async function request(url, init = {}) {
  const headers = { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) }
  return fetch(url, { ...init, headers })
}

async function github(pathname) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }
  if (process.env.GITHUB_TOKEN)
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const res = await request(`https://api.github.com/${pathname}`, { headers })
  if (res.status === 404) return null
  if (!res.ok) fail(`GitHub API ${pathname} answered ${res.status}: ${await res.text()}`)
  return res.json()
}

async function githubReleases(repo) {
  const all = []
  for (let page = 1; page <= 10; page++) {
    const batch = await github(`repos/${repo}/releases?per_page=100&page=${page}`)
    if (!batch || batch.length === 0) break
    all.push(...batch)
  }
  return all
}

/** Streams a URL and returns its size and SHA-256; never holds the body in memory. */
async function hashUrl(url) {
  const res = await request(url)
  if (!res.ok) return { status: res.status, bytes: 0, sha256: '' }
  const hash = createHash('sha256')
  let bytes = 0
  let shown = 0
  for await (const chunk of res.body) {
    hash.update(chunk)
    bytes += chunk.byteLength
    if (bytes - shown >= 32 * 1048576) {
      shown = bytes
      process.stderr.write(
        `  ${path.posix.basename(new URL(url).pathname)}: ${(bytes / 1048576).toFixed(0)} MB\r`
      )
    }
  }
  process.stderr.write('\n')
  return { status: res.status, bytes, sha256: hash.digest('hex') }
}

async function mriedlDigest(url) {
  const res = await request(`${url}.sha256`)
  if (!res.ok) return { status: res.status, sha256: '' }
  const text = (await res.text()).trim()
  const sha256 = text.split(/\s+/)[0].toLowerCase()
  return { status: res.status, sha256: /^[0-9a-f]{64}$/.test(sha256) ? sha256 : '' }
}

async function contentLength(url) {
  const res = await request(url, { method: 'HEAD' })
  return { status: res.status, bytes: Number(res.headers.get('content-length') ?? 0) }
}

function githubAssetRef(url) {
  const m =
    /^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/download\/([^/]+)\/([^/]+)$/.exec(
      url
    )
  return m
    ? { repo: m[1], tag: decodeURIComponent(m[2]), name: decodeURIComponent(m[3]) }
    : null
}

/** What the source publishes for one pinned asset: its size and digest, or why it has none. */
async function published(asset, releaseCache) {
  const ref = githubAssetRef(asset.url)
  if (ref) {
    const key = `${ref.repo}@${ref.tag}`
    if (!releaseCache.has(key)) {
      releaseCache.set(
        key,
        await github(`repos/${ref.repo}/releases/tags/${encodeURIComponent(ref.tag)}`)
      )
    }
    const release = releaseCache.get(key)
    if (!release) return { problem: `release ${ref.tag} of ${ref.repo} is gone` }
    const found = release.assets.find((a) => a.name === ref.name)
    if (!found)
      return { problem: `asset ${ref.name} is gone from ${ref.repo} ${ref.tag}` }
    const digest =
      typeof found.digest === 'string' && found.digest.startsWith('sha256:')
        ? found.digest.slice(7)
        : ''
    if (!digest) return { problem: `the API lists no sha256 digest for ${ref.name}` }
    return {
      bytes: found.size,
      sha256: digest,
      via: `GitHub API digest (${ref.repo} ${ref.tag})`
    }
  }
  if (asset.url.startsWith(`${MRIEDL}/download/`)) {
    const digest = await mriedlDigest(asset.url)
    if (!digest.sha256)
      return { problem: `${asset.url}.sha256 answered ${digest.status}` }
    const size = await contentLength(asset.url)
    if (size.status !== 200) return { problem: `${asset.url} answered ${size.status}` }
    return {
      bytes: size.bytes,
      sha256: digest.sha256,
      via: 'martin-riedl .sha256 file and Content-Length'
    }
  }
  return { problem: `no known source for ${asset.url}` }
}

async function check(download, held) {
  const pin = JSON.parse(await readFile(PIN_PATH, 'utf8'))
  const releaseCache = new Map()
  let problems = 0
  console.log(
    `Checking ${PIN_PATH} (pin ${pin.id}, fetched ${pin.fetched}) on ${new Date().toISOString().slice(0, 10)}`
  )
  for (const hold of held) {
    const entry = pin.platforms[hold.key]
    const assets = entry ? [...entry.primary, ...entry.fallback] : []
    const honored =
      entry?.version === hold.version &&
      assets.length > 0 &&
      assets.every((a) => a.url.startsWith(heldBase(hold)))
    if (!honored) problems++
    console.log(
      honored
        ? `${hold.key} installs the held build ${hold.folder}`
        : `HOLD BROKEN: ${hold.key} must install only ${heldBase(hold)} with version ${hold.version}`
    )
  }
  for (const [key, entry] of Object.entries(pin.platforms)) {
    for (const role of ['primary', 'fallback']) {
      for (const asset of entry[role]) {
        const source = await published(asset, releaseCache)
        let verdict
        if (source.problem) verdict = `VANISHED: ${source.problem}`
        else if (source.bytes !== asset.bytes || source.sha256 !== asset.sha256) {
          verdict = `MISMATCH: ${source.via} says ${source.bytes} bytes, ${source.sha256}`
        } else verdict = `ok (${source.via})`
        if (!source.problem && download && verdict.startsWith('ok')) {
          const got = await hashUrl(asset.url)
          verdict =
            got.bytes === asset.bytes && got.sha256 === asset.sha256
              ? `${verdict}, download hashed`
              : `MISMATCH: the download answered ${got.status} with ${got.bytes} bytes, ${got.sha256}`
        }
        if (!verdict.startsWith('ok')) problems++
        console.log(
          `${key} ${role} ${asset.url}\n  ${asset.bytes} bytes, ${asset.sha256}\n  ${verdict}`
        )
      }
    }
  }
  if (problems > 0)
    fail(`${problems} problem(s) found by the check; the pin was not changed`)
  console.log('Every pinned asset matches its source, and every hold is honored.')
}

/** The newest month-end tag (the last build of an earlier month) with all four release-branch assets of one build. */
function pickBtbn(releases, branch) {
  const thisMonth = new Date().toISOString().slice(0, 7)
  const byMonth = new Map()
  for (const release of releases) {
    const m = MONTHLY_TAG.exec(release.tag_name)
    if (!m) continue
    const month = `${m[1]}-${m[2]}`
    if (month === thisMonth) continue
    const current = byMonth.get(month)
    if (!current || release.tag_name > current.tag_name) byMonth.set(month, release)
  }
  const monthEnds = [...byMonth.values()].sort((a, b) =>
    a.tag_name < b.tag_name ? 1 : -1
  )
  for (const release of monthEnds) {
    const sets = new Map()
    for (const a of release.assets) {
      const m = BTBN_ASSET.exec(a.name)
      if (!m) continue
      const [, version, count, hash, target, assetBranch, ext] = m
      if (branch && assetBranch !== branch) continue
      const id = `${version}-${count}-g${hash}`
      if (!sets.has(id))
        sets.set(id, { version, id, branch: assetBranch, assets: new Map() })
      sets.get(id).assets.set(target, { ...a, ext })
    }
    const complete = [...sets.values()]
      .filter((s) =>
        BTBN_TARGETS.every(([, target, ext]) => s.assets.get(target)?.ext === ext)
      )
      .sort((a, b) => Number.parseFloat(b.branch) - Number.parseFloat(a.branch))
    if (complete.length > 0) return { release, set: complete[0] }
  }
  return null
}

function githubAsset(build, a, kind) {
  const sha256 =
    typeof a.digest === 'string' && a.digest.startsWith('sha256:')
      ? a.digest.slice(7)
      : ''
  if (!sha256) fail(`The GitHub API lists no sha256 digest for ${a.name}`)
  return {
    build,
    url: a.browser_download_url,
    bytes: a.size,
    sha256,
    kind,
    contains: ['ffmpeg', 'ffprobe']
  }
}

async function mriedlLatest(os, arch, tool, version) {
  const res = await request(
    `${MRIEDL}/redirect/latest/${os}/${arch}/release/${tool}.zip`,
    {
      redirect: 'manual'
    }
  )
  await res.body?.cancel()
  const location = res.headers.get('location')
  const m = location ? MRIEDL_PATH.exec(new URL(location, MRIEDL).pathname) : null
  if (!m) {
    fail(
      `martin-riedl's ${os}/${arch} ${tool} release redirect answered ${res.status} ${location ?? ''}`
    )
  }
  if (m[4] !== version) {
    fail(
      `martin-riedl's latest ${os}/${arch} release is ${m[4]}, not ${version}; pin it by hand or wait for the release`
    )
  }
  return new URL(location, MRIEDL).toString()
}

/** martin-riedl's ffmpeg and ffprobe zips: from the hold's folder when one is given, else the latest release, which must be `version`. */
async function mriedlAssets(os, arch, version, hold) {
  const out = []
  for (const tool of ['ffmpeg', 'ffprobe']) {
    const url = hold
      ? `${heldBase(hold)}${tool}.zip`
      : await mriedlLatest(os, arch, tool, version)
    const digest = await mriedlDigest(url)
    if (!digest.sha256) fail(`${url}.sha256 answered ${digest.status}`)
    const size = await contentLength(url)
    out.push({
      build: `mriedl-${hold?.version ?? version}`,
      url,
      bytes: size.bytes,
      sha256: digest.sha256,
      kind: 'zip',
      contains: [tool]
    })
  }
  return out
}

function format(pin) {
  return `${JSON.stringify(pin, null, 2).replace(
    /"contains": \[\s*([^\]]*?)\s*\]/g,
    (_, list) => `"contains": [${list.split(/,\s*/).join(', ')}]`
  )}\n`
}

async function update(branch, dryRun, held) {
  const holdOf = new Map(held.map((hold) => [hold.key, hold]))
  const picked = pickBtbn(await githubReleases('BtbN/FFmpeg-Builds'), branch)
  if (!picked) fail('No month-end BtbN tag carries a complete release-branch asset set')
  const { release, set } = picked
  const version = set.version
  const btbnId = `btbn-n${set.id}`
  console.log(`BtbN ${release.tag_name}: n${set.id} (branch ${set.branch})`)

  const gyan = await github(
    `repos/GyanD/codexffmpeg/releases/tags/${encodeURIComponent(version)}`
  )
  const gyanAsset = gyan?.assets.find(
    (a) => a.name === `ffmpeg-${version}-full_build.zip`
  )
  if (!gyanAsset)
    fail(`GyanD/codexffmpeg has no ffmpeg-${version}-full_build.zip release`)

  const platforms = {}
  for (const [key, target, kind] of BTBN_TARGETS) {
    if (holdOf.has(key)) continue
    platforms[key] = {
      primary: [githubAsset(btbnId, set.assets.get(target), kind)],
      fallback: []
    }
  }
  platforms['win32-x64'].fallback = [
    githubAsset(`gyan-${version}-full`, gyanAsset, 'zip')
  ]
  for (const [key, os, arch] of MRIEDL_TARGETS) {
    const hold = holdOf.get(key)
    const assets = await mriedlAssets(os, arch, version, hold)
    if (hold) platforms[key] = { version: hold.version, primary: assets, fallback: [] }
    else if (platforms[key]) platforms[key].fallback = assets
    else platforms[key] = { primary: assets, fallback: [] }
  }

  for (const [key, entry] of Object.entries(platforms)) {
    for (const asset of [...entry.primary, ...entry.fallback]) {
      console.log(`${key} ${asset.url}`)
      const got = await hashUrl(asset.url)
      if (got.bytes !== asset.bytes || got.sha256 !== asset.sha256) {
        fail(
          `MISMATCH: published ${asset.bytes} bytes ${asset.sha256}, downloaded ${got.bytes} bytes ${got.sha256} (status ${got.status})`
        )
      }
      console.log(`  ${asset.bytes} bytes, ${asset.sha256} verified`)
    }
  }

  const tagDate = MONTHLY_TAG.exec(release.tag_name).slice(1, 4).join('-')
  const pin = {
    id: `${version}-${tagDate}`,
    version,
    fetched: new Date().toISOString().slice(0, 10),
    platforms
  }
  if (dryRun) {
    process.stdout.write(format(pin))
    return
  }
  await writeFile(PIN_PATH, format(pin))
  console.log(
    `Wrote ${PIN_PATH}. Commit the pin bump on its own, linking the release notes of FFmpeg ${version}.`
  )
}

const options = args()
const held = holds()
announce(held)
if (options.check) await check(options.download, held)
else await update(options.branch, options.dryRun, held)
