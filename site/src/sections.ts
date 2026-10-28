import {
  Bot,
  Download,
  MonitorDown,
  PictureInPicture2,
  ShieldCheck,
  type LucideIcon
} from 'lucide-react'

export interface Section {
  id: string
  label: string
  icon: LucideIcon
  tone: 'red' | 'blue' | 'plain'
}

export const SECTIONS: Section[] = [
  { id: 'downloader', label: 'Downloader', icon: Download, tone: 'red' },
  { id: 'discord', label: 'Discord bot', icon: Bot, tone: 'blue' },
  { id: 'quick-actions', label: 'Quick Actions', icon: PictureInPicture2, tone: 'plain' },
  { id: 'setup', label: 'Setup', icon: ShieldCheck, tone: 'plain' },
  { id: 'install', label: 'Install', icon: MonitorDown, tone: 'plain' }
]
