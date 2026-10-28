import { Bot } from 'lucide-react'
import {
  formatSize,
  LATEST_URL,
  REPO_URL,
  RELEASES_URL,
  type InstallerKind,
  type ReleaseSummary
} from '../release'
import { Ledger } from './Ledger'
import { BrandMark } from './Marks'
import { Steps } from './Steps'
import { Window } from './Window'

const STAGE_SIZES = '(min-width: 1180px) calc(100vw - 520px), calc(100vw - 40px)'

export function HowItWorks() {
  return (
    <section className="block" aria-labelledby="how-title">
      <h2 id="how-title">How it works</h2>
      <p className="lead">
        The app sets up and updates its own copies of yt-dlp and FFmpeg, so there is
        nothing else to install. It needs no account or API key.
      </p>
      <Steps />
    </section>
  )
}

export function Features() {
  return (
    <section className="block" aria-labelledby="features-title">
      <h2 id="features-title">What the downloader handles</h2>
      <Ledger
        rows={[
          {
            label: 'Links and search',
            body: 'Videos, playlists, channels, and Mixes from a link, or a YouTube search with no API key. A link to one video inside a playlist asks whether you want the video or the whole list.',
            detail: 'Video · Playlist · Channel · Mix'
          },
          {
            label: 'Exact formats',
            body: 'Six one-click presets, or a specific resolution, frame rate, and codec up to 4K, always merged with the best audio.',
            detail: 'H.264 · VP9 · AV1'
          },
          {
            label: 'Video or audio',
            body: 'MP4 or MKV video, or audio alone as MP3, M4A, Opus, FLAC, or WAV.',
            detail: '96 to 320 kbps'
          },
          {
            label: 'Post-processing',
            body: 'Embed the thumbnail, metadata, and chapters; download subtitles; cut sponsor, self-promotion, intro, and outro segments with SponsorBlock; skip files you already have.',
            detail: 'SponsorBlock'
          },
          {
            label: 'Sign-in when needed',
            body: 'Import cookies from your browser for age-restricted, private, or members-only videos. Downloads retry with cookies when YouTube asks for sign-in.',
            detail: 'Cookies from your browser'
          },
          {
            label: 'Queue and history',
            body: 'Downloads run side by side with live speed, ETA, and desktop notifications, and a history you can replay or open in its folder.',
            detail: 'Up to 8 at once'
          },
          {
            label: 'Preview',
            body: 'Watch any result in the app before you download it.'
          },
          {
            label: 'Themes',
            body: 'Follow the system, or pick dark or light.',
            detail: 'System · Dark · Light'
          }
        ]}
      />
    </section>
  )
}

const COMMANDS: [string, string][] = [
  ['/play query', 'Play a song or playlist (YouTube link or search text)'],
  ['/search query', 'Search YouTube and pick one of the top 5 results to queue'],
  ['/skip', 'Skip the current track'],
  ['/stop', 'Stop playback and clear the queue'],
  ['/pause', 'Pause playback'],
  ['/resume', 'Resume playback'],
  ['/queue', 'Show the current queue'],
  ['/nowplaying', 'Show the current track'],
  ['/shuffle', 'Shuffle the upcoming queue'],
  ['/clear', 'Clear the upcoming queue'],
  ['/join', 'Join your voice channel'],
  ['/leave', 'Leave the voice channel'],
  ['/loop mode', 'Set the loop mode (off, track, or queue)'],
  ['/volume percent', 'Set playback volume (0 to 100)'],
  ['/remove position', 'Remove a track from the queue by position']
]

