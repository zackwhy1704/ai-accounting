import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, ChevronUp, LogOut, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { useFeatureFlags } from '@/lib/features'
import { useState, useEffect, useMemo } from 'react'
import { navItems } from './nav-data'
import { navIconMap } from './icons'

export function Sidebar() {
  const location = useLocation()
  const { logout, user } = useAuth()
  const { t } = useTheme()

  const { has } = useFeatureFlags()

  const filteredNavItems = useMemo(
    () => navItems.filter((item) => {
      if (item.feature && !has(item.feature)) return false
      return true
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.org_type]
  )

  const expandableItems = useMemo(
    () => filteredNavItems.filter((i) => Boolean(i.children?.length)),
    [filteredNavItems]
  )

  const shouldExpandByHref = useMemo(() => {
    const map: Record<string, boolean> = {}
    for (const item of expandableItems) {
      const isParentActive = location.pathname === item.href || location.pathname.startsWith(`${item.href}/`)
      const isAnyChildActive =
        item.children?.some((c) => location.pathname === c.href || location.pathname.startsWith(`${c.href}/`)) ?? false
      map[item.href] = isParentActive || isAnyChildActive
    }
    return map
  }, [expandableItems, location.pathname])

  const [openByHref, setOpenByHref] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const item of expandableItems) init[item.href] = Boolean(shouldExpandByHref[item.href])
    return init
  })

  useEffect(() => {
    setOpenByHref((prev) => {
      const next = { ...prev }
      for (const item of expandableItems) {
        if (shouldExpandByHref[item.href]) next[item.href] = true
        if (!(item.href in next)) next[item.href] = false
      }
      return next
    })
  }, [expandableItems, shouldExpandByHref])

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-[272px] flex-col bg-sidebar">
      {/* Logo */}
      <div className="mb-5 flex items-center gap-3 px-6 pt-5">
        <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-[#7C9DFF] to-[#4D63FF] shadow-[0_0_0_1px_rgba(124,157,255,0.35),0_10px_30px_rgba(0,0,0,0.35)]" />
        <span className="text-sm font-semibold tracking-wide text-white/90">
          {user?.full_name ?? 'AI Account'}
        </span>
      </div>

      {/* Current Org */}
      <div className="px-4 mb-4">
        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-white/5 border border-white/10">
          <Building2 className="h-4 w-4 text-[#a78bfa] shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-white/90 truncate">
              {user?.full_name ?? 'My Account'}
            </div>
            <div className="text-[11px] text-white/40">My Profile</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 space-y-1">
        {filteredNavItems.map((item) => {
          const Icon = navIconMap[item.icon]
          const hasChildren = Boolean(item.children?.length)
          const isActive = location.pathname === item.href || location.pathname.startsWith(`${item.href}/`)

          if (hasChildren) {
            const isOpen = Boolean(openByHref[item.href])
            const Chevron = isOpen ? ChevronUp : ChevronDown
            const anyChildActive =
              item.children!.some((c) => location.pathname === c.href || location.pathname.startsWith(`${c.href}/`))
            const parentActive = isActive || anyChildActive

            return (
              <div key={item.href} className="space-y-1">
                <button
                  type="button"
                  onClick={() =>
                    setOpenByHref((prev) => ({ ...prev, [item.href]: !Boolean(prev[item.href]) }))
                  }
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-colors',
                    parentActive
                      ? 'bg-[#8b5cf6]/20 text-[#c4b5fd] shadow-[0_0_0_1px_rgba(139,92,246,0.25)]'
                      : 'text-white/70 hover:bg-white/5 hover:text-white/90'
                  )}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4',
                      parentActive ? 'text-[#a78bfa]' : 'text-white/60 group-hover:text-white/80'
                    )}
                  />
                  <span className="truncate">{t(item.labelKey)}</span>
                  <Chevron className="ml-auto h-4 w-4 text-white/55 group-hover:text-white/80" />
                </button>

                {isOpen && (
                  <div className="rounded-2xl border border-white/10 bg-[#2a0f4a]/70 py-2 shadow-[0_16px_50px_rgba(0,0,0,0.45)]">
                    {item.children!.map((child) => {
                      const childActive = location.pathname === child.href || location.pathname.startsWith(`${child.href}/`)
                      return (
                        <NavLink
                          key={child.href}
                          to={child.href}
                          className={cn(
                            'block rounded-xl px-5 py-3 text-[13px] font-medium transition-colors',
                            childActive
                              ? 'bg-white/5 text-[#c4b5fd]'
                              : 'text-white/55 hover:bg-white/5 hover:text-white/85'
                          )}
                        >
                          {t(child.labelKey)}
                        </NavLink>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

          return (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.href === '/dashboard'}
              className={() =>
                cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors',
                  isActive
                    ? 'bg-[#8b5cf6]/20 text-[#c4b5fd] shadow-[0_0_0_1px_rgba(139,92,246,0.25)]'
                    : 'text-white/70 hover:bg-white/5 hover:text-white/90'
                )
              }
            >
              <Icon className={cn('h-4 w-4', isActive ? 'text-[#a78bfa]' : 'text-white/60 group-hover:text-white/80')} />
              <span className="truncate">{t(item.labelKey)}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-white/10 px-4 py-4">
        <button
          type="button"
          onClick={logout}
          className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-white/70 hover:bg-white/5 hover:text-white/90 transition-colors"
        >
          <LogOut className="h-4 w-4 text-white/60 group-hover:text-white/80" />
          <span>{t("nav.logout")}</span>
        </button>
      </div>
    </aside>
  )
}
