import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './AppShell'
import { DashboardPage } from './DashboardPage'
import { ProfileDetailPage } from './ProfileDetailPage'
import { ProfileGridPage } from './ProfileGridPage'

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route
          path="/preselected"
          element={
            <ProfileGridPage
              title="Preselected"
              subtitle="Hard filters confirmed. Preferences still need a human look."
              fixedStatus="PRESELECTED"
            />
          }
        />
        <Route
          path="/needs-detail"
          element={
            <ProfileGridPage
              title="Needs detail"
              subtitle="UNKNOWN is not treated as no. Confirm children, marital status, religion, occupation."
              fixedStatus="NEEDS_DETAIL"
            />
          }
        />
        <Route
          path="/discarded"
          element={
            <ProfileGridPage
              title="Discarded"
              subtitle="Nothing is deleted. Restore if the system was wrong."
              fixedStatus="DISCARDED"
            />
          }
        />
        <Route path="/profiles/:id" element={<ProfileDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
