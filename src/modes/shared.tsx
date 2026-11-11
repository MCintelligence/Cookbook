import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LABELS, STATUSES, eventsField } from '../storage/document';
import { type StoryDate, sayWhen } from '../storage/storyDate';
import { type MenuItem } from '../ui/Menu';
import { StatusIcon } from '../ui/StatusIcon';
import { type Form, type ModeHost } from './host';
import { type Dated, type Item, labelColor, plotlineName, typedDate } from './model';
import { prefsStore } from './prefs';

/** Two or three choices side by side, one of them on. */
export function Seg<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: { id: T; name: string }[]; onPick(id: T): void }) {
  return (
    <span className="mode-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} aria-pressed={o.id === value} onClick={() => onPick(o.id)}>
          {o.name}
        </button>
      ))}
    </span>
  );
}

/** A pulldown in the toolbar, drawn like the Style box. */
export function Pick<T extends string>({ label, value, options, onPick, lead }: { label: string; value: T; options: { id: T; name: string }[]; onPick(id: T): void; lead?: boolean }) {
  return (
    <label className={`tb-select mode-pick${lead ? ' mode-lead' : ''}`}>
      <select aria-label={label} title={label} value={value} onChange={(e) => onPick(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ToolButton({ label, onClick, children, pressed, disabled }: { label: string; onClick(): void; children: ReactNode; pressed?: boolean; disabled?: boolean }) {
  return (
    <button className="mode-btn" title={label} aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

/** Closer, further and everything at once, for the endless boards. */
export function Zoomer({ k, onZoom, onFit }: { k: number; onZoom(dir: 1 | -1): void; onFit(): void }) {
  return (
    <span className="mode-zoom">
      <ToolButton label="Zoom out" onClick={() => onZoom(-1)}>
        −
      </ToolButton>
      <span className="mode-zoom-now" aria-live="off">
        {Math.round(k * 100)}%
      </span>
      <ToolButton label="Zoom in" onClick={() => onZoom(1)}>
        +
      </ToolButton>
      <ToolButton label="Show everything" onClick={onFit}>
        Fit all
      </ToolButton>
    </span>
  );
}

/** The count at the far end of the toolbar. */
export function Tally({ children }: { children: ReactNode }) {
  return <span className="mode-tally">{children}</span>;
}

/** A Pantry Item's picture, or its first letter in its kind's shape: round for Characters, square for Settings, a diamond for Materials. */
export function Face({ host, item, size = 28 }: { host: ModeHost; item: Item; size?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const { portrait, kind, title } = item.card;
  useEffect(() => {
    if (!portrait) return setUrl(null);
    let made: string | null = null;
    let gone = false;
    host.loadPicture(portrait).then(
      (u) => {
        made = u;
        if (gone) URL.revokeObjectURL(u);
        else setUrl(u);
      },
      () => {},
    );
    return () => {
      gone = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [portrait]);
  return (
    <span className={`mode-face kind-${kind}`} style={{ width: size, height: size, fontSize: size * 0.44, ...(url ? { backgroundImage: `url(${url})` } : {}) }} aria-hidden="true">
      {!url && <span>{title.trim()[0]?.toUpperCase() ?? '?'}</span>}
    </span>
  );
}

/** Asks for a date: one day, or a stretch with a last day. */
export function askDate(ask: (form: Form) => void, opts: { title: string; date: StoryDate | null; what?: string | null; save(date: StoryDate): void; clear?: { label: string; pick(): void } }): void {
  ask({
    title: opts.title,
    note: 'Any year will do, long ago or far ahead: 1954-09-03, or 3 September 1954.',
    fields: [
      ...(opts.what !== undefined && opts.what !== null ? [{ key: 'what', label: 'What happens', value: opts.what, placeholder: 'Leaves home', wide: true }] : []),
      { key: 'from', label: 'On', value: opts.date ? sayWhen({ on: opts.date.on }) : '', placeholder: '3 September 1954' },
      { key: 'to', label: 'Until (for a stretch of days)', value: opts.date?.to ? sayWhen({ on: opts.date.to }) : '', placeholder: 'Leave empty for one day' },
    ],
    check: (v) => (typedDate(v.from ?? '', v.to ?? '') ? null : 'That isn’t a day Cookbook can read. Try 1954-09-03 or 3 September 1954.'),
    save: (v) => {
      const date = typedDate(v.from ?? '', v.to ?? '');
      if (date) opts.save(opts.what !== undefined && opts.what !== null ? { ...date, what: (v.what ?? '').trim() } : date);
    },
    other: opts.clear,
  });
}

export const whenField = (date: StoryDate | null): string | undefined => (date ? (date.to && date.to !== date.on ? `${date.on}/${date.to}` : date.on) : undefined);

/** Gives something dated another date, or none: a Shelf Item's own day, or one of a Pantry Item's events. */
export function redate(host: ModeHost, d: Dated, date: StoryDate | null): void {
  if (d.event === null) return void host.setField(d.path, 'when', whenField(date));
  const events = d.card.dates.flatMap((e, i) => (i === d.event ? (date ? [{ ...date, what: e.what }] : []) : [e]));
  void host.setField(d.path, 'events', eventsField(events));
}

/** The right-click menu of something on the calendar or the timeline. */
export function datedMenu(host: ModeHost, d: Dated, ask: (form: Form) => void): MenuItem[] {
  if (d.event === null) return itemMenu(host, { path: d.path, card: d.card, group: d.group }, ask);
  return [
    { label: 'Open in Cook', onPick: () => host.open(d.path) },
    { separator: true },
    { label: 'Change this date…', onPick: () => askDate(ask, { title: `A date for ${d.card.title}`, date: d.date, what: d.date.what ?? '', save: (date) => redate(host, d, date) }) },
    { label: 'Remove this date', danger: true, onPick: () => redate(host, d, null) },
  ];
}

/** The right-click menu of a Shelf Item wherever a view shows it. */
export function itemMenu(host: ModeHost, item: Item, ask: (form: Form) => void): MenuItem[] {
  const { plotlines } = prefsStore.get();
  const when = item.card.dates[0] ?? null;
  return [
    { label: 'Open in Cook', onPick: () => host.open(item.path) },
    { separator: true },
    {
      label: when ? 'Change story date…' : 'Set story date…',
      onPick: () =>
        askDate(ask, {
          title: `When “${item.card.title}” happens`,
          date: when,
          save: (date) => void host.setField(item.path, 'when', whenField(date)),
          clear: when ? { label: 'Clear date', pick: () => void host.setField(item.path, 'when', undefined) } : undefined,
        }),
    },
    {
      label: 'Plotline',
      items: [
        { label: 'None', checked: !item.card.label, onPick: () => void host.setField(item.path, 'label', undefined) },
        ...LABELS.map((l) => ({ label: plotlineName(l.id, plotlines), icon: <span className="mode-dot" style={{ background: l.color }} />, checked: item.card.label === l.id, onPick: () => void host.setField(item.path, 'label', l.id) })),
      ],
    },
    {
      label: 'Status',
      items: STATUSES.map((s) => ({ label: s.label, icon: <StatusIcon status={s.id} decorative />, checked: item.card.status === s.id, onPick: () => void host.setField(item.path, 'status', s.id === 'not-started' ? undefined : s.id) })),
    },
    { label: 'Rename', onPick: () => host.rename(item.path) },
    { separator: true },
    { label: 'Move to trash', danger: true, onPick: () => host.trash(item.path) },
  ];
}

/** The right-click menu of a Pantry Item wherever a view shows it. */
export function cardMenu(host: ModeHost, item: Item, extra: MenuItem[] = []): MenuItem[] {
  return [
    { label: 'Open in Cook', onPick: () => host.open(item.path) },
    ...extra,
    {
      label: 'Label',
      items: [
        { label: 'None', checked: !item.card.label, onPick: () => void host.setField(item.path, 'label', undefined) },
        ...LABELS.map((l) => ({ label: l.name, icon: <span className="mode-dot" style={{ background: l.color }} />, checked: item.card.label === l.id, onPick: () => void host.setField(item.path, 'label', l.id) })),
      ],
    },
    { label: 'Rename', onPick: () => host.rename(item.path) },
    { separator: true },
    { label: 'Move to trash', danger: true, onPick: () => host.trash(item.path) },
  ];
}

export function LabelDot({ label }: { label: string }) {
  const color = labelColor(label);
  return color ? <span className="mode-dot" style={{ background: color }} /> : null;
}

/** A small box that asks for a few words: a date, a plotline's name, how two people are tied. */
export function FormBox({ form, onClose }: { form: Form; onClose(): void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(form.fields.map((f) => [f.key, f.value])));
  const [complaint, setComplaint] = useState<string | null>(null);
  const first = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    first.current?.focus();
    first.current?.select();
  }, []);
  const save = () => {
    const wrong = form.check?.(values) ?? null;
    if (wrong) return setComplaint(wrong);
    onClose();
    form.save(values);
  };
  return (
    <div className="mode-form-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="mode-form"
        role="dialog"
        aria-label={form.title}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <h2>{form.title}</h2>
        <div className="mode-form-fields">
          {form.fields.map((f, i) => (
            <label key={f.key} className={f.wide ? 'wide' : ''}>
              <span>{f.label}</span>
              <input ref={i === 0 ? first : undefined} value={values[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
            </label>
          ))}
        </div>
        {complaint ? (
          <p className="mode-form-note wrong" role="alert">
            {complaint}
          </p>
        ) : (
          form.note && <p className="mode-form-note">{form.note}</p>
        )}
        <div className="mode-form-end">
          {form.other && (
            <button
              type="button"
              className="mode-form-other"
              onClick={() => {
                onClose();
                form.other!.pick();
              }}
            >
              {form.other.label}
            </button>
          )}
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

/** A synopsis written in place. It is saved on leaving the box, not as each letter is typed. */
export function Synopsis({ value, label, onSave, placeholder = 'What happens here?' }: { value: string; label: string; onSave(text: string): void; placeholder?: string }) {
  const [text, setText] = useState(value);
  const box = useRef<HTMLTextAreaElement | null>(null);
  // As tall as its words: measured again when they change, and when the card gets wider or the font arrives.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + 2}px`;
    };
    fit();
    let width = el.clientWidth;
    const watch = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    watch.observe(el);
    void document.fonts?.ready.then(fit);
    return () => watch.disconnect();
  }, [text]);
  return (
    <textarea
      ref={box}
      className="mode-synopsis"
      aria-label={label}
      rows={1}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={() => text.trim() !== value && onSave(text.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          setText(value);
          e.stopPropagation();
        }
      }}
    />
  );
}

/** A date for a small space: "3 Sep 1954", "14 to 16 Sep 1954". */
export function shortWhen(date: Pick<StoryDate, 'on' | 'to'>): string {
  return sayWhen(date).replace(/([A-Z][a-z]{2})[a-z]+/g, '$1');
}
