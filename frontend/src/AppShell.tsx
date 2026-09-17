import { NavLink, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { fetchStats } from './api'
import type { DashboardStats } from '../../shared/types.ts'

export type ShellContext = {
  stats: DashboardStats | null
  refreshStats: () => Promise<void>
}

export function AppShell() {
  const [stats, setStats] = useState<DashboardStats | null>(null)

  async function refreshStats() {
    try {
      setStats(await fetchStats())
    } catch {
      setStats(null)
    }
  }

  useEffect(() => {
    void refreshStats()
  }, [])

  return (
    <div className="shell">
      <nav className="nav">
        <p className="brand">
          <strong>PinaLove Review</strong>
          <span>Private review desk</span>
        </p>
        <NavLink to="/" end>
          Dashboard <span className="count">{stats?.actionRequired ?? stats?.total ?? ''}</span>
        </NavLink>
        <NavLink to="/preselected">
          Preselected <span className="count">{stats?.preselected ?? ''}</span>
        </NavLink>
        <NavLink to="/needs-detail">
          Needs detail <span className="count">{stats?.needsDetail ?? ''}</span>
        </NavLink>
        <NavLink to="/discarded">
          Discarded <span className="count">{stats?.discarded ?? ''}</span>
        </NavLink>
      </nav>
      <main className="main">
        <Outlet context={{ stats, refreshStats } satisfies ShellContext} />
      </main>
    </div>
  )
}
