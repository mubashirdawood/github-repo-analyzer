import { useNavigate, Navigate } from 'react-router-dom'
import { setAuthSession, isAuthenticated } from '../api'
import AuthPage from '../components/AuthPage'

export default function LoginPage() {
  const navigate = useNavigate()

  if (isAuthenticated()) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <AuthPage
      onAuthenticated={(data) => {
        if (data?.token) setAuthSession(data)
        navigate('/dashboard', { replace: true })
      }}
    />
  )
}
