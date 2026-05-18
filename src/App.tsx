import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import ProtectedRoute from './components/ProtectedRoute'
import InstallPrompt from './components/InstallPrompt'
import ChangelogPage from './pages/Changelog'
import ExercisesPage from './pages/Exercises'
import LeaderboardPage from './pages/Leaderboard'
import LoginPage from './pages/Login'
import LogPage from './pages/Log'
import SettingsPage from './pages/Settings'

function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<LogPage />} />
          <Route path="leaderboard" element={<LeaderboardPage />} />
          <Route path="exercises" element={<ExercisesPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="changelog" element={<ChangelogPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <InstallPrompt />
    </>
  )
}

export default App
