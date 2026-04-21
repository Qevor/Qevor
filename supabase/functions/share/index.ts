import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const CRAWLER_UA = /bot|crawl|spider|facebookexternalhit|Twitterbot|TelegramBot|Slackbot|LinkedInBot|Discordbot|WhatsApp|Googlebot/i
const APP_ORIGIN = Deno.env.get('APP_ORIGIN') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
const OG_IMAGE_URL = `${SUPABASE_URL}/functions/v1/og-image`

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const url = new URL(req.url)
  let to = url.searchParams.get('to') || ''
  let amount = url.searchParams.get('amount') || '0'
  const linkId = url.searchParams.get('link')
  const ua = req.headers.get('user-agent') || ''

  if (linkId && (!to || amount === '0')) {
    const { data } = await supabase
      .from('payment_links')
      .select('receiver_wallet, amount')
      .eq('id', linkId)
      .single()

    if (data) {
      to = data.receiver_wallet
      amount = data.amount.toString()
    }
  }

  const spaUrl = linkId
    ? `${APP_ORIGIN}/pay?link=${encodeURIComponent(linkId)}&to=${encodeURIComponent(to)}&amount=${encodeURIComponent(amount)}`
    : `${APP_ORIGIN}/pay?to=${encodeURIComponent(to)}&amount=${encodeURIComponent(amount)}`

  const ogImageUrl = `${OG_IMAGE_URL}?amount=${encodeURIComponent(amount)}&to=${encodeURIComponent(to)}`
  const displayAmount = parseFloat(amount).toFixed(2)
  const shortAddr = to ? `${to.slice(0, 6)}...${to.slice(-4)}` : ''

  if (!CRAWLER_UA.test(ua)) {
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: spaUrl },
    })
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Pay ${displayAmount} USDC | Qevor</title>
  <meta name="description" content="Payment request for ${displayAmount} USDC to ${shortAddr} on Arc Testnet" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Pay ${displayAmount} USDC on Arc" />
  <meta property="og:description" content="Send ${displayAmount} USDC to ${shortAddr} on Arc Testnet" />
  <meta property="og:image" content="${ogImageUrl}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="${spaUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Pay ${displayAmount} USDC on Arc" />
  <meta name="twitter:description" content="Send ${displayAmount} USDC to ${shortAddr} on Arc Testnet" />
  <meta name="twitter:image" content="${ogImageUrl}" />
  <link rel="canonical" href="${spaUrl}" />
</head>
<body>
  <p>Redirecting to payment page...</p>
  <script>window.location.href="${spaUrl}";</script>
</body>
</html>`

  return new Response(html, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
})
