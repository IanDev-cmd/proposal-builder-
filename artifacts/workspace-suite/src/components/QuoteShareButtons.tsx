import { Mail, Link2 } from 'lucide-react';
import type { ShareChannel } from '@/lib/quoteShare';
import type { SavedQuote } from '@/lib/savedQuotesStore';

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12.04 2C6.58 2 2.15 6.4 2.15 11.84c0 1.74.46 3.44 1.33 4.94L2 22l5.37-1.4a10 10 0 0 0 4.67 1.18h.01c5.46 0 9.89-4.4 9.89-9.84C21.94 6.4 17.5 2 12.04 2zm5.75 14.12c-.24.68-1.4 1.3-1.94 1.34-.5.04-1.12.06-1.8-.11-.42-.1-.95-.3-1.64-.6-2.89-1.25-4.77-4.16-4.92-4.36-.14-.2-1.18-1.57-1.18-3 0-1.42.74-2.12 1.01-2.4.26-.28.58-.35.77-.35h.56c.18 0 .42-.07.66.5.24.6.82 2.06.9 2.2.07.15.12.32.02.51-.1.2-.14.32-.28.5-.14.17-.3.38-.42.51-.14.14-.28.3-.12.58.16.28.7 1.16 1.5 1.88 1.04.93 1.9 1.22 2.2 1.36.28.13.45.11.62-.07.16-.17.7-.81.88-1.09.18-.28.37-.23.62-.14.26.1 1.63.77 1.91.91.28.14.46.21.53.32.07.12.07.68-.17 1.36z" />
    </svg>
  );
}

function DropboxIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M7.04 3.4 2 6.7l5.04 3.3L12 6.7 7.04 3.4zm9.92 0L12 6.7l4.96 3.3L22 6.7l-5.04-3.3zM2 13.3l5.04 3.3L12 13.3 7.04 10 2 13.3zm20 0L16.96 10 12 13.3l4.96 3.3L22 13.3zM7.04 17.7 12 21l4.96-3.3L12 14.4l-4.96 3.3z" />
    </svg>
  );
}

function DriveIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#0F9D58" d="M4.4 20.4 8.1 14h7.8l-3.7 6.4H4.4z" />
      <path fill="#4285F4" d="m8.1 14 3.9-6.8h7.6L15.9 14H8.1z" />
      <path fill="#F4B400" d="M4.4 20.4 8.1 14 12 7.2 8.3 13.6 4.4 20.4z" />
      <path fill="#DD4B39" d="m12 7.2 3.7 6.8 3.9-6.8H12z" />
    </svg>
  );
}

type Props = {
  quote: SavedQuote;
  onBlue?: boolean;
  copied?: boolean;
  onShare: (channel: ShareChannel, quote: SavedQuote) => void;
};

export function QuoteShareButtons({ quote, onBlue = false, copied, onShare }: Props) {
  const iconCls = onBlue ? 'text-white' : 'text-slate-600';
  const btn = 'flex h-9 w-9 items-center justify-center rounded-[10px] transition-transform hover:scale-105';
  const bg = onBlue ? 'bg-white/15 hover:bg-white/25' : 'bg-white shadow-sm hover:bg-slate-50';
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" title="Email" aria-label="Share via Gmail" className={`${btn} ${bg}`} onClick={() => onShare('email', quote)}>
        <Mail className={`h-4 w-4 ${onBlue ? 'text-white' : 'text-[#EA4335]'}`} />
      </button>
      <button type="button" title="WhatsApp" aria-label="Share via WhatsApp" className={`${btn} ${bg}`} onClick={() => onShare('whatsapp', quote)}>
        <WhatsAppIcon className={`h-4 w-4 ${onBlue ? 'text-white' : 'text-[#25D366]'}`} />
      </button>
      <button type="button" title="Dropbox" aria-label="Save to Dropbox" className={`${btn} ${bg}`} onClick={() => onShare('dropbox', quote)}>
        <DropboxIcon className={`h-4 w-4 ${onBlue ? 'text-white' : 'text-[#0061FF]'}`} />
      </button>
      <button type="button" title="Google Drive" aria-label="Save to Google Drive" className={`${btn} ${bg}`} onClick={() => onShare('drive', quote)}>
        <DriveIcon className="h-4 w-4" />
      </button>
      <button type="button" title={copied ? 'Copied' : 'Copy link'} aria-label="Copy link" className={`${btn} ${bg}`} onClick={() => onShare('link', quote)}>
        <Link2 className={`h-4 w-4 ${iconCls}`} />
      </button>
    </div>
  );
}
