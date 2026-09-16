import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './AppShell'
import { ProfileDetailPage } from './ProfileDetailPage'
import { ProfileGridPage } from './ProfileGridPage'
import { ShortlistPage } from './ShortlistPage'

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route
          path="/"
          element={
            <ProfileGridPage
              title="Dashboard"
              subtitle="Fast review. Declared data vs system indicators are labeled separately."
              excludeDiscarded
            />
          }
        />
        <Route path="/shortlist" element={<ShortlistPage />} />
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
        <Route
          path="/manual-review"
          element={
            <ProfileGridPage
              title="Manual review"
              subtitle="Incomplete or inconsistent profiles. UNKNOWN is not treated as no."
              fixedStatus="MANUAL_REVIEW"
            />
          }
        />
        <Route path="/profiles/:id" element={<ProfileDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
