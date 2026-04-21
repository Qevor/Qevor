import { useSearchParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAccount, useConnect, useSendTransaction, useSwitchChain, usePublicClient } from 'wagmi'
import { parseUnits, parseGwei } from 'viem'
import { arcTestnet } from '@/lib/arcChain'
import { Loader2, Wallet, ExternalLink, MessageSquare, CheckCircle2, DollarSign, AlertCircle, Receipt as ReceiptIcon } from 'lucide-react'
import Confetti from 'react-confetti'
import { usePaymentLinks } from '@/hooks/usePaymentLinks'
import { useReceipts } from '@/hooks/useReceipts'
import { useProfiles } from '@/hooks/useProfiles'
import { toast } from 'sonner'

const OG_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/og-image`

const PayPage = () => {
  const [searchParams] = useSearchParams()

  const linkId = searchParams.get('link')
  const fallbackTo = searchParams.get('to') as `0x${string}` | null
  const fallbackAmount = searchParams.get('amount')

  const [to, setTo] = useState<`0x${string}` | null>(fallbackTo)
  const [amount, setAmount] = useState<string | null>(fallbackAmount)
  const [dbLinkError, setDbLinkError] = useState<string | null>(null)
  const [currentUses, setCurrentUses] = useState(0)
  const [isLoadingLink, setIsLoadingLink] = useState(!!linkId && (!fallbackTo || !fallbackAmount))
  const [isVerifyingLink, setIsVerifyingLink] = useState(!!linkId)
  const [memo, setMemo] = useState('')
  const [windowSize, setWindowSize] = useState({ w: window.innerWidth, h: window.innerHeight })

  // Manual TX state — replaces useWaitForTransactionReceipt
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined)
  const [isSending, setIsSending] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [txError, setTxError] = useState<string | null>(null)

  const [receiptGenerated, setReceiptGenerated] = useState(false)
  const [receiptId, setReceiptId] = useState<string | null>(null)

  const { getLink, incrementUsage } = usePaymentLinks()
  const { createReceipt } = useReceipts()
  const { resolveUsernameToWallet } = useProfiles()

  const { address, isConnected, chainId } = useAccount()
  const { connect, connectors, isPending: isConnecting } = useConnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  // Reverting to Native SendTransaction per user requirement for "USDC on Arc"
  const { sendTransactionAsync } = useSendTransaction()
  const publicClient = usePublicClient({ chainId: arcTestnet.id })

  const isWrongChain = isConnected && chainId !== arcTestnet.id

  // Fetch link data
  useEffect(() => {
    const fetchLinkData = async () => {
      if (linkId) {
        if (!fallbackTo || !fallbackAmount) setIsLoadingLink(true)
        setIsVerifyingLink(true)
        const linkData = await getLink(linkId)
        if (linkData) {
          if (linkData.expires_at && new Date(linkData.expires_at) < new Date()) {
            setDbLinkError('This payment link has expired.')
          } else if (linkData.max_uses !== null && linkData.current_uses !== undefined && linkData.current_uses >= linkData.max_uses) {
            setDbLinkError('This payment link has reached its maximum number of uses.')
          } else {
            if (!fallbackTo) setTo(linkData.receiver_wallet as `0x${string}`)
            if (!fallbackAmount) setAmount(linkData.amount.toString())
            setCurrentUses(linkData.current_uses || 0)
          }
        } else {
          setDbLinkError('Payment link not found.')
        }
        setIsLoadingLink(false)
        setIsVerifyingLink(false)
      } else if (fallbackTo && (!fallbackTo.startsWith('0x') || fallbackTo.length !== 42)) {
        // Resolve username from ?to=username parameter natively
        setIsLoadingLink(true)
        const resolved = await resolveUsernameToWallet(fallbackTo)
        if (resolved) {
          setTo(resolved as `0x${string}`)
        } else {
          setDbLinkError(`Could not securely resolve username: ${fallbackTo}`)
        }
        setIsLoadingLink(false)
      }
    }
    fetchLinkData()
  }, [linkId, fallbackTo])

  // OG meta tags
  useEffect(() => {
    if (to && amount) {
      const ogUrl = `${OG_FUNCTION_URL}?amount=${amount}&to=${to}`
      const setMeta = (property: string, content: string) => {
        let el = document.querySelector(`meta[property="${property}"]`)
        if (!el) {
          el = document.createElement('meta')
          el.setAttribute('property', property)
          document.head.appendChild(el)
        }
        el.setAttribute('content', content)
      }
      setMeta('og:image', ogUrl)
      setMeta('og:title', `Pay ${parseFloat(amount).toFixed(2)} USDC on Qevor`)
      setMeta('og:description', `Payment request for ${parseFloat(amount).toFixed(2)} USDC on Qevor (Arc Testnet)`)
      document.title = `Pay ${parseFloat(amount).toFixed(2)} USDC | Qevor`
    }
  }, [to, amount])

  // Window resize
  useEffect(() => {
    const onResize = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // On success: create receipt
  useEffect(() => {
    if (isSuccess && !receiptGenerated && to && amount && txHash && address) {
      setReceiptGenerated(true)
      const logPayment = async () => {
        try {
          if (linkId) await incrementUsage(linkId, currentUses)
          const receipt = await createReceipt({
            sender: address,
            receiver: to,
            amount: parseFloat(amount),
            tx_hash: txHash,
            status: 'paid',
            memo: memo,
          })
          if (receipt) setReceiptId(receipt.id)
        } catch (error) {
          console.error('Error creating receipt:', error)
        }
      }
      logPayment()
    }
  }, [isSuccess, receiptGenerated, to, amount, txHash, linkId, address, currentUses, incrementUsage, createReceipt])

  if (isLoadingLink) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    )
  }

  if (dbLinkError || !to || !amount) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-card rounded-xl p-8 text-center max-w-sm space-y-3">
          <p className="text-foreground font-semibold">Invalid Payment Link</p>
          <p className="text-muted-foreground text-sm">{dbLinkError || 'This link is missing required parameters.'}</p>
        </div>
      </div>
    )
  }

  const handlePay = async () => {
    if (!address || !to || !amount || !publicClient) return

    setTxError(null)
    setIsSuccess(false)
    setTxHash(undefined)

    // Native USDC on Arc uses 18 decimals
    const amountInUnits = parseUnits(amount, 18)
    console.log('🚀 Initiating payment...')
    console.log('📊 Amount in native units (18 dec):', amountInUnits.toString())

    try {
      setIsSending(true)
      toast.loading('Confirm in your wallet...')

      const hash = await sendTransactionAsync({
        to,
        value: amountInUnits,
        chain: arcTestnet,
        // Arc Testnet strictly requires a minimum base fee to prevent spam. 
        // 160 Gwei on Arc is exactly 0.00000016 USDC (true nanopayment fees).
        // Without this, the transaction is underpriced and immediately dropped by the nodes (causing a 'fake hash').
        maxFeePerGas: parseGwei('160'),
        maxPriorityFeePerGas: parseGwei('160'),
      })

      setIsSending(false)
      setTxHash(hash)
      console.log('✅ TX Hash:', hash)
      toast.dismiss()
      toast.loading('Payment confirming on blockchain...')
      setIsConfirming(true)

      // Reliable polling with timeout so we don't hang indefinitely
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        pollingInterval: 1000,
        timeout: 90000, // 90 second timeout
      })

      setIsConfirming(false)

      if (receipt.status === 'success') {
        console.log('🎉 Transaction confirmed!')
        toast.dismiss()
        toast.success('Payment confirmed!')
        setIsSuccess(true)
      } else {
        console.error('❌ Transaction reverted:', receipt)
        setTxError('Transaction was reverted or failed on chain.')
        toast.dismiss()
        toast.error('Transaction reverted.')
      }
    } catch (err: any) {
      setIsSending(false)
      setIsConfirming(false)
      const msg = err?.shortMessage || err?.message || 'Transaction failed'
      console.error('❌ Error:', msg, err)
      setTxError(msg)
      toast.dismiss()
      toast.error(msg)
    }
  }

  const shortAddr = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative">
      {isSuccess && <Confetti width={windowSize.w} height={windowSize.h} recycle={false} numberOfPieces={400} />}

      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Payment Request</p>
          <h1 className="text-4xl font-bold gradient-text">{parseFloat(amount).toFixed(2)} USDC</h1>
          <p className="text-sm text-muted-foreground">
            to <span className="text-foreground font-mono">{shortAddr(to)}</span>
          </p>
        </div>

        {isSuccess ? (
          <div className="glass-card rounded-xl p-6 space-y-4 shadow-glow-lg animate-in fade-in zoom-in-95 duration-500 border-green-500/30">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-green-500/20 p-2">
                <CheckCircle2 size={24} className="text-green-400" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Payment Complete!</p>
                <p className="text-xs text-muted-foreground">Transaction confirmed on Arc Testnet</p>
              </div>
            </div>

            <div className="space-y-2 text-sm border-t border-border pt-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="text-foreground font-semibold">{parseFloat(amount).toFixed(2)} USDC</span>
              </div>
              {memo && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Memo</span>
                  <span className="text-foreground">{memo}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <a
                href={`https://testnet.arcscan.app/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full rounded-lg border border-border bg-secondary py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                View on Explorer
                <ExternalLink size={14} />
              </a>
              {receiptId && (
                <Link
                  to={`/receipt/${receiptId}`}
                  className="flex items-center justify-center gap-2 w-full rounded-lg border border-primary/20 bg-primary/10 py-2.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
                >
                  View Digital Receipt
                  <ReceiptIcon size={14} />
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="glass-card rounded-xl p-6 space-y-5 shadow-glow-lg">
            <div className="flex items-center gap-3 rounded-lg bg-secondary p-3 border border-border">
              <DollarSign size={18} className="text-muted-foreground" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">You're paying</p>
                <p className="text-foreground font-semibold">{parseFloat(amount).toFixed(2)} USDC</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <MessageSquare size={14} />
                Memo <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="For the pizza 🍕"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="w-full rounded-lg border border-border bg-secondary px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              />
            </div>

            {txError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs break-words animate-in fade-in">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <p>{txError}</p>
              </div>
            )}

            {!isConnected ? (
              <button
                onClick={() => connect({ connector: connectors[0] })}
                disabled={isConnecting}
                className="w-full gradient-primary text-primary-foreground font-semibold rounded-lg py-3 flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 shadow-glow"
              >
                {isConnecting ? <Loader2 size={18} className="animate-spin" /> : <Wallet size={18} />}
                {isConnecting ? 'Connecting...' : 'Connect Wallet'}
              </button>
            ) : isWrongChain ? (
              <button
                onClick={() => switchChain({ chainId: arcTestnet.id })}
                disabled={isSwitching}
                className="w-full bg-yellow-500/10 text-yellow-500 border border-yellow-500/50 hover:bg-yellow-500/20 font-semibold rounded-lg py-3 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60"
              >
                {isSwitching && <Loader2 size={18} className="animate-spin" />}
                {isSwitching ? 'Switching...' : 'Switch to Arc Testnet'}
              </button>
            ) : (
              <button
                onClick={() => {
                  console.log('🔴 BUTTON CLICKED!!!')
                  handlePay()
                }}
                disabled={isSending || isConfirming || isVerifyingLink}
                className="w-full gradient-primary text-primary-foreground font-semibold rounded-lg py-3 flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 shadow-glow"
              >
                {(isSending || isConfirming || isVerifyingLink) && <Loader2 size={18} className="animate-spin" />}
                {isVerifyingLink
                  ? 'Verifying Link...'
                  : isSending
                    ? 'Confirm in Wallet...'
                    : isConfirming
                      ? 'Confirming...'
                      : `Pay ${parseFloat(amount!).toFixed(2)} USDC`}
              </button>
            )}

            {isConnected && (
              <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                Connected: <span className="font-mono text-foreground">{shortAddr(address!)}</span>
              </p>
            )}
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Powered by <span className="gradient-text font-semibold">Qevor</span> on Arc Testnet
        </p>
      </div>
    </div>
  )
}

export default PayPage