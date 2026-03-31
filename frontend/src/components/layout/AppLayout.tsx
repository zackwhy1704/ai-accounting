import { Outlet } from 'react-router-dom'
import { ErrorBoundary } from '../ErrorBoundary'
import { Sidebar } from './Sidebar'
import { Bell, Search, User, Sun, Moon, Globe, Check, X, Settings } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { useTheme, LANG_LABELS, type Language } from '@/lib/theme'
import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

function ThemeToggle() {
  const { theme, setTheme, t } = useTheme()
  return (
    <button
      type="button"
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      className="relative flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted transition-colors"
      title={theme === 'light' ? t('header.switchDark') : t('header.switchLight')}
    >
      {theme === 'light' ? (
        <Moon className="h-5 w-5 text-muted-foreground" />
      ) : (
        <Sun className="h-5 w-5 text-muted-foreground" />
      )}
    </button>
  )
}

function LanguageSelector() {
  const { language, setLanguage, t } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const languages: Language[] = ['en', 'zh', 'ms']

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-9 items-center gap-1.5 rounded-lg px-2 hover:bg-muted transition-colors"
        title={t('header.changeLang')}
      >
        <Globe className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">{language.toUpperCase()}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-xl border border-border bg-card p-1 shadow-lg">
          {languages.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => { setLanguage(l); setOpen(false) }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors"
            >
              <span className={l === language ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                {LANG_LABELS[l]}
              </span>
              {l === language && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function UserSettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth()
  const { language, setLanguage, t } = useTheme()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose])

  if (!open) return null

  const languages: Language[] = ['en', 'zh', 'ms']

  return (
    <div ref={ref} className="absolute right-0 top-full mt-2 z-50 w-80 rounded-2xl border border-border bg-card shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">{t('user.settings')}</span>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-muted transition-colors">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Profile section */}
      <div className="border-b border-border px-5 py-4">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t('user.profile')}</div>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{t('user.name')}</span>
            <span className="text-xs font-medium text-foreground">{user?.full_name ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{t('user.email')}</span>
            <span className="text-xs font-medium text-foreground truncate max-w-[180px]">{user?.email ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{t('user.role')}</span>
            <span className="text-xs font-medium text-foreground capitalize">{user?.role ?? '—'}</span>
          </div>
        </div>
      </div>

      {/* Preferences section */}
      <div className="border-b border-border px-5 py-4">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t('user.preferences')}</div>
        <div className="space-y-3">
          {/* Language */}
          <div>
            <div className="text-xs text-muted-foreground mb-2">{t('user.language')}</div>
            <div className="flex flex-col gap-1">
              {languages.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLanguage(l)}
                  className={cn(
                    'flex items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors',
                    l === language
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {LANG_LABELS[l]}
                  {l === language && <Check className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Logout */}
      <div className="px-5 py-3">
        <Button
          type="button"
          variant="secondary"
          onClick={logout}
          className="w-full h-9 rounded-xl text-xs font-semibold"
        >
          {t('user.logout')}
        </Button>
      </div>
    </div>
  )
}

export function AppLayout() {
  const { user } = useAuth()
  const { t } = useTheme()
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="ml-[272px] flex flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card px-6">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('header.search')}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <LanguageSelector />
            <ThemeToggle />
            <button type="button" className="relative flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted transition-colors">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
            </button>
            <div className="relative ml-2">
              <button
                type="button"
                onClick={() => setSettingsOpen(!settingsOpen)}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted transition-colors"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                  <User className="h-4 w-4" />
                </div>
                <div className="text-sm text-left">
                  <p className="font-medium text-foreground">{user?.full_name ?? 'User'}</p>
                  <p className="text-xs text-muted-foreground capitalize">{user?.role ?? 'Admin'}</p>
                </div>
              </button>
              <UserSettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 p-6">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
