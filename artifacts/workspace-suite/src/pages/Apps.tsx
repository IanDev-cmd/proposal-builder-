import { useActiveLead } from '@/context/ActiveLeadContext';
import { Avatar } from '@/components/Avatar';
import { personAvatarUrl } from '@/lib/avatar';

interface AppTile {
  name:    string;
  domain:  string;
  color:   string;      // brand bg colour for the tile border / glow
  getUrl:  (lead: { name: string; email: string; company: string }) => string;
}

const APP_TILES: AppTile[] = [
  {
    name:   'Gmail',
    domain: 'gmail.com',
    color:  '#EA4335',
    getUrl: ({ email }) =>
      `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(email || '')}`,
  },
  {
    name:   'Google Sheets',
    domain: 'docs.google.com',
    color:  '#34A853',
    getUrl: () => 'https://docs.google.com/spreadsheets/',
  },
  {
    name:   'Dropbox',
    domain: 'dropbox.com',
    color:  '#0061FF',
    getUrl: () => 'https://www.dropbox.com/home',
  },
  {
    name:   'Google Drive',
    domain: 'drive.google.com',
    color:  '#0F9D58',
    getUrl: () => 'https://drive.google.com/drive/my-drive',
  },
  {
    name:   'WhatsApp',
    domain: 'whatsapp.com',
    color:  '#25D366',
    getUrl: ({ name }) =>
      `https://web.whatsapp.com/send?text=${encodeURIComponent(name ? `Hi ${name},` : '')}`,
  },
  {
    name:   'Viva',
    domain: 'microsoft.com',
    color:  '#0078D4',
    getUrl: () => 'https://www.microsoft.com/en-us/microsoft-viva',
  },
  {
    name:   'Slack',
    domain: 'slack.com',
    color:  '#4A154B',
    getUrl: () => 'https://slack.com/',
  },
  {
    name:   'Scribe',
    domain: 'scribehow.com',
    color:  '#6C3BFF',
    getUrl: () => 'https://scribehow.com/',
  },
  {
    name:   'LinkedIn',
    domain: 'linkedin.com',
    color:  '#0A66C2',
    getUrl: ({ name, company }) =>
      `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(company || name)}`,
  },
  {
    name:   'Instagram',
    domain: 'instagram.com',
    color:  '#E1306C',
    getUrl: ({ company }) =>
      `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(company || '')}`,
  },
  {
    name:   'Google Reviews',
    domain: 'google.com',
    color:  '#FBBC04',
    getUrl: ({ company }) =>
      `https://www.google.com/search?q=${encodeURIComponent((company || '') + ' reviews')}`,
  },
  {
    name:   'Chatbot Form',
    domain: 'n8n.io',
    color:  '#EA5E00',
    getUrl: () => 'https://ravenmark.app.n8n.cloud/',
  },
];

export function Apps() {
  const { activeLead } = useActiveLead();

  const leadCtx = {
    name:    activeLead?.name    ?? '',
    email:   activeLead?.email   ?? '',
    company: activeLead?.company ?? '',
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-white px-8 py-10">

      {/* Header */}
      <div className="mb-2">
        <h1 className="text-[26px] font-semibold text-black">Apps</h1>
        <p className="mt-1 text-[13px] text-black/40">
          {activeLead
            ? `Links open with context for ${activeLead.name}${activeLead.company && activeLead.company !== '—' ? ` · ${activeLead.company}` : ''}`
            : 'Select a lead on the Leads page to open apps with their context.'}
        </p>
      </div>

      {/* Active lead badge */}
      {activeLead && (
        <div className="mb-8 inline-flex items-center gap-3 border border-[#2ecc71]/30 bg-[#f0fdf5] px-4 py-2.5">
          <Avatar
            src={personAvatarUrl(activeLead)}
            alt={activeLead.name}
            fallbackText={activeLead.initials}
            className="h-8 w-8 text-[11px] shrink-0"
          />
          <div>
            <p className="text-[13px] font-semibold text-black">{activeLead.name}</p>
            {activeLead.company && activeLead.company !== '—' && (
              <p className="text-[11px] text-black/45">{activeLead.company}</p>
            )}
          </div>
          <span className="ml-2 text-[11px] text-[#2ecc71] font-medium">Active lead</span>
        </div>
      )}

      {/* App grid */}
      <div className="mx-auto grid max-w-[900px] grid-cols-5 place-items-center gap-5">
        {APP_TILES.map(app => {
          const url = app.getUrl(leadCtx);
          return (
            <a
              key={app.name}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              title={activeLead ? `Open ${app.name} for ${activeLead.name}` : `Open ${app.name}`}
              className={`group flex flex-col items-center gap-3 p-5 border border-black/8 hover:border-black/20 bg-white hover:shadow-md transition-all cursor-pointer ${
                !activeLead ? 'opacity-60' : ''
              }`}
            >
              {/* Icon */}
              <div
                className="h-16 w-16 flex items-center justify-center overflow-hidden"
                style={{ backgroundColor: `${app.color}12`, border: `1.5px solid ${app.color}22` }}
              >
                <img
                  src={`https://www.google.com/s2/favicons?domain=${app.domain}&sz=64`}
                  alt={app.name}
                  className="h-10 w-10 object-contain"
                  draggable={false}
                />
              </div>

              {/* Name */}
              <span className="text-[12px] font-medium text-black/65 group-hover:text-black/90 transition-colors text-center leading-tight">
                {app.name}
              </span>

              {/* Lead indicator dot */}
              {activeLead && (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: app.color }}
                />
              )}
            </a>
          );
        })}
      </div>

      {!activeLead && (
        <p className="mt-8 text-[13px] text-black/30">
          Go to <a href="/leads" className="text-[#2ecc71] hover:underline">Leads</a> and click a lead row to sync their data here.
        </p>
      )}
    </div>
  );
}

export default Apps;
