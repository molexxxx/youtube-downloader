import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import type { SelfTestReport } from '@shared/types'

/** Every check of a self-test: a pass, a required failure, or an optional feature that would not work. */
export function SelfTestList({ report }: { report: SelfTestReport }): React.JSX.Element {
  return (
    <ul className="space-y-1.5" aria-label="Self-test results">
      {report.checks.map((check) => (
        <li key={check.id} className="flex items-start gap-2 text-xs">
          {check.ok ? (
            <CheckCircle2
              size={14}
              className="mt-px shrink-0 text-[var(--t-ok)]"
              aria-label="Passed"
            />
          ) : check.required ? (
            <XCircle
              size={14}
              className="mt-px shrink-0 text-[var(--t-red)]"
              aria-label="Failed"
            />
          ) : (
            <AlertTriangle
              size={14}
              className="mt-px shrink-0 text-[var(--t-warn)]"
              aria-label="Unavailable"
            />
          )}
          <span className="min-w-0">
            <span className="text-[var(--t-fg)]">{check.label}</span>
            <span className="block break-words text-[var(--t-dim)]">{check.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
