import { useCan, Forbidden } from "../lib/permissions.jsx"
import EnhancedPublicProfileSettings from "../components/public-profile/EnhancedPublicProfileSettings.jsx"
import ErrorBoundary from "../components/ErrorBoundary.jsx"

export default function PublicProfile() {
  const canView = useCan('public_profile','view')
  if (!canView) return <Forbidden module="public profile" />
  return (
    <ErrorBoundary>
      <EnhancedPublicProfileSettings />
    </ErrorBoundary>
  )
}
