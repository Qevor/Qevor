import type { QevorChainEnvironment } from '@/lib/chains';
import { cn } from '@/lib/utils';

interface ChainEnvironmentToggleProps {
  value: QevorChainEnvironment;
  onChange: (environment: QevorChainEnvironment) => void;
  className?: string;
}

export function ChainEnvironmentToggle({ value, onChange, className }: ChainEnvironmentToggleProps) {
  const environments = [
    { key: 'testnet', label: 'Testnet' },
    { key: 'mainnet', label: 'Mainnet' },
  ] as const;

  return (
    <div
      className={cn(
        'inline-grid grid-cols-2 gap-1 rounded-xl border border-border bg-secondary/70 p-1 shadow-sm',
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
              'h-8 rounded-lg px-3 text-xs font-semibold transition-colors',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
          >
            {environment.label}
          </button>
        );
      })}
    </div>
  );
}
