import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import api from './api'
import type { User } from '../types'

interface AuthContextType {
  user: User | null
  token: string | null
  login: (email: string, password: string) => Promise<{ onboarding_completed: boolean; org_type: string | null }>
  register: (email: string, password: string, fullName: string, companyName: string, phone?: string) => Promise<void>
  logout: () => void
  isLoading: boolean
  onboardingCompleted: boolean | null
  setOnboardingCompleted: (value: boolean) => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(localStorage.getItem('access_token'))
  const [isLoading, setIsLoading] = useState(true)
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null)

  useEffect(() => {
    if (token) {
      api.get('/auth/me')
        .then((meRes) => {
          setUser(meRes.data)
          setOnboardingCompleted(meRes.data.onboarding_completed ?? true)
        })
        .catch(() => {
          localStorage.removeItem('access_token')
          setToken(null)
        })
        .finally(() => setIsLoading(false))
    } else {
      setIsLoading(false)
    }
  }, [token])

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password })
    const accessToken = res.data.access_token
    localStorage.setItem('access_token', accessToken)
    setToken(accessToken)
    const meRes = await api.get('/auth/me', { headers: { Authorization: `Bearer ${accessToken}` } })
    setUser(meRes.data)
    const completed = meRes.data.onboarding_completed ?? true
    setOnboardingCompleted(completed)
    return { onboarding_completed: completed, org_type: meRes.data.org_type ?? null }
  }

  const register = async (email: string, password: string, fullName: string, companyName: string, phone?: string) => {
    const res = await api.post('/auth/register', {
      email, password, full_name: fullName, company_name: companyName, phone: phone || null,
    })
    const accessToken = res.data.access_token
    localStorage.setItem('access_token', accessToken)
    setToken(accessToken)
    setOnboardingCompleted(false)
  }

  const logout = () => {
    localStorage.removeItem('access_token')
    setToken(null)
    setUser(null)
    setOnboardingCompleted(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, isLoading, onboardingCompleted, setOnboardingCompleted }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
