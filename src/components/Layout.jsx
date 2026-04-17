import Sidebar from './Sidebar.jsx'
import Topbar from './Topbar.jsx'
import MobileNav from './MobileNav.jsx'
import CommandPalette from './CommandPalette.jsx'

export default function Layout({ children }) {
  return (
    <div className="relative flex min-h-screen bg-valence-bg text-valence-text">
      <div className="pointer-events-none fixed inset-0 bg-valence-radial" aria-hidden />
      <Sidebar />
      <div className="relative z-10 flex min-h-screen flex-1 flex-col">
        <Topbar />
        <main className="flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-10">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
        <MobileNav />
      </div>
      <CommandPalette />
    </div>
  )
}
