import { useEffect, useState } from 'react';
import { page, describeError, getActiveTab } from '../lib/messaging';
import type { AnimationInfo, BreakpointInfo } from '../lib/types';
import { safeJson, truncate } from '../lib/utils';
import { getLocal, setLocal } from '../lib/storage';
import {
  Badge, Button, Card, CopyButton, EmptyState, Field, Input, ListItem, Loading,
  Notice, Segmented, Toggle, ToolHeader,
} from '../components/ui';

export function BreakpointViewerTool() {
  const [items, setItems] = useState<BreakpointInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState('');

  const load = async () => {
    setBusy(true);
    setError('');
    setUpdated('');
    try {
      const result = await page.query<BreakpointInfo[]>('breakpoints');
      setItems(Array.isArray(result) ? result : []);
      setUpdated(new Date().toLocaleTimeString());
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const active = items.filter((item) => item.matches);

  return (
    <div className="stack">
      <ToolHeader
        title="Breakpoint Viewer"
        description="See the media queries declared on the page and which ones currently match."
        actions={<Badge tone="accent">{active.length} active / {items.length} total</Badge>}
      />
      <Card title="Media queries" actions={<Button variant="soft" disabled={busy} onClick={() => void load()}>Refresh</Button>}>
        <div className="stack">
          {busy && <Loading label="Reading media queries…" />}
          <Notice>{error}</Notice>
          <Notice tone="success">{updated ? `Refreshed at ${updated}.` : ''}</Notice>
          <div className="row wrap">
            <CopyButton value={active.length ? safeJson(active) : ''} label="Copy active list" />
          </div>
          {items.length === 0 ? (
            <EmptyState>No media queries were found on this page. Refresh after styles have loaded.</EmptyState>
          ) : (
            <div className="result-list">
              {items.map((item, index) => (
                <ListItem
                  key={`${item.condition}-${index}`}
                  title={<span className="mono">{item.condition}</span>}
                  subtitle={<span className="muted">Source: {item.source || 'stylesheet'}</span>}
                  right={<Badge tone={item.matches ? 'success' : 'default'}>{item.matches ? 'Active' : 'Inactive'}</Badge>}
                />
              ))}
            </div>
          )}
          <Notice tone="info">
            The extension panel cannot observe page resizes. Press Refresh after changing the browser window size.
          </Notice>
        </div>
      </Card>
    </div>
  );
}

type AnimationTone = 'success' | 'warning' | 'default';

function toneForState(state: string): AnimationTone {
  const value = state.toLowerCase();
  if (value === 'running') return 'success';
  if (value === 'paused') return 'warning';
  return 'default';
}

export function AnimationInspectorTool() {
  const [items, setItems] = useState<AnimationInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [slowMotion, setSlowMotion] = useState(false);
  const [paused, setPaused] = useState(false);

  const load = async () => {
    setBusy(true);
    setError('');
    setDone('');
    try {
      const result = await page.query<AnimationInfo[]>('animations');
      setItems(Array.isArray(result) ? result : []);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const runAction = async (code: string, message: string, onSuccess?: () => void) => {
    setBusy(true);
    setError('');
    setDone('');
    try {
      await page.eval(code);
      if (onSuccess) onSuccess();
      setDone(message);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  };

  const setSpeed = (slow: boolean) => {
    const code = slow
      ? 'document.getAnimations().forEach(a => a.playbackRate = 0.2)'
      : 'document.getAnimations().forEach(a => a.playbackRate = 1)';
    void runAction(code, slow ? 'Slow motion enabled (0.2×).' : 'Normal speed restored (1×).', () => setSlowMotion(slow));
  };

  return (
    <div className="stack">
      <ToolHeader
        title="Animation Inspector"
        description="List running animations and transitions, then slow them down or pause them all."
        actions={<Badge tone={paused ? 'warning' : slowMotion ? 'accent' : 'default'}>{paused ? 'Paused' : slowMotion ? '0.2× speed' : '1× speed'}</Badge>}
      />
      <Card title="Playback controls" actions={<Button variant="soft" disabled={busy} onClick={() => void load()}>Refresh</Button>}>
        <div className="stack">
          <Toggle
            checked={slowMotion}
            onChange={setSpeed}
            label="Slow motion"
            hint="Sets every active animation to 0.2× playback."
          />
          <div className="row wrap">
            <Button variant="outline" disabled={busy} onClick={() => setSpeed(false)}>Normal speed</Button>
            <Button
              variant="soft"
              disabled={busy}
              onClick={() => void runAction(
                'document.getAnimations().forEach(a => a.pause())',
                'All animations paused.',
                () => setPaused(true),
              )}
            >
              Pause all
            </Button>
            <Button
              variant="soft"
              disabled={busy}
              onClick={() => void runAction(
                'document.getAnimations().forEach(a => a.play())',
                'All animations resumed.',
                () => setPaused(false),
              )}
            >
              Resume all
            </Button>
            <CopyButton value={safeJson(items)} label="Copy JSON" />
          </div>
          {busy && <Loading label="Applying to the page…" />}
          <Notice>{error}</Notice>
          <Notice tone="success">{done}</Notice>
        </div>
      </Card>
      <Card title="Animations" actions={<Badge>{items.length} found</Badge>}>
        {items.length === 0 ? (
          <EmptyState>No animations or transitions were detected on this page.</EmptyState>
        ) : (
          <div className="result-list">
            {items.map((item, index) => (
              <ListItem
                key={`${item.target}-${item.name}-${index}`}
                title={<span className="mono">{truncate(item.target, 110)}</span>}
                subtitle={
                  <div className="row wrap">
                    <span className="chip mono">{item.name}</span>
                    <span className="muted mono">duration {item.duration}</span>
                    <span className="muted mono">delay {item.delay}</span>
                    <span className="muted mono">iterations {item.iteration}</span>
                  </div>
                }
                right={<Badge tone={toneForState(item.state)}>{item.state}</Badge>}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

interface EnvironmentRule {
  id: string;
  label: string;
  from: string;
  to: string;
}

interface RuleInput {
  label: string;
  from: string;
  to: string;
}

function normalizeHost(value: string): string {
  return value.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#]/)[0].toLowerCase();
}

function createRuleId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const PRESETS: RuleInput[] = [
  { label: 'Staging (3000)', from: 'localhost:3000', to: 'staging.example.com' },
  { label: 'Dev (5173)', from: 'localhost:5173', to: 'dev.example.com' },
];

export function EnvironmentSwitcherTool() {
  const [rules, setRules] = useState<EnvironmentRule[]>([]);
  const [label, setLabel] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [targetMode, setTargetMode] = useState<'current' | 'new'>('current');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await getLocal<EnvironmentRule[]>('environments', []);
        if (!cancelled) setRules(Array.isArray(stored) ? stored : []);
      } catch (caught) {
        if (!cancelled) setError(describeError(caught));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const addRule = async (input: RuleInput) => {
    const nextLabel = input.label.trim();
    const nextFrom = normalizeHost(input.from);
    const nextTo = normalizeHost(input.to);
    setError('');
    setDone('');
    if (!nextLabel || !nextFrom || !nextTo) {
      setError('Label, from, and to are all required.');
      return;
    }
    if (rules.some((rule) => rule.from === nextFrom && rule.to === nextTo)) {
      setError(`A rule for ${nextFrom} → ${nextTo} already exists.`);
      return;
    }
    setBusy(true);
    try {
      const next = [...rules, { id: createRuleId(), label: nextLabel, from: nextFrom, to: nextTo }];
      await setLocal('environments', next);
      setRules(next);
      setLabel('');
      setFrom('');
      setTo('');
      setDone(`Saved rule “${nextLabel}”.`);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  };

  const removeRule = async (id: string) => {
    setBusy(true);
    setError('');
    setDone('');
    try {
      const next = rules.filter((rule) => rule.id !== id);
      await setLocal('environments', next);
      setRules(next);
      setDone('Rule deleted.');
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  };

  const openRule = async (rule: EnvironmentRule) => {
    setBusy(true);
    setError('');
    setDone('');
    try {
      const tab = await getActiveTab();
      if (!tab.url) throw new Error('The active tab has no URL to rewrite.');
      const target = new URL(tab.url);
      if (!target.host.includes(rule.from)) {
        throw new Error(`Current host “${target.host}” does not match “${rule.from}”.`);
      }
      target.host = target.host.replace(rule.from, rule.to);
      const nextUrl = target.toString();
      if (targetMode === 'current') {
        await chrome.tabs.update(tab.id!, { url: nextUrl });
      } else {
        await chrome.tabs.create({ url: nextUrl });
      }
      setDone(`Opened ${nextUrl}`);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <ToolHeader
        title="Environment Switcher"
        description="Rewrite a hostname prefix to jump between local, staging, and production environments."
        actions={<Badge>{rules.length} rules</Badge>}
      />
      <Card title="Add a rule">
        <div className="stack">
          <Notice tone="info">
            “From” and “to” are hostname prefixes such as localhost:3000 or staging.example.com. Paths, queries, and hashes are preserved.
          </Notice>
          <div className="grid-2">
            <Field label="Label">
              <Input value={label} placeholder="Staging" onChange={(event) => setLabel(event.target.value)} />
            </Field>
            <Field label="Open in">
              <Segmented<'current' | 'new'>
                options={[{ value: 'current', label: 'Current tab' }, { value: 'new', label: 'New tab' }]}
                value={targetMode}
                onChange={setTargetMode}
              />
            </Field>
            <Field label="From (hostname prefix)">
              <Input value={from} placeholder="localhost:3000" onChange={(event) => setFrom(event.target.value)} />
            </Field>
            <Field label="To (hostname prefix)">
              <Input value={to} placeholder="staging.example.com" onChange={(event) => setTo(event.target.value)} />
            </Field>
          </div>
          <div className="row wrap">
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void addRule({ label, from, to })}
            >
              Add rule
            </Button>
            {PRESETS.map((preset) => (
              <Button
                key={preset.from}
                variant="ghost"
                disabled={busy}
                onClick={() => void addRule(preset)}
              >
                {preset.from} → {preset.to}
              </Button>
            ))}
          </div>
          {busy && <Loading label="Saving or opening…" />}
          <Notice>{error}</Notice>
          <Notice tone="success">{done}</Notice>
        </div>
      </Card>
      <Card title="Saved rules" actions={<Badge>{rules.length} saved</Badge>}>
        {rules.length === 0 ? (
          <EmptyState>No rules yet. Add one above or use a quick preset.</EmptyState>
        ) : (
          <div className="result-list">
            {rules.map((rule) => (
              <ListItem
                key={rule.id}
                title={<span className="mono">{rule.label}</span>}
                subtitle={
                  <span className="muted mono">{rule.from} → {rule.to}</span>
                }
                right={
                  <div className="row wrap">
                    <Button variant="primary" disabled={busy} onClick={() => void openRule(rule)}>Open here</Button>
                    <Button variant="danger" disabled={busy} onClick={() => void removeRule(rule.id)}>Delete</Button>
                  </div>
                }
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
