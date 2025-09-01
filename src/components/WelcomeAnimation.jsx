import { useState, useEffect } from 'react'

export default function WelcomeAnimation({ onComplete }) {
  const [stage, setStage] = useState('intro') // intro -> shrink -> complete
  
  useEffect(() => {
    const timer1 = setTimeout(() => setStage('shrink'), 2000)
    const timer2 = setTimeout(() => {
      setStage('complete')
      onComplete()
    }, 3500)
    
    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
    }
  }, [onComplete])

  if (stage === 'complete') return null

  return (
    <div className="fixed inset-0 z-50 bg-app flex items-center justify-center">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/20 via-transparent to-brand-fuchsia/20" />
      
      {/* Animated logo container */}
      <div className={`relative transition-all duration-1500 ease-out ${
        stage === 'intro' 
          ? 'scale-100' 
          : 'scale-[0.15] translate-x-[-45vw] translate-y-[-45vh]'
      }`}>
        {/* Glow effect */}
        <div className={`absolute inset-0 rounded-full transition-all duration-1500 ${
          stage === 'intro' 
            ? 'bg-gradient-to-r from-brand-primary/40 to-brand-fuchsia/40 blur-3xl scale-150 animate-pulse-slow' 
            : 'bg-gradient-to-r from-brand-primary/20 to-brand-fuchsia/20 blur-xl scale-100'
        }`} />
        
        {/* Logo */}
        <div className={`relative transition-all duration-1500 ${
          stage === 'intro' ? 'w-32 h-32' : 'w-10 h-10'
        }`}>
          <img
            src="/logo.jpg"
            alt="INCH Logo"
            className="w-full h-full rounded-full object-cover border-2 border-white/20 shadow-2xl"
          />
        </div>
        
        {/* Welcome text - only show in intro */}
        {stage === 'intro' && (
          <div className="absolute top-full mt-8 left-1/2 -translate-x-1/2 text-center animate-fade-in">
            <h1 className="text-3xl font-bold text-white mb-2">Welcome to INCH</h1>
            <p className="text-slate-300">Your tailoring business management platform</p>
            <div className="mt-4 flex justify-center">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-brand-fuchsia rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
