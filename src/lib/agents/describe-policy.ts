import type { AgentPolicy } from './types';

export function describePolicy(policy: AgentPolicy): string {
  const parts: string[] = [];

  if (policy.max_per_tx_usdc != null) {
    parts.push(`up to $${policy.max_per_tx_usdc} per transfer`);
  }
  if (policy.daily_cap_usdc != null) {
    parts.push(`$${policy.daily_cap_usdc} per day`);
  }
  if (policy.weekly_cap_usdc != null) {
    parts.push(`$${policy.weekly_cap_usdc} per week`);
  }
  if (policy.monthly_cap_usdc != null) {
    parts.push(`$${policy.monthly_cap_usdc} per month`);
  }

  if (policy.allowlist_usernames.length > 0) {
    const names = policy.allowlist_usernames.map((u) => `@${u}`).join(', ');
    parts.push(`only to ${names}`);
  } else if (policy.allowlist_addresses.length > 0) {
    const count = policy.allowlist_addresses.length;
    parts.push(`only to ${count} allowlisted address${count > 1 ? 'es' : ''}`);
  }

  if (policy.blocklist_usernames.length > 0) {
    const names = policy.blocklist_usernames.map((u) => `@${u}`).join(', ');
    parts.push(`never to ${names}`);
  }

  if (policy.allowed_hours_utc) {
    // Parse int4range like "[9,18)"
    const match = policy.allowed_hours_utc.match(/\[(\d+),(\d+)\)/);
    if (match) {
      const from = match[1].padStart(2, '0');
      const to = match[2].padStart(2, '0');
      parts.push(`between ${from}:00\u2013${to}:00 UTC`);
    }
  }

  if (policy.cosign_threshold_usdc != null) {
    parts.push(`anything over $${policy.cosign_threshold_usdc} requires your approval`);
  }

  if (parts.length === 0) {
    return 'No restrictions. This agent can send without limits.';
  }

  // Capitalize first part, join with commas, and end with period.
  const sentence = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  if (parts.length === 1) return `This agent can send ${parts[0]}.`;

  const last = parts[parts.length - 1];
  const rest = parts.slice(0, -1);

  // Special case: cosign threshold is a separate sentence
  if (policy.cosign_threshold_usdc != null && parts.length > 1) {
    const mainParts = rest.filter((_, i) => i < rest.length || !rest[rest.length - 1].includes('approval'));
    return `This agent can send ${mainParts.join(', ')}. ${last.charAt(0).toUpperCase() + last.slice(1)}.`;
  }

  return `This agent can send ${rest.join(', ')}, ${last}.`;
}
