import Sidebar from './Sidebar.jsx'
import Topbar from './Topbar.jsx'
import MobileNav from './MobileNav.jsx'
import CommandPalette from './CommandPalette.jsx'
import ShortcutsOverlay from './ShortcutsOverlay.jsx'
import WelcomeOverlay from './WelcomeOverlay.jsx'
import AskSidebar from './AskSidebar.jsx'
import { useWorkspaceSetting } from '../hooks/useWorkspaceSetting.js'
import { WORKSPACE_KEYS } from '../lib/workspace.js'

export default function Layout({ children }) {
  const sidebarCollapsed = useWorkspaceSetting(WORKSPACE_KEYS.sidebarCollapsed) === 'true'
  return (
    <div className="relative flex min-h-screen bg-valence-bg text-valence-text">
      {/* The brand-orb gradient overlays (valence-radial + valence-aurora)
          previously sat fixed inset-0 here. Removed: keeps the canvas
          flat black in dark mode and flat white in light mode — no blue
          tint bleeding through behind cards. Re-add if the brand
          signature is wanted back. */}
      {!sidebarCollapsed && <Sidebar />}
      <div className="relative z-10 flex min-w-0 min-h-screen flex-1 flex-col">
        <Topbar />
        {/* Padding tightened on narrow viewports — pt-6 / pb-20 on mobile so
            MobileNav doesn't overlap content, then a normal-density lg
            breakpoint. min-w-0 on the parent prevents flex children from
            forcing horizontal scroll when content overflows (e.g. wide
            tables on /deals). The Ask panel is a floating window so we
            no longer reserve right-side gutter for it. */}
        <main className="flex-1 px-3 pt-5 pb-24 sm:px-5 sm:pt-7 sm:pb-10 lg:px-10 lg:pt-9">
          <div className="mx-auto w-full max-w-[1280px]">{children}</div>
        </main>
        <MobileNav />
      </div>
      <CommandPalette />
      <ShortcutsOverlay />
      <WelcomeOverlay />
      <AskSidebar />
    </div>
  )
}
