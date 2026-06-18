import type { QevorChainEnvironment } from '@/lib/chains';
import { cn } from '@/lib/utils';

interface ChainEnvironmentToggleProps {
  value: QevorChainEnvironment;
  onChange: (environment: QevorChainEnvironment) => void;
  className?: string;
}

export function ChainEnvironmentToggle({ value, onChange, className }: ChainEnvironmentToggleProps) {
  const environments = [
    { key: 'testnet', label: 'Testnet', helper: 'Sandbox' },
    { key: 'mainnet', label: 'Mainnet', helper: 'Live funds' },
  ] as const;

  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-1 rounded-2xl border border-primary/30 bg-background/60 p-1 shadow-sm',
        className,
      )}
      aria-label="Rail environment"
    >
      {environments.map((environment) => {
        const active = value === environment.key;
        return (
          <button
            key={environment.key}
            type="button"
            onClick={() => onChange(environment.key)}
            className={cn(
              'rounded-xl px-3 py-2 text-left transition-colors',
              active
                ? 'bg-primary text-primary-foreground shadow-glow'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
          >
            <span className="block text-sm font-bold">{environment.label}</span>
            <span className={cn('block text-xs', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
              {environment.helper}
            </span>
          </button>
        );
      })}
    </div>
  );
}
