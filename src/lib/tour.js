import { driver } from 'driver.js'

// Helper: generate a stable localStorage key for a page tour
export function tourKey(page) {
  return `inch_tour_${page}`
}

// Run a driver.js tour once per browser (gated by localStorage key)
// steps: [{ element: '#selector', popover: { title, description, side, align } }]
export function runTourOnce(key, steps, options = {}) {
  try {
    if (!Array.isArray(steps) || steps.length === 0) return null
    const seen = typeof window !== 'undefined' && window.localStorage?.getItem(key) === '1'
    if (seen) return null
    const d = driver({
      showProgress: true,
      animate: true,
      allowClose: true,
      overlayColor: 'rgba(20,16,36,0.65)',
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Done',
      ...options,
      steps,
    })
    d.on('destroyed', () => {
      try { window.localStorage?.setItem(key, '1') } catch {}
      if (typeof options.onDone === 'function') {
        try { options.onDone() } catch { /* noop */ }
      }
    })
    d.drive()
    return d
  } catch {
    return null
  }
}
