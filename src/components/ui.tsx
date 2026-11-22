import React, { useEffect, useState } from 'react';
import { Check, Copy, Loader2 } from 'lucide-react';
import { copyText, truncate } from '../lib/utils';

export function ToolHeader({ title, description, actions, badge }: {
  title: string; description?: string; actions?: React.ReactNode; badge?: string;
}) {
  return (
    <div className="tool-header">
      <div className="tool-header-text">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      <div className="tool-header-actions">
        {badge && <span className="badge badge-accent">{badge}</span>}
        {actions}
      </div>
    </div>
  );
}

export function Card({ title, children, className = '', actions }: {
  title?: string; children: React.ReactNode; className?: string; actions?: React.ReactNode;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          {title && <h3>{title}</h3>}
          <div className="card-actions">{actions}</div>
        </div>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}

type ButtonVariant = 'primary' | 'soft' | 'ghost' | 'danger' | 'outline';

export function Button({ children, onClick, variant = 'soft', disabled, title, className = '', type = 'button', icon }: {
  children?: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  title?: string;
  className?: string;
  type?: 'button' | 'submit';
  icon?: React.ReactNode;
}) {
  return (
    <button type={type} className={`btn btn-${variant} ${className}`} onClick={onClick} disabled={disabled} title={title}>
      {icon}
      {children}
    </button>
  );
}

export function IconButton({ onClick, children, title, className = '', disabled }: {
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode; title?: string; className?: string; disabled?: boolean;
}) {
  return <button type="button" className={`icon-btn ${className}`} onClick={onClick} title={title} disabled={disabled}>{children}</button>;
}

export function Field({ label, hint, children, className = '' }: {
  label: string; hint?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input(props, ref) { return <input ref={ref} className="input" {...props} /> },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea(props, ref) { return <textarea ref={ref} className="textarea" {...props} /> },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select(props, ref) { return <select ref={ref} className="select" {...props} /> },
);

export function Toggle({ checked, onChange, label, hint }: {
  checked: boolean; onChange: (checked: boolean) => void; label: string; hint?: string;
}) {
  return (
    <div className="toggle-row">
      <div>
        <div className="toggle-label">{label}</div>
        {hint && <div className="field-hint">{hint}</div>}
      </div>
      <button
        type="button"
        className={`toggle ${checked ? 'toggle-on' : ''}`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
      ><span /></button>
    </div>
  );
}

export function Badge({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'accent' | 'success' | 'warning' | 'danger' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Notice({ children, tone = 'error' }: { children: React.ReactNode; tone?: 'error' | 'success' | 'info' }) {
  if (!children) return null;
  return <div className={`notice notice-${tone}`}>{children}</div>;
}

export function EmptyState({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return <div className="empty-state">{icon}{<p>{children}</p>}</div>;
}

export function Loading({ label = 'Working…' }: { label?: string }) {
  return <div className="loading"><Loader2 size={16} className="spin" /> {label}</div>;
}

export function CopyButton({ value, label = 'Copy', className = '' }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(id);
  }, [copied]);
  return (
    <Button
      className={className}
      variant="ghost"
      disabled={!value}
      onClick={async () => { if (await copyText(value)) setCopied(true); }}
      icon={copied ? <Check size={14} /> : <Copy size={14} />}
    >{copied ? 'Copied' : label}</Button>
  );
}

export function CodeBlock({ value, maxHeight = 260, title }: { value: string; maxHeight?: number; title?: string }) {
  return (
    <div className="code-block">
      {title && <div className="code-block-head"><span>{title}</span><CopyButton value={value} label="Copy" /></div>}
      <pre style={{ maxHeight }}>{value || '—'}</pre>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, active, onChange }: {
  tabs: { id: T; label: string }[]; active: T; onChange: (id: T) => void;
}) {
  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" className={`tab ${active === tab.id ? 'tab-active' : ''}`} onClick={() => onChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (value: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button key={option.value} type="button" className={value === option.value ? 'active' : ''} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Swatch({ color, size = 28, title }: { color: string; size?: number; title?: string }) {
  return <span className="swatch" title={title || color} style={{ background: color, width: size, height: size }} />;
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function ListItem({ title, subtitle, right, onClick, selected }: {
  title: React.ReactNode; subtitle?: React.ReactNode; right?: React.ReactNode; onClick?: () => void; selected?: boolean;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className={`list-item ${selected ? 'selected' : ''}`} onClick={onClick}>
      <div className="list-item-main">
        <div className="list-item-title">{title}</div>
        {subtitle && <div className="list-item-subtitle">{subtitle}</div>}
      </div>
      {right && <div className="list-item-right">{right}</div>}
    </Tag>
  );
}

export function ShortText({ value, length = 90 }: { value: string; length?: number }) {
  return <span title={value}>{truncate(value, length)}</span>;
}

export function useCopyFeedback() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(id);
  }, [copied]);
  const copy = async (value: string) => { if (await copyText(value)) setCopied(true); };
  return { copied, copy };
}
