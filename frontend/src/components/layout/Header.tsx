import { Bell, CircleHelp, Menu, Search } from "lucide-react"
import { Button } from "../ui/button"
import { useAuth } from "../../lib/auth"

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const { user } = useAuth()

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-white/10 bg-[#1a0b2e] px-4 sm:px-6">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="text-white/80 hover:bg-white/10 hover:text-white md:hidden"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex items-center gap-1.5">
        <Button type="button" variant="ghost" size="icon" className="text-white/70 hover:bg-white/10 hover:text-white">
          <Search className="h-5 w-5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="text-white/70 hover:bg-white/10 hover:text-white">
          <Bell className="h-5 w-5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="text-white/70 hover:bg-white/10 hover:text-white">
          <CircleHelp className="h-5 w-5" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="ml-1 h-9 rounded-xl bg-white/10 px-3 text-xs font-semibold text-white/90 hover:bg-white/15"
        >
          <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-[#7C9DFF] to-[#4D63FF] text-[10px] font-bold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25)]">
            AI
          </span>
          {user?.full_name?.split(' ')[0] ?? 'AI'}
        </Button>
      </div>
    </header>
  )
}
