import { useState } from 'react';
import { Box, HardDrive, Link2, Mail, MessageCircle } from 'lucide-react';
import type { ShareChannel } from '@/lib/quoteShare';
import type { SavedQuote } from '@/lib/savedQuotesStore';
import { ShareOverlay, ShareTriggerButton, type ShareOverlayTarget } from '@/components/ShareOverlay';

type Props = {
  quote: SavedQuote;
  copied?: boolean;
  onShare: (channel: ShareChannel, quote: SavedQuote) => void;
};

export function QuoteShareButtons({ quote, copied, onShare }: Props) {
  const [open, setOpen] = useState(false);

  const pick = (channel: ShareChannel) => {
    setOpen(false);
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
      <ShareTriggerButton onClick={() => setOpen(true)} fullWidth />
      <ShareOverlay
        open={open}
        title="Share quote"
        subtitle={quote.title}
        targets={targets}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
