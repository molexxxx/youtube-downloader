import { useState } from 'react'
import { Bar } from './components/Bar'
import { Hero } from './components/Hero'
import { LightboxProvider } from './components/Lightbox'
import { Rail } from './components/Rail'
import { ReleaseDetails } from './components/ReleaseDetails'
import {
  Discord,
  Features,
  Footer,
  HowItWorks,
  Install,
  QuickActions,
  Setup
} from './components/Sections'
import { useActiveSection, useRelease } from './hooks'
import { currentPlatform } from './platform'
import { SECTIONS } from './sections'

const SECTION_IDS = SECTIONS.map(({ id }) => id)

export function App() {
  const release = useRelease()
  const [platform] = useState(currentPlatform)
  const active = useActiveSection(SECTION_IDS)

  return (
    <LightboxProvider>
      <a className="skip" href="#content">
        Skip to content
      </a>
      <div className="shell">
        <Rail active={active} />
        <div className="stage">
          <Bar active={active} />
          <main id="content">
            <section id="downloader" className="group" aria-labelledby="hero-title">
              <Hero release={release} platform={platform} />
              <aside className="release-inline" aria-label="Latest release">
                <div className="release-box">
                  <ReleaseDetails release={release} platform={platform} />
                </div>
              </aside>
              <HowItWorks />
              <Features />
            </section>
            <Discord />
            <QuickActions />
            <Setup />
            <Install release={release} />
          </main>
          <Footer />
        </div>
        <aside className="panel" aria-label="Latest release">
          <ReleaseDetails release={release} platform={platform} />
        </aside>
      </div>
    </LightboxProvider>
  )
}
