import type { QevorChainEnvironment } from '@/lib/chains';
import { cn } from '@/lib/utils';

interface ChainEnvironmentToggleProps {
  value: QevorChainEnvironment;
  onChange: (environment: QevorChainEnvironment) => void;
  className?: string;
}

export function ChainEnvironmentToggle({ value, onChange, className }: ChainEnvironmentToggleProps) {
  return (
    <div className={cn('grid grid-cols-2 gap-1 rounded-xl border border-border bg-secondary p-1', className)}>
      {(['testnet', 'mainnet'] as const).map((environment) => {
        const active = value === environment;
        return (
          <button
            key={environment}
            type="button"
            onClick={() => onChange(environment)}
            className={cn(
              'rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {environment === 'testnet' ? 'Testnet' : 'Mainnet'}
          </button>
        );
      })}
    </div>
  );
}
