import { useId, useRef, useState } from 'react';
import { Icon } from './Icons';
import { track } from '../lib/track';

/**
 * The shortest possible "get started" surface, designed to make a human think
 * "my agent can do this in a minute": a prompt to paste into any agent, the
 * three API calls, and a one-line skill install.
 */

export const AGENT_PROMPT =
  'Get yourself an email address at BaseMail by following https://basemail.ai/llms.txt. Create an EVM wallet if you have none and keep the private key and token; a 0x…@basemail.ai address is fine. Reply with your new address.';

const CALLS = `POST https://api.basemail.ai/api/auth/start           { address }
POST https://api.basemail.ai/api/auth/agent-register  { address, signature, message }
POST https://api.basemail.ai/api/send                 { to, subject, body }`;

const SKILL = `npx clawhub@latest install basemail`;

type TabKey = 'prompt' | 'calls' | 'skill';
const TABS: { k: TabKey; label: string; text: string; copyLabel: string }[] = [
  { k: 'prompt', label: 'Prompt for your agent', text: AGENT_PROMPT, copyLabel: 'Copy prompt' },
  { k: 'calls', label: '3 API calls', text: CALLS, copyLabel: 'Copy' },
  { k: 'skill', label: 'Skill', text: SKILL, copyLabel: 'Copy' },
];

export default function AgentQuickstart({ compact = false, defaultTab = 'prompt' }: { compact?: boolean; defaultTab?: TabKey }) {
  const [tab, setTab] = useState<TabKey>(defaultTab);
  const [copied, setCopied] = useState(false);
  const id = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const current = TABS.find((t) => t.k === tab)!;

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.k === tab);
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else return;
    e.preventDefault();
    setTab(TABS[next].k);
    refs.current[TABS[next].k]?.focus();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(current.text);
      setCopied(true);
      track('code_copy', { lang: tab });
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="code-panel">
      <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-line bg-surface-2/60">
        <div role="tablist" aria-label="Ways to get started" className="flex items-center gap-1 flex-wrap" onKeyDown={onKeyDown}>
          {TABS.filter((t) => !compact || t.k === 'prompt').map((t) => (
            <button
              key={t.k}
              type="button"
              role="tab"
              id={`${id}-tab-${t.k}`}
              aria-selected={tab === t.k}
              aria-controls={`${id}-panel`}
              tabIndex={tab === t.k ? 0 : -1}
              ref={(el) => { refs.current[t.k] = el; }}
              onClick={() => setTab(t.k)}
              className={`btn btn-sm ${tab === t.k ? 'bg-surface text-fg border border-line' : 'btn-ghost'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-primary btn-sm ml-auto" onClick={copy}>
          {copied ? <Icon.Check size={14} /> : <Icon.Copy size={14} />}
          {copied ? 'Copied' : current.copyLabel}
        </button>
        <span role="status" aria-live="polite" className="sr-only">{copied ? 'Copied to clipboard' : ''}</span>
      </div>

      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`}>
        {tab === 'prompt' ? (
          <div className="p-5">
            <p className="font-mono text-[15px] leading-7 text-fg whitespace-pre-wrap">{AGENT_PROMPT}</p>
            <p className="mt-4 text-xs text-fg-subtle">
              Paste into Claude Code, Cursor, OpenClaw or any agent that can fetch a URL and sign with a wallet.
              The agent reads <a href="/llms.txt" className="link font-mono">llms.txt</a> and does the rest.
            </p>
          </div>
        ) : tab === 'calls' ? (
          <div className="p-5">
            <pre tabIndex={0} className="!p-0 !text-[13px]"><code className="font-mono whitespace-pre">{CALLS}</code></pre>
            <p className="mt-4 text-xs text-fg-subtle">
              Sign the message from call 1 with the wallet; call 2 returns <span className="font-mono text-fg">token</span> and{' '}
              <span className="font-mono text-fg">email</span>. Full curl / Python / TypeScript on the{' '}
              <a href="/developers#quickstart" className="link">developer portal</a>.
            </p>
          </div>
        ) : (
          <div className="p-5">
            <pre tabIndex={0} className="!p-0 !text-[15px]"><code className="font-mono whitespace-pre">$ {SKILL}</code></pre>
            <p className="mt-4 text-xs text-fg-subtle">
              Installs the BaseMail skill for OpenClaw-compatible agents (register, send, read inbox, buy a Basename).{' '}
              <a href="https://github.com/dAAAb/BaseMail/tree/main/skill" target="_blank" rel="noopener noreferrer" className="link">Source</a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
