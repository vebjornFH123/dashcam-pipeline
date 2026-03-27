import { NavLink, Outlet } from 'react-router-dom'
import { Camera, LayoutDashboard, Map, Menu, X, PlusCircle, ListChecks } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/new', label: 'Ny analyse', icon: PlusCircle, highlight: true },
  { to: '/jobs', label: 'Analyser', icon: ListChecks },
  { to: '/map', label: 'Kart', icon: Map },
  { to: '/events', label: 'Hendelser', icon: Camera },
]

function NavItems({ onClick }: { onClick?: () => void }) {
  return (
    <>
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onClick}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : item.highlight
                  ? 'text-primary hover:bg-primary/10'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )
          }
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </NavLink>
      ))}
    </>
  )
}

export function Layout() {
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <div className="flex items-center gap-2 font-semibold">
            <Camera className="h-5 w-5 text-primary" />
            <span className="hidden sm:inline">Dashcam Analytics</span>
          </div>

          {/* Desktop */}
          <nav className="hidden gap-1 md:flex">
            <NavItems />
          </nav>

          {/* Mobile */}
          <div className="ml-auto md:hidden">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger>
                <Button variant="ghost" size="icon" onClick={() => setOpen(!open)}>
                  {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64">
                <SheetTitle className="flex items-center gap-2 px-2 py-4 font-semibold">
                  <Camera className="h-5 w-5 text-primary" />
                  Dashcam Analytics
                </SheetTitle>
                <nav className="flex flex-col gap-1">
                  <NavItems onClick={() => setOpen(false)} />
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
