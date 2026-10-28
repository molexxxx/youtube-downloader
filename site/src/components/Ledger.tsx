import type { ReactNode } from 'react'

export interface LedgerRow {
  label: string
  body: ReactNode
  detail?: string
}

/** Rows on the app's settings columns: a label, what it does, and the figure that matters. */
export function Ledger({ rows }: { rows: LedgerRow[] }) {
  return (
    <dl className="ledger">
      {rows.map(({ label, body, detail }) => (
        <div className="ledger-row" key={label}>
          <dt>{label}</dt>
          <dd>{body}</dd>
          {detail && <dd className="ledger-detail">{detail}</dd>}
        </div>
      ))}
    </dl>
  )
}
