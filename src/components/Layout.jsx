import Sidebar from './Sidebar.jsx'
import Topbar from './Topbar.jsx'
import MobileNav from './MobileNav.jsx'
import CommandPalette from './CommandPalette.jsx'
import ShortcutsOverlay from './ShortcutsOverlay.jsx'

export default function Layout({ children }) {
  return (
    <div className="relative flex min-h-screen bg-valence-bg text-valence-text">
      <div className="pointer-events-none fixed inset-0 bg-valence-radial" aria-hidden />
      <div className="pointer-events-none fixed inset-0 bg-valence-aurora opacity-90" aria-hidden />
      <Sidebar />
      <div className="relative z-10 flex min-h-screen flex-1 flex-col">
        <Topbar />
        <main className="flex-1 px-4 pt-10 pb-10 sm:px-6 lg:px-12">
          <div className="mx-auto w-full max-w-[1280px]">{children}</div>
        </main>
        <MobileNav />
      </div>
      <CommandPalette />
      <ShortcutsOverlay />
    </div>
  )
}
