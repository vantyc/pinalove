import { NavLink, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { fetchSession, fetchStats } from './api'
import type { DashboardStats } from '../../shared/types.ts'

export type ShellContext = {
  stats: DashboardStats | null
  refreshStats: () => Promise<void>
}

export function AppShell() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [user, setUser] = useState<string | null>(null)

  async function refreshStats() {
    try {
      setStats(await fetchStats())
    } catch {
      setStats(null)
    }
  }

  useEffect(() => {
    void refreshStats()
    void fetchSession()
      .then((s) => setUser(s.user))
      .catch(() => setUser(null))
  }, [])

  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) window.location.reload()
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
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
        <div className="nav-session">
          <p className="nav-session-label">Signed in</p>
          {user ? <p className="nav-session-user">{user}</p> : null}
          <a className="btn" href="/logout">
            Log out
          </a>
        </div>
      </nav>
      <main className="main">
        <Outlet context={{ stats, refreshStats } satisfies ShellContext} />
      </main>
    </div>
  )
}
