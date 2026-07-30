import { Component } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { captureException } from '../lib/sentry.js'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    captureException(error, { componentStack: info?.componentStack })
    if (import.meta.env.DEV) console.error('ErrorBoundary caught:', error, info)
  }

  reset = () => { this.setState({ error: null }) }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-screen grid place-items-center bg-valence-elevated px-6">
        <div className="vl-card max-w-lg p-8">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-valence-danger/10">
              <AlertTriangle className="h-5 w-5 text-valence-danger" />
            </div>
            <h1 className="font-display text-xl font-bold text-valence-text">Something went wrong.</h1>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-valence-muted">
            We've logged the error and the team will take a look. You can try reloading the last step,
            or refresh the page to start fresh.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-lg border border-valence-border bg-valence-surface p-3 text-[11px] text-valence-muted">
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <div className="mt-6 flex gap-2">
            <button onClick={this.reset} className="vl-btn-secondary">
              <RotateCcw className="h-3.5 w-3.5" /> Try again
            </button>
            <button onClick={() => window.location.reload()} className="vl-btn-primary">
              Reload page
            </button>
          </div>
        </div>
      </div>
    )
  }
}
