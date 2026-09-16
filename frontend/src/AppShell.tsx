import { NavLink, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { fetchStats } from './api'
import type { DashboardStats } from '../../shared/types.ts'

export function AppShell() {
  const [stats, setStats] = useState<DashboardStats | null>(null)

  useEffect(() => {
    fetchStats().then(setStats).catch(() => setStats(null))
  }, [])

  return (
    <div className="shell">
      <nav className="nav">
        <p className="brand">
          <strong>PinaLove Review</strong>
          <span>Private review desk</span>
        </p>
        <NavLink to="/" end>
          Dashboard <span className="count">{stats?.unreviewed ?? ''}</span>
        </NavLink>
        <NavLink to="/shortlist">
          Shortlist <span className="count">{stats?.shortlisted ?? ''}</span>
        </NavLink>
        <NavLink to="/manual-review">
          Manual review <span className="count">{stats?.manualReview ?? ''}</span>
        </NavLink>
        <NavLink to="/discarded">
          Discarded <span className="count">{stats?.discarded ?? ''}</span>
        </NavLink>
      </nav>
      <main className="main">
        <Outlet context={{ stats, refreshStats: () => fetchStats().then(setStats) }} />
      </main>
    </div>
  )
}
