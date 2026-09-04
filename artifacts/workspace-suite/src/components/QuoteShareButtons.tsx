import { useState } from 'react';
import { Box, HardDrive, Link2, Mail, MessageCircle } from 'lucide-react';
import type { ShareChannel } from '@/lib/quoteShare';
import type { SavedQuote } from '@/lib/savedQuotesStore';
import { ShareOverlay, ShareTriggerButton, type ShareOverlayTarget } from '@/components/ShareOverlay';

type Props = {
  quote: SavedQuote;
  copied?: boolean;
  onShare: (channel: ShareChannel, quote: SavedQuote) => void;
  /** When set, the overlay is controlled by the parent (used from Step 6). */
  open?: boolean;
  onClose?: () => void;
  hideTrigger?: boolean;
  title?: string;
};

export function QuoteShareButtons({
  quote,
  copied,
  onShare,
  open: openProp,
  onClose,
  hideTrigger = false,
  title = 'Share quote',
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? Boolean(openProp) : internalOpen;

  const close = () => {
    if (!controlled) setInternalOpen(false);
    onClose?.();
  };

  const pick = (channel: ShareChannel) => {
    close();
    onShare(channel, quote);
  };

  const targets: ShareOverlayTarget[] = [
    { label: 'Gmail', icon: Mail, color: '#EA4335', onClick: () => pick('email') },
    { label: 'Google Drive', icon: HardDrive, color: '#34A853', onClick: () => pick('drive') },
    { label: 'Dropbox', icon: Box, color: '#0061FF', onClick: () => pick('dropbox') },
    { label: 'WhatsApp', icon: MessageCircle, color: '#25D366', onClick: () => pick('whatsapp') },
    { label: copied ? 'Copied' : 'Copy link', icon: Link2, color: '#1a1a1a', onClick: () => pick('link') },
  ];

  return (
    <>
      {hideTrigger ? null : <ShareTriggerButton onClick={() => setInternalOpen(true)} fullWidth />}
      <ShareOverlay
        open={open}
        title={title}
        subtitle={quote.title}
        targets={targets}
        onClose={close}
      />
    </>
  );
}
