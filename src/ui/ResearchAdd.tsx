import { type CSSProperties, type DragEvent, useRef, useState } from 'react';
import { Icon } from './Icon';
import { type IconName } from './iconArt';
import { webAddress } from '../storage/research';

interface Props {
  /** The web address this note keeps, if it is a web page. */
  url: string | null;
  /** Files picked or dropped, to show in this note (the first) and after it (any more). */
  onFiles: (files: File[]) => void;
  /** A web address typed, pasted or dropped. */
  onAddress: (href: string) => void;
  /** Takes the web address off the note. */
  onForgetAddress: () => void;
  style?: CSSProperties;
}

interface Kind {
  label: string;
  icon: IconName;
  accept: string;
  hint: string;
}

/** What Scrivener's Research takes, picked by kind so the file picker shows only those. */
const KINDS: Kind[] = [
  { label: 'PDF', icon: 'page', accept: '.pdf,application/pdf', hint: 'A PDF, shown page by page with its words selectable' },
  { label: 'Picture', icon: 'picture', accept: 'image/*,.heic,.heif,.tif,.tiff', hint: 'A photo, drawing, map or scan' },
  { label: 'Sound or film', icon: 'film', accept: 'audio/*,video/*,.m4a,.aiff,.caf,.mov,.m4v', hint: 'A recording or a film clip' },
  { label: 'Words', icon: 'book', accept: '.docx,.md,.markdown,.txt', hint: 'A Word, Markdown or text file, brought in as text' },
  { label: 'Any file', icon: 'add', accept: '', hint: 'Anything else, kept with the recipe to save out later' },
];
const SAVED_PAGE = '.webarchive,.html,.htm,.xhtml,.mht,.mhtml,.pdf';

/** A web address carried by a drag from a browser's address bar or a link. */
function droppedAddress(e: DragEvent): string | null {
  const list = e.dataTransfer.getData('text/uri-list').split(/\r?\n/).find((l) => l && !l.startsWith('#'));
  return webAddress(list ?? e.dataTransfer.getData('text/plain'));
}

/**
 * Above a Research note's page: one click to bring in what Scrivener's Research holds (a PDF, a
 * picture, a web page, sound or film, words or any other file), or drop it here. A note that keeps
 * a web address shows it instead, with a way to add the page itself once saved from a browser.
 * Nothing here goes online.
 */
export function ResearchAdd({ url, onFiles, onAddress, onForgetAddress, style }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [over, setOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const typedAddress = webAddress(typed);

  const pick = (accept: string) => {
    const el = input.current;
    if (!el) return;
    el.accept = accept;
    el.click();
  };
  const addTyped = () => {
    if (!typedAddress) return;
    onAddress(typedAddress);
    setTyping(false);
    setTyped('');
  };
  const drop = {
    onDragOver: (e: DragEvent) => {
      const t = e.dataTransfer.types;
      if (!t.includes('Files') && !t.includes('text/uri-list') && !t.includes('text/plain')) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      setOver(true);
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
    },
    onDrop: (e: DragEvent) => {
      setOver(false);
      const files = Array.from(e.dataTransfer.files);
      const href = files.length === 0 ? droppedAddress(e) : null;
      if (files.length === 0 && !href) return;
      e.preventDefault();
      e.stopPropagation();
      if (files.length > 0) onFiles(files);
      else if (href) onAddress(href);
    },
  };

  const picker = (
    <input
      ref={input}
      type="file"
      multiple
      hidden
      onChange={(e) => {
        const files = Array.from(e.currentTarget.files ?? []);
        e.currentTarget.value = '';
        if (files.length > 0) onFiles(files);
      }}
    />
  );

  if (url) {
    return (
      <section className={`research-viewer research-add is-link${over ? ' is-over' : ''}`} style={style} aria-label={`Web page: ${url}`} {...drop}>
        <header className="research-bar">
          <Icon name="web" size={15} />
          <span className="research-kind">Web page</span>
          <a className="research-name research-link" href={url} target="_blank" rel="noopener noreferrer" title="Open in your browser">
            {url}
          </a>
          <button
            className="research-save"
            onClick={() => {
              void navigator.clipboard?.writeText(url).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? 'Copied' : 'Copy address'}
          </button>
          <button className="icon-btn" aria-label="Take the address off this note" title="Take the address off this note" onClick={onForgetAddress}>
            <Icon name="remove" size={13} />
          </button>
        </header>
        <div className="research-add-body">
          <p className="research-add-tip">
            To keep the page itself, save it from your browser (as a Web Archive, a web page or a PDF), then{' '}
            <button className="text-link" onClick={() => pick(SAVED_PAGE)}>
              add the saved page
            </button>{' '}
            or drop it here. It then shows here, even with no connection.
          </p>
        </div>
        {picker}
      </section>
    );
  }

  return (
    <section className={`research-viewer research-add${over ? ' is-over' : ''}`} style={style} aria-label="Add research" {...drop}>
      <header className="research-bar">
        <Icon name="research" size={15} />
        <span className="research-kind">Add to this note</span>
        <span className="research-name">{over ? 'Let go to add it here.' : 'or drop files or a web address here'}</span>
      </header>
      <div className="research-add-body">
        <div className="research-add-kinds" role="group" aria-label="Kinds of research">
          {KINDS.slice(0, 2).map((k) => (
            <button key={k.label} className="research-kind-btn" title={k.hint} onClick={() => pick(k.accept)}>
              <Icon name={k.icon} size={16} />
              {k.label}
            </button>
          ))}
          <button className="research-kind-btn" aria-pressed={typing} title="A web page’s address, to open in your browser" onClick={() => setTyping((t) => !t)}>
            <Icon name="web" size={16} />
            Web page
          </button>
          {KINDS.slice(2).map((k) => (
            <button key={k.label} className="research-kind-btn" title={k.hint} onClick={() => pick(k.accept)}>
              <Icon name={k.icon} size={16} />
              {k.label}
            </button>
          ))}
        </div>
        {typing && (
          <form
            className="research-address"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              addTyped();
            }}
          >
            <input
              autoFocus
              type="text"
              inputMode="url"
              spellCheck={false}
              placeholder="Paste or type the page’s address"
              aria-label="Web address"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setTyping(false);
                }
              }}
            />
            <button type="submit" className="research-save" disabled={!typedAddress}>
              Add
            </button>
          </form>
        )}
      </div>
      {picker}
    </section>
  );
}