export function Discord() {
  return (
    <section id="discord" className="group signal-blue" aria-labelledby="discord-title">
      <div className="block">
        <div className="title-row">
          <span className="bot-tile" aria-hidden="true">
            <Bot size={22} strokeWidth={2} />
          </span>
          <h2 id="discord-title">Your own Discord music bot</h2>
        </div>
        <p className="lead">
          The app can also run a music bot for your Discord servers. It plays through the
          same yt-dlp and FFmpeg on your computer, so it is free and has no subscription.
          Slash commands in Discord and the controls in the app drive one player and stay
          in sync.
        </p>
        <Window
          name="discord"
          sizes={STAGE_SIZES}
          alt="The Discord Bot tab: Caminandes 3 playing in the Theater voice channel with playback controls, beside an Up next queue of ten tracks."
        />
      </div>

      <div className="block split">
        <div className="split-text">
          <h3>Effects per server</h3>
          <p>
            Speed, pitch, a bass, mid, and treble equalizer, character effects (karaoke,
            tremolo, vibrato, 8D, echo), and presets such as Nightcore, Slowed, and Bass
            Boost. Changing an effect restarts the current track at the same position.
          </p>
        </div>
        <Window
          name="effects"
          className="window-detail"
          sizes="(min-width: 760px) 578px, calc(100vw - 40px)"
          alt="The Audio effects panel with the Bass Boost preset: bass at +9 dB, treble at +2 dB, speed and pitch at 1.00x."
        />
      </div>

      <div className="block">
        <Ledger
          rows={[
            {
              label: 'Plays',
              body: 'YouTube links and playlists, your finished downloads, and audio files you add from your computer.'
            },
            {
              label: 'Queue control',
              body: 'Play next, reorder, seek, shuffle, loop, and a volume remembered per server, from the app or from Discord.'
            },
            {
              label: 'Several servers',
              body: 'Each server keeps its own queue and activity log, with an optional role that limits who can use slash commands, and an option to leave voice when the queue ends.'
            },
            {
              label: 'Encrypted voice',
              body: 'Supports Discord’s end-to-end encrypted voice (DAVE).'
            },
            {
              label: 'Your token',
              body: 'Encrypted with your operating system’s secure storage: Keychain on macOS, DPAPI on Windows, the Secret Service on Linux. On Linux without a keyring service, it is stored unencrypted in the app’s settings file.'
            }
          ]}
        />
      </div>

      <div className="block split split-even">
        <div>
          <h3>What you need</h3>
          <ul className="plain-list">
            <li>
              A bot token from the{' '}
              <a href="https://discord.com/developers/applications">
                Discord Developer Portal
              </a>
              . The app walks you through creating one.
            </li>
            <li>
              Permission to add a bot to your server. The invite asks only for View
              Channels, Send Messages, Embed Links, Connect, and Speak, and the bot needs
              no privileged intents.
            </li>
            <li>
              Your computer on and the app running while people listen. Launch at login
              and close to tray keep it online.
            </li>
          </ul>
        </div>
        <div>
          <h3>Slash commands</h3>
          <dl className="commands">
            {COMMANDS.map(([command, description]) => (
              <div key={command}>
                <dt>
                  <code>{command}</code>
                </dt>
                <dd>{description}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}

export function QuickActions() {
  return (
    <section id="quick-actions" className="group" aria-labelledby="quick-title">
      <div className="block">
        <h2 id="quick-title">Quick Actions, always on top</h2>
        <p className="lead">
          A compact window that stays above everything else, in three sizes, for downloads
          and bot control. Close the main window to the tray, launch at login on Windows,
          macOS, or Linux, and start minimized.
        </p>
        <div className="minis">
          <Window
            name="mini-download"
            className="window-mini"
            sizes="(min-width: 760px) 380px, 45vw"
            caption="Paste a link and download without opening the main window."
            alt="Quick Actions on the Download tab: a link field, Video and Audio choices, and a Download button above three active downloads."
          />
          <Window
            name="mini-discord"
            className="window-mini"
            sizes="(min-width: 760px) 380px, 45vw"
            caption="Control playback, the voice channel, and the queue."
            alt="Quick Actions on the Discord tab: the server tiles, the track playing, playback controls, the Theater voice channel, and the Up next list."
          />
        </div>
      </div>
    </section>
  )
}

export function Setup() {
  return (
    <section id="setup" className="group" aria-labelledby="setup-title">
      <div className="block">
        <h2 id="setup-title">It sets itself up and stays current</h2>
        <p className="lead">
          On first launch, a short setup offers the app’s own verified copies of yt-dlp
          and FFmpeg, or copies already on your computer, and installs them with one
          click.
        </p>
        <Window
          name="setup"
          sizes={STAGE_SIZES}
          alt="The setup screen: the app’s own copies of yt-dlp and FFmpeg selected and marked Recommended, the option to use copies on this computer, and an Install and test button."
        />
        <Ledger
          rows={[
            {
              label: 'Self-tests',
              body: 'Every copy of yt-dlp and FFmpeg is tested before use and after each update.'
            },
            {
              label: 'Verified yt-dlp',
              body: 'Checked once a day or on demand. A release installs only after it matches the checksums signed by the yt-dlp release key, and never while a download or playback is using yt-dlp.',
              detail: 'Signed checksums'
            },
            {
              label: 'Pinned FFmpeg',
              body: 'Each app version pins exact FFmpeg builds by size and SHA-256, so every install runs the tested build.',
              detail: 'SHA-256'
            },
            {
              label: 'App updates',
              body: 'The app updates itself from GitHub Releases.'
            },
            {
              label: 'Private',
              body: 'No account and no telemetry. The app only talks to YouTube, GitHub, the FFmpeg download host, SponsorBlock when you turn it on, and Discord while the bot is connected.'
            },
            {
              label: 'Logs',
              body: 'When a download fails, Logs in the title bar shows yt-dlp’s own message.'
            }
          ]}
        />
      </div>
    </section>
  )
}

const SYSTEMS: { kind: InstallerKind; system: string; file: string; needs: string }[] = [
  {
    kind: 'exe',
    system: 'Windows',
    file: 'Windows-Setup.exe',
    needs: 'Windows 10 or 11, 64-bit (x64)'
  },
  {
    kind: 'dmg',
    system: 'macOS',
    file: 'macOS-Installer.dmg',
    needs: 'Apple Silicon (M1 or later), macOS 13 or later'
  },
  { kind: 'deb', system: 'Linux', file: 'Linux-Installer.deb', needs: '64-bit (x64)' },
  { kind: 'rpm', system: 'Linux', file: 'Linux-Installer.rpm', needs: '64-bit (x64)' }
]

export function Install({ release }: { release: ReleaseSummary | null }) {
  return (
    <section id="install" className="group" aria-labelledby="install-title">
      <div className="block">
        <h2 id="install-title">Install</h2>
        <p className="lead">
          Download the file for your system. The app keeps itself updated after that.
        </p>
        <table className="systems">
          <thead>
            <tr>
              <th scope="col">System</th>
              <th scope="col">File</th>
              <th scope="col">Requirements</th>
              <th scope="col" className="systems-size">
                Size
              </th>
            </tr>
          </thead>
          <tbody>
            {SYSTEMS.map(({ kind, system, file, needs }) => {
              const installer = release?.installers.find(
                (candidate) => candidate.kind === kind
              )
              return (
                <tr key={kind}>
                  <th scope="row">{system}</th>
                  <td>
                    <a href={installer?.url ?? LATEST_URL}>{installer?.name ?? file}</a>
                  </td>
                  <td>{needs}</td>
                  <td className="systems-size numeral">
                    {installer ? formatSize(installer.size) : ''}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <ul className="plain-list notes-list">
          <li>
            <strong>First launch:</strong> setup downloads yt-dlp and FFmpeg, about 220 MB
            on Windows, 190 MB on Linux, and 95 MB on macOS.
          </li>
          <li>
            <strong>Windows SmartScreen:</strong> the installer is not code-signed yet, so
            Windows may say “Windows protected your PC”. Choose More info, then Run
            anyway.
          </li>
          <li>
            <strong>Intel Macs</strong> are not supported: Discord’s encrypted voice
            module cannot be built into a universal macOS app.
          </li>
          <li>
            The <code>.yml</code> files and the macOS <code>Updater.zip</code> on the{' '}
            <a href={RELEASES_URL}>release page</a> are for the built-in updater; you do
            not need them.
          </li>
        </ul>
      </div>

      <div className="block split split-even">
        <div>
          <h3>If something goes wrong</h3>
          <Ledger
            rows={[
              {
                label: 'Sign-in prompts',
                body: 'For “Sign in to confirm your age” or “confirm you’re not a bot”, open Settings, then Cookies, and import cookies from the browser you are signed in with. Close that browser completely first.'
              },
              {
                label: 'A failed download',
                body: 'Open Logs to see yt-dlp’s message. YouTube changes often; in Settings, yt-dlp & FFmpeg, Check now installs the latest yt-dlp.'
              },
              {
                label: 'A silent bot',
                body: 'Give it the Connect and Speak permissions in that voice channel, then join a channel from the app or with /join.'
              }
            ]}
          />
        </div>
        <div>
          <h3>Build from source</h3>
          <p>
            You need <a href="https://nodejs.org">Node.js</a> 22 and npm.
          </p>
          <pre className="code">
            <code>
              {[
                'git clone https://github.com/molexxxx/youtube-downloader.git',
                'cd youtube-downloader',
                'npm ci --legacy-peer-deps',
                'npm run dev'
              ].join('\n')}
            </code>
          </pre>
          <p>
            Found a bug or have an idea?{' '}
            <a href={`${REPO_URL}/issues/new/choose`}>Open an issue</a> and include what
            Logs shows.
          </p>
        </div>
      </div>
    </section>
  )
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-brand">
        <BrandMark size={28} />
        <span>YouTube Downloader</span>
      </div>
      <nav className="footer-links" aria-label="Project">
        <a href={REPO_URL}>Source on GitHub</a>
        <a href={RELEASES_URL}>Releases</a>
        <a href={`${REPO_URL}/issues/new/choose`}>Report a bug</a>
        <a href={`${REPO_URL}/blob/main/LICENSE`}>MIT license</a>
      </nav>
      <p>
        Screenshots use mock data showing Creative Commons Attribution works: films by the
        Blender Foundation (Big Buck Bunny, Cosmos Laundromat, Caminandes 3, Glass Half,
        HERO, The Daily Dweebs) and music by Kevin MacLeod (incompetech.com).
      </p>
      <p>
        Downloads are your responsibility. Respect the terms of service of the sites you
        use and the rights of content creators. Not affiliated with YouTube, Google, or
        Discord.
      </p>
    </footer>
  )
}
