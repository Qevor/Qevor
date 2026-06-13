import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { Button } from '@/components/ui/button';
import { LogIn, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useProfiles } from '@/hooks/useProfiles';
import { fetchAgentWallets, registerAgentWallet } from '@/lib/agents/queries';
import type { AgentWallet } from '@/lib/agents/types';
import { AgentWalletOnboarding } from '@/components/agents/AgentWalletOnboarding';
import { PolicyBuilder } from '@/components/agents/PolicyBuilder';
import { CosignQueue } from '@/components/agents/CosignQueue';
import { AgentControlCenter } from '@/components/agents/AgentControlCenter';
import { AgentEmptyControlCenter } from '@/components/agents/AgentEmptyControlCenter';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function AgentsPage() {
  const { address, isConnected } = useAccount();
  const { setShowAuthFlow, sdkHasLoaded } = useDynamicContext();
  const { getProfileByWallet } = useProfiles();

  const [wallets, setWallets] = useState<AgentWallet[]>([]);
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [profileWallet, setProfileWallet] = useState<string | null>(null);
  const [editingWallet, setEditingWallet] = useState<AgentWallet | null>(null);

  const openAuthFlow = () => {
    if (!setShowAuthFlow) {
      toast.error('Wallet login is still loading. Refresh and try again.');
      return;
    }
    if (!sdkHasLoaded) {
      toast.error('Wallet login could not load. Check the Dynamic environment ID and allowed domains.');
      return;
    }
    setShowAuthFlow(true);
  };

  const loadWallets = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const profile = await getProfileByWallet(address);
      if (!profile) return;
      setProfileWallet(profile.wallet);
      const data = await fetchAgentWallets(profile.wallet);
      setWallets(data);
    } catch (err) {
      console.error('Failed to load agent wallets:', err);
    } finally {
      setLoading(false);
    }
  }, [address, getProfileByWallet]);

  useEffect(() => {
    if (isConnected && address) {
      loadWallets();
    }
  }, [isConnected, address, loadWallets]);

  const handleRegister = async (walletAddress: string, label: string, chain: string) => {
    if (!profileWallet) {
      toast.error('Please create a username first on the Dashboard.');
      return;
    }
    setRegistering(true);
    try {
      await registerAgentWallet(profileWallet, walletAddress, chain, label || undefined);
      toast.success('Agent wallet registered!');
      setShowOnboarding(false);
      await loadWallets();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to register wallet');
    } finally {
      setRegistering(false);
    }
  };

  const handleEditPolicy = (wallet: AgentWallet) => {
    setEditingWallet(wallet);
  };

  const handleEnableExecutor = async (wallet: AgentWallet) => {
    try {
      const { error } = await (await import('@/integrations/supabase/client')).supabase
        .from('agent_wallets')
        .update({ executor_mode: 'escrow' })
        .eq('id', wallet.id);

      if (error) throw error;
      toast.success('Autonomous execution enabled. The executor will provision an escrow wallet shortly.');
      await loadWallets();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to enable executor');
    }
  };

  if (!isConnected) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <p className="text-muted-foreground">Connect your wallet to manage agent wallets.</p>
        <Button onClick={openAuthFlow}>
          <LogIn className="mr-2 h-4 w-4" /> Connect Wallet
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : wallets.length === 0 ? (
        <AgentEmptyControlCenter onAddWallet={() => setShowOnboarding(true)} />
      ) : null}

      {showOnboarding && !loading && (
        <AgentWalletOnboarding onRegister={handleRegister} registering={registering} />
      )}

      {wallets.length > 0 && (
        <AgentControlCenter
          wallets={wallets}
          onAddWallet={() => setShowOnboarding(true)}
          onEditPolicy={handleEditPolicy}
          onEnableExecutor={handleEnableExecutor}
        />
      )}

      {/* Cosign queue for enrolled wallets */}
      {profileWallet && wallets.filter((w) => w.executor_mode).map((w) => (
        <CosignQueue key={`cosign-${w.id}`} agentWalletId={w.id} profileWallet={profileWallet} />
      ))}

      {/* Policy editor dialog */}
      <Dialog open={!!editingWallet} onOpenChange={(open) => !open && setEditingWallet(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle>
              Edit Policy {editingWallet?.label ? `\u2014 ${editingWallet.label}` : ''}
            </DialogTitle>
          </DialogHeader>
          {editingWallet && (
            <PolicyBuilder
              agentWalletId={editingWallet.id}
              chain={editingWallet.chain}
              onSaved={() => setEditingWallet(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
