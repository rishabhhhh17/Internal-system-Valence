import ConfigBanner from '../components/ConfigBanner.jsx'
import MorningBriefing from '../components/MorningBriefing.jsx'

export default function Overview() {
  return (
    <div className="space-y-8">
      <ConfigBanner />
      <MorningBriefing />
    </div>
  )
}
