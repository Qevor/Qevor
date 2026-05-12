import { useState, useRef, useEffect } from 'react'
import { Link2, Copy, Check, QrCode, ArrowRight, Send, Loader2, Home, RefreshCw, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import QRCode from 'react-qr-code'
import { SplitInput } from '@/components/SplitInput'
import { usePaymentLinks } from '@/hooks/usePaymentLinks'
import { useAccount } from 'wagmi'
import { useProfiles } from '@/hooks/useProfiles'
import { getAppUrl } from '@/lib/appUrl'

const CreatePage = () => {
  const { createLinks, loading: isCreatingLinks } = usePaymentLinks()
  const { address: connectedWallet } = useAccount()
  const { getProfileByWallet, resolveUsernameToWallet } = useProfiles()

  const [recipientInput, setRecipientInput] = useState('')
  const [amount, setAmount] = useState('')

  useEffect(() => {
    if (connectedWallet && !recipientInput) {
      getProfileByWallet(connectedWallet).then(p => {
        if (p) setRecipientInput(p.username)
        else setRecipientInput(connectedWallet)
      })
    }
  }, [connectedWallet, getProfileByWallet])

  const [generated, setGenerated] = useState(false)
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null)
  const [generatedSplitLinks, setGeneratedSplitLinks] = useState<Array<{ id: string; amount: number }>>([])
  const [isSplitResultsView, setIsSplitResultsView] = useState(false)
  const [generatedLinkId, setGeneratedLinkId] = useState<string | null>(null)

  const generatedCardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (generated && generatedCardRef.current && !isSplitResultsView) {
      setTimeout(() => {
        generatedCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }, [generated, isSplitResultsView])

  const [splitAmounts, setSplitAmounts] = useState<number[]>([])
  const [isSplitMode, setIsSplitMode] = useState(false)
  const [expiresAt, setExpiresAt] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const [splitExpiresAt, setSplitExpiresAt] = useState<string[]>([])
  const [splitMaxUses, setSplitMaxUses] = useState<string[]>([])

  const appUrl = getAppUrl()
  const shareUrl = generatedLinkId
    ? `${appUrl}/pay?link=${generatedLinkId}`
    : `${appUrl}/pay?to=${recipientInput}&amount=${amount}`
  const isValid = recipientInput.length >= 3 && (isSplitMode ? splitAmounts.length > 0 : parseFloat(amount) > 0)

  const handleGenerate = async () => {
    console.log("🚀 Starting handleGenerate...")
    console.log("📊 isValid:", isValid)
    console.log("🔄 isSplitMode:", isSplitMode)
    console.log("💰 splitAmounts:", splitAmounts)
    console.log("📍 address:", connectedWallet)

    if (!isValid) {
      console.error("❌ Validation failed!")
      toast.error("Invalid input. Please check your address and amounts.")
      return
    }

    let finalAddress = recipientInput;
    if (!recipientInput.startsWith('0x') || recipientInput.length !== 42) {
      const resolved = await resolveUsernameToWallet(recipientInput);
      if (!resolved) {
        toast.error(`Invalid address or unknown username: ${recipientInput}`);
        return;
      }
      finalAddress = resolved;
    }

    const hasAdvancedFeatures = isSplitMode || expiresAt || maxUses
    console.log("⚙️ hasAdvancedFeatures:", hasAdvancedFeatures)

    if (hasAdvancedFeatures) {
      const groupId = crypto.randomUUID()
      console.log("🆔 Generated groupId:", groupId)

      const amountsToCreate = isSplitMode ? splitAmounts : [parseFloat(amount)]
      console.log("📝 amountsToCreate:", amountsToCreate)

      const linksToCreate = amountsToCreate.map((amt, index) => {
        let currentExpiresAt = expiresAt
        let currentMaxUses = maxUses

        if (isSplitMode) {
          currentExpiresAt = splitExpiresAt[index] || ''
          currentMaxUses = splitMaxUses[index] || ''
        }

        const linkObject = {
          receiver_wallet: finalAddress,
          amount: amt,
          expires_at: currentExpiresAt ? new Date(currentExpiresAt).toISOString() : null,
          max_uses: currentMaxUses ? parseInt(currentMaxUses) : null,
          current_uses: 0,
          group_id: isSplitMode ? groupId : null,
        }

        console.log(`📦 Link ${index}:`, linkObject)
        return linkObject
      })

      console.log("📋 Full linksToCreate array:", linksToCreate)

      try {
        console.log("🔄 Sending links to backend...")
        const data = await createLinks(linksToCreate)

        console.log("✅ Response from backend:", data)

        if (data && data.length > 0) {
          console.log(`✨ Successfully created ${data.length} links!`)

          if (isSplitMode) {
            // Store all split links and navigate to results view
            const linkData = data.map((link: any) => ({
              id: link.id,
              amount: link.amount
            }))
            console.log(`🔗 All generated split links:`, linkData)
            setGeneratedSplitLinks(linkData)
            setIsSplitResultsView(true)
            toast.success(`Created ${data.length} split links!`)
          } else {
            // For regular mode, show inline
            setGenerated(true)
            toast.success("Pay link generated!")
          }
        } else {
          console.error("❌ No data returned from backend")
          toast.error("Failed to generate link. Check database connection or constraints.")
        }
      } catch (error) {
        console.error("❌ Error creating links:", error)
        toast.error(`An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    } else {
      try {
        const data = await createLinks([{
          receiver_wallet: finalAddress,
          amount: parseFloat(amount),
          expires_at: null,
          max_uses: null,
          current_uses: 0,
          group_id: null,
        }])

        if (data && data.length > 0) {
          setGeneratedLinkId(data[0].id)
          setGenerated(true)
          toast.success("Pay link generated!")
        } else {
          toast.error("Failed to generate link. Check database connection or constraints.")
        }
      } catch (error) {
        toast.error(`An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }
  }

  const handleCopy = async (url: string, linkId: string) => {
    await navigator.clipboard.writeText(url)
    setCopiedLinkId(linkId)
    toast.success('Link copied to clipboard!')
    setTimeout(() => setCopiedLinkId(null), 2000)
  }

  const handleBackHome = () => {
    setIsSplitResultsView(false)
    setGenerated(false)
    setGeneratedSplitLinks([])
    setGeneratedLinkId(null)
    setRecipientInput('')
    setAmount('')
    setSplitAmounts([])
    setIsSplitMode(false)
    setExpiresAt('')
    setMaxUses('')
    setSplitExpiresAt([])
    setSplitMaxUses([])
  }

  const handleRefresh = () => {
    setGeneratedSplitLinks([])
    setIsSplitResultsView(false)
    handleGenerate()
  }

  // SPLIT MODE RESULTS VIEW
  if (isSplitResultsView && generatedSplitLinks.length > 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-background via-background to-background">
        {/* Header with buttons */}
        <div className="w-full max-w-6xl mb-8 flex items-center justify-between">
          <button
            onClick={handleBackHome}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-secondary text-foreground font-semibold hover:bg-muted transition-all"
          >
            <Home size={18} />
            Back Home
          </button>

          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-all"
          >
            <RefreshCw size={18} />
            Refresh
          </button>
        </div>

        <div className="w-full max-w-6xl space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold gradient-text">Split Payment Links</h1>
            <p className="text-muted-foreground text-sm">
              {generatedSplitLinks.length} shareable payment links generated
            </p>
          </div>

          {/* Links Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {generatedSplitLinks.map((link, index) => {
              const linkUrl = `${appUrl}/pay?link=${link.id}`
              return (
                <div
                  key={link.id}
                  className="glass-card rounded-xl p-6 space-y-4 hover:shadow-glow transition-all"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Link {index + 1}</p>
                      <p className="text-2xl font-bold gradient-text">{link.amount} USDC</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Receiver</p>
                      <p className="text-xs font-mono text-foreground truncate">{recipientInput.length > 20 ? `${recipientInput.slice(0, 10)}...` : recipientInput}</p>
                    </div>
                  </div>

                  {/* URL */}
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Payment Link</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded-lg bg-secondary px-3 py-2 text-xs text-foreground break-all border border-border">
                        {linkUrl}
                      </code>
                      <button
                        onClick={() => handleCopy(linkUrl, link.id)}
                        className="shrink-0 rounded-lg border border-border bg-secondary p-2.5 text-foreground hover:bg-muted transition-colors"
                        title="Copy Link"
                      >
                        {copiedLinkId === link.id ? (
                          <Check size={16} className="text-green-400" />
                        ) : (
                          <Copy size={16} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* QR Code */}
                  <div className="flex justify-center py-2">
                    <div className="rounded-lg bg-foreground p-2">
                      <QRCode value={linkUrl} size={120} bgColor="hsl(0,0%,95%)" fgColor="hsl(240,6%,4%)" />
                    </div>
                  </div>

                  {/* Share Buttons */}
                  <div className="grid grid-cols-4 gap-2 pt-2">
                    {/* Open in New Tab */}
                    <a
                      href={linkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1 rounded-lg border border-border bg-secondary py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                      title="Open Link"
                    >
                      <ExternalLink size={14} />
                    </a>

                    {/* Twitter */}
                    <a
                      href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Pay me ${link.amount} USDC on Qevor ⚡`)}&url=${encodeURIComponent(linkUrl)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1 rounded-lg border border-border bg-secondary py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                      title="Share on X"
                    >
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                    </a>

                    {/* Telegram */}
                    <a
                      href={`https://t.me/share/url?url=${encodeURIComponent(linkUrl)}&text=${encodeURIComponent(`Pay me ${link.amount} USDC on Qevor ⚡`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1 rounded-lg border border-border bg-secondary py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                      title="Share on Telegram"
                    >
                      <Send size={14} />
                    </a>

                    {/* WhatsApp */}
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(`Pay me ${link.amount} USDC on Qevor ⚡ ${linkUrl}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1 rounded-lg border border-border bg-secondary py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                      title="Share on WhatsApp"
                    >
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // REGULAR CREATE PAGE VIEW
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold gradient-text">Qevor</h1>
          <p className="text-muted-foreground text-sm">
            Create a shareable payment link for USDC on Arc Testnet
          </p>
        </div>

        <div className="glass-card rounded-xl p-6 space-y-5 shadow-glow-lg">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Recipient Username or Address</label>
            <input
              type="text"
              placeholder="@satoshi or 0x..."
              value={recipientInput}
              onChange={(e) => { setRecipientInput(e.target.value); setGenerated(false); setGeneratedLinkId(null) }}
              className="w-full rounded-lg border border-border bg-secondary px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
            />
          </div>

          {!isSplitMode && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
              <label className="text-sm font-medium text-foreground">Amount in USDC</label>
              <input
                type="number"
                placeholder="10.00"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setGenerated(false); setGeneratedLinkId(null) }}
                className="w-full rounded-lg border border-border bg-secondary px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              />
            </div>
          )}

          <SplitInput onSplitChange={(amounts, isModeActive) => { setSplitAmounts(amounts); setIsSplitMode(isModeActive); setGenerated(false); setGeneratedLinkId(null) }} />

          {!isSplitMode ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Expiration (Optional)</label>
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => { setExpiresAt(e.target.value); setGenerated(false) }}
                  className="w-full rounded-lg border border-border bg-secondary px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Max Uses (Optional)</label>
                <input
                  type="number"
                  placeholder="e.g. 5"
                  min="1"
                  value={maxUses}
                  onChange={(e) => { setMaxUses(e.target.value); setGenerated(false) }}
                  className="w-full rounded-lg border border-border bg-secondary px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                />
              </div>
            </div>
          ) : (
            splitAmounts.length > 0 && (
              <div className="space-y-4 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-foreground">Individual Link Settings</h3>
                  <span className="text-xs text-muted-foreground">Optional - leave empty to use defaults</span>
                </div>
                <div className="max-h-60 overflow-y-auto space-y-3 pr-2" style={{ scrollbarWidth: 'thin' }}>
                  {splitAmounts.map((amt, idx) => (
                    <div key={idx} className="flex gap-3 items-end bg-background/50 p-3 rounded-lg border border-border animate-in fade-in slide-in-from-top-2">
                      <div className="w-20 shrink-0">
                        <label className="text-xs text-muted-foreground mb-1 block">Amount</label>
                        <div className="text-sm font-semibold">{amt} USDC</div>
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground mb-1 block">Expires</label>
                        <input
                          type="datetime-local"
                          value={splitExpiresAt[idx] || ''}
                          onChange={(e) => {
                            const newExp = [...splitExpiresAt]
                            newExp[idx] = e.target.value
                            setSplitExpiresAt(newExp)
                            setGenerated(false)
                          }}
                          className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                        />
                      </div>
                      <div className="w-24 shrink-0">
                        <label className="text-xs text-muted-foreground mb-1 block">Max Uses</label>
                        <input
                          type="number"
                          placeholder="Uses"
                          min="1"
                          value={splitMaxUses[idx] || ''}
                          onChange={(e) => {
                            const newUses = [...splitMaxUses]
                            newUses[idx] = e.target.value
                            setSplitMaxUses(newUses)
                            setGenerated(false)
                          }}
                          className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}

          <button
            onClick={handleGenerate}
            disabled={!isValid || isCreatingLinks}
            className="w-full gradient-primary text-primary-foreground font-semibold rounded-lg py-3 flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed shadow-glow"
          >
            {isCreatingLinks ? <Loader2 size={18} className="animate-spin" /> : <Link2 size={18} />}
            {isSplitMode ? `Generate ${splitAmounts.length} Links` : 'Generate Pay Link'}
            {!isCreatingLinks && <ArrowRight size={16} />}
          </button>
        </div>

        {generated && !isSplitMode && (
          <div ref={generatedCardRef} className="glass-card rounded-xl p-6 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Your Pay Link</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-secondary px-3 py-2.5 text-xs text-foreground break-all border border-border">
                  {shareUrl}
                </code>
                <button
                  onClick={() => handleCopy(shareUrl, 'regular')}
                  className="shrink-0 rounded-lg border border-border bg-secondary p-2.5 text-foreground hover:bg-muted transition-colors"
                >
                  {copiedLinkId === 'regular' ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3 pt-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <QrCode size={14} />
                Scan to Pay
              </div>
              <div className="rounded-xl bg-foreground p-3">
                <QRCode value={shareUrl} size={180} bgColor="hsl(0,0%,95%)" fgColor="hsl(240,6%,4%)" />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Pay me ${amount} USDC on Qevor ⚡`)}&url=${encodeURIComponent(shareUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                X
              </a>
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(`Pay me ${amount} USDC on Qevor ⚡`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                <Send size={15} />
                Telegram
              </a>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Pay me ${amount} USDC on Qevor ⚡ ${shareUrl}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                WhatsApp
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CreatePage
