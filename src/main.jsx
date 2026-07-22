import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { queryClientInstance } from '@/lib/query-client'
import { base44 } from '@/api/base44Client'

// LCP / CLS: start the above-the-fold data fetches (hero CMS section + public
// site settings used by the announcement bar) BEFORE first render instead of
// waiting for the components to mount. The hero <img> URL comes from the
// home_hero section, so every round-trip shaved off this discovery chain
// directly moves LCP earlier; having settings ready sooner also avoids a late
// top-of-page insert (layout shift). Fire-and-forget: React Query dedups with
// the components' own useQuery calls (identical queryKey/queryFn), and
// failures simply let the components' own queries retry as before.
queryClientInstance.prefetchQuery({
  queryKey: ['cms-section', 'home_hero'],
  queryFn: () => base44.entities.CmsSection.filter({ section_key: 'home_hero' }, 'sort_order', 1),
  staleTime: 60_000,
})
queryClientInstance.prefetchQuery({
  queryKey: ['site-settings-public'],
  queryFn: () => base44.entities.SiteSetting.list('setting_key', 100),
  staleTime: 5 * 60_000,
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
