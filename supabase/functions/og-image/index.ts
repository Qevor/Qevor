import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const amount = url.searchParams.get('amount') || '0'
  const to = url.searchParams.get('to') || ''
  const shortAddr = to ? `${to.slice(0, 6)}...${to.slice(-4)}` : ''

  const svg = `
    <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0a0a0f;stop-opacity:1" />
          <stop offset="50%" style="stop-color:#1a1025;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#0a0a1a;stop-opacity:1" />
        </linearGradient>
        <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:#7c3aed;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#bg)" />
      <rect x="60" y="480" width="1080" height="4" rx="2" fill="url(#accent)" opacity="0.3" />
      <circle cx="1050" cy="150" r="200" fill="#7c3aed" opacity="0.05" />
      <circle cx="150" cy="500" r="150" fill="#3b82f6" opacity="0.05" />
      <text x="600" y="180" text-anchor="middle" fill="#a78bfa" font-family="system-ui, sans-serif" font-size="24" font-weight="500" letter-spacing="4">PAYMENT REQUEST</text>
      <text x="600" y="310" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif" font-size="96" font-weight="700">${parseFloat(amount).toFixed(2)} USDC</text>
      <text x="600" y="400" text-anchor="middle" fill="#9ca3af" font-family="system-ui, sans-serif" font-size="28">on Arc Testnet</text>
      ${shortAddr ? `<text x="600" y="450" text-anchor="middle" fill="#6b7280" font-family="monospace" font-size="22">to ${shortAddr}</text>` : ''}
      <text x="600" y="560" text-anchor="middle" fill="#7c3aed" font-family="system-ui, sans-serif" font-size="28" font-weight="600">Qevor</text>
    </svg>
  `

  return new Response(svg, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600',
    },
  })
})
