import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Upload, X, Check } from 'lucide-react';

/* ─── Dropdown fields that support hover preview photos ─── */
const PHOTO_FIELDS = [
  { key: 'vesselType', label: 'Vessel Type', description: 'Shown when hovering over Vessel Type dropdown in Forms' },
  { key: 'eventType',  label: 'Event Type',  description: 'Shown when hovering over Event Type dropdown in Forms' },
  { key: 'menuType',   label: 'Menu Type',   description: 'Shown when hovering over Menu Type dropdown in Forms' },
  { key: 'financials', label: 'Financials',  description: 'Shown when viewing the Financials step in Forms' },
  { key: 'upgrades',   label: 'Upgrades',    description: 'Shown when viewing the Upgrades step in Forms' },
];

type PhotoMap = Record<string, string>;

function loadPhotos(): PhotoMap {
  try {
    return JSON.parse(localStorage.getItem('nexus_field_photos') || '{}');
  } catch {
    return {};
  }
}

function savePhotos(photos: PhotoMap) {
  localStorage.setItem('nexus_field_photos', JSON.stringify(photos));
}

export function Settings() {
  const [photos, setPhotos] = useState<PhotoMap>(loadPhotos);
  const [saved, setSaved]   = useState<string | null>(null);
  const inputRefs           = useRef<Record<string, HTMLInputElement | null>>({});

  const handleUpload = (fieldKey: string, file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setPhotos((prev) => {
        const next = { ...prev, [fieldKey]: dataUrl };
        savePhotos(next);
        return next;
      });
      setSaved(fieldKey);
      setTimeout(() => setSaved(null), 2000);
    };
    reader.readAsDataURL(file);
  };

  const handleRemove = (fieldKey: string) => {
    setPhotos((prev) => {
      const next = { ...prev };
      delete next[fieldKey];
      savePhotos(next);
      return next;
    });
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-white">
      {/* Header */}
      <div className="border-b border-black/8 px-10 py-8">
        <h1 className="text-[22px] font-black tracking-tight text-gray-900">Settings</h1>
        <p className="mt-1 text-[13px] text-black/40">
          Upload hover preview photos for each dropdown in the Forms wizard.
          Photos appear on the right edge when you hover over a dropdown field.
        </p>
      </div>

      <div className="mx-auto max-w-[720px] px-10 py-10">
        <p className="mb-6 text-[11px] font-bold uppercase tracking-widest text-black/30">
          Dropdown Hover Photos
        </p>

        <div className="flex flex-col gap-5">
          {PHOTO_FIELDS.map(({ key, label, description }) => {
            const photo   = photos[key];
            const isSaved = saved === key;

            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-6 border border-black/8 p-5"
              >
                {/* Preview square */}
                <div className="relative h-[80px] w-[80px] shrink-0 overflow-hidden bg-black/4 border border-black/8">
                  {photo ? (
                    <>
                      <img src={photo} alt={label} className="h-full w-full object-cover" />
                      <button
                        onClick={() => handleRemove(key)}
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center bg-black/60 text-white hover:bg-black transition-colors"
                        title="Remove photo"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] font-medium text-black/20 text-center px-2 leading-tight">
                      No photo
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-gray-900">{label}</p>
                  <p className="mt-0.5 text-[12px] text-black/40">{description}</p>
                  {isSaved && (
                    <motion.p
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[#219251]"
                    >
                      <Check className="h-3 w-3" /> Saved
                    </motion.p>
                  )}
                </div>

                {/* Upload button */}
                <div className="shrink-0">
                  <input
                    ref={(el) => { inputRefs.current[key] = el; }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(key, file);
                      e.target.value = '';
                    }}
                  />
                  <button
                    onClick={() => inputRefs.current[key]?.click()}
                    className="flex items-center gap-2 border border-black/15 px-4 py-2 text-[12px] font-semibold text-black/60 hover:border-[#2ecc71] hover:text-[#2ecc71] transition-colors"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {photo ? 'Replace' : 'Upload'}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>

        <p className="mt-8 text-[11px] text-black/25">
          Photos are stored locally in your browser. They will persist across sessions on this device.
        </p>
      </div>
    </div>
  );
}

export default Settings;
