import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SplitSquareHorizontal, X } from 'lucide-react';

interface SplitInputProps {
    onSplitChange: (amounts: number[], isSplitMode: boolean) => void;
}

export function SplitInput({ onSplitChange }: SplitInputProps) {
    const [isSplitMode, setIsSplitMode] = useState(false);
    const [splitText, setSplitText] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleToggle = (checked: boolean) => {
        setIsSplitMode(checked);
        if (!checked) {
            onSplitChange([], false);
            setError(null);
        } else {
            parseAndNotify(splitText, true);
        }
    };

    const parseAndNotify = (text: string, active: boolean = isSplitMode) => {
        if (!text.trim()) {
            onSplitChange([], active);
            setError(null);
            return;
        }

        const parts = text.split(',').map(p => p.trim()).filter(p => p !== '');
        if (parts.length > 100) {
            setError('Maximum 100 entries allowed.');
            onSplitChange([], active);
            return;
        }

        const amounts: number[] = [];
        for (const part of parts) {
            const val = parseFloat(part);
            if (isNaN(val) || val <= 0) {
                setError(`Invalid amount: "${part}". Must be a positive number.`);
                onSplitChange([], active);
                return;
            }
            amounts.push(val);
        }

        setError(null);
        onSplitChange(amounts, active);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSplitText(e.target.value);
        parseAndNotify(e.target.value);
    };

    return (
        <div className="space-y-4 border border-border bg-secondary/50 rounded-xl p-4 transition-all">
            <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                    <Label className="text-sm font-medium flex items-center gap-2">
                        <SplitSquareHorizontal size={16} className="text-primary" />
                        Split Mode
                    </Label>
                    <p className="text-xs text-muted-foreground">Generate multiple links at once</p>
                </div>
                <Switch checked={isSplitMode} onCheckedChange={handleToggle} />
            </div>

            {isSplitMode && (
                <div className="space-y-2 pt-2 border-t border-border animate-in fade-in slide-in-from-top-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                        AMOUNTS (COMMA-SEPARATED)
                    </Label>
                    <div className="relative">
                        <Input
                            value={splitText}
                            onChange={handleChange}
                            placeholder="e.g. 10, 20, 15, 5"
                            className="bg-background"
                        />
                        {splitText && (
                            <button
                                onClick={() => { setSplitText(''); parseAndNotify(''); }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                    {error && <p className="text-xs text-red-500">{error}</p>}
                    {!error && splitText && (
                        <p className="text-xs text-green-400">
                            Valid: {splitText.split(',').filter(p => p.trim() !== '').length} links ready.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
