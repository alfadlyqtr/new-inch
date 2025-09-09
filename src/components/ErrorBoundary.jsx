import React from "react"

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    try { console.error('[ErrorBoundary]', error, info) } catch {}
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="glass rounded-2xl border border-white/10 p-6 text-slate-300">
          <div className="text-white/90 font-semibold">Something went wrong.</div>
          <div className="text-xs opacity-80 mt-1">{String(this.state.error?.message || this.state.error)}</div>
        </div>
      )
    }
    return this.props.children
  }
}
