import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, X, Check } from 'lucide-react';
import { VESSEL_TYPES, EVENT_TYPES, MENU_TYPES, loadFieldPhotos, saveFieldPhotos, photoKey, type PhotoMap } from '@/lib/formOptions';

/* ─── Categories that support hover preview photos — one photo per individual item ─── */
const PHOTO_CATEGORIES = [
  {
    key: 'vesselType',
    label: 'Vessel Type',
    description: 'Upload a photo for each vessel — shown when hovering that vessel in the Forms wizard.',
    options: VESSEL_TYPES,
  },
  {
    key: 'eventType',
    label: 'Event Type',
    description: 'Upload a photo for each event type — shown when hovering that option in the Forms wizard.',
    options: EVENT_TYPES,
  },
  {
    key: 'menuType',
    label: 'Menu Type',
    description: 'Upload a photo for each menu — shown when hovering that option in the Forms wizard.',
    options: MENU_TYPES,
  },
];

export function Settings() {
  const [photos, setPhotos] = useState<PhotoMap>(loadFieldPhotos);
  const [saved, setSaved]   = useState<string | null>(null);
  const inputRefs           = useRef<Record<string, HTMLInputElement | null>>({});

  const handleUpload = (key: string, file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setPhotos((prev) => {
        const next = { ...prev, [key]: dataUrl };
        saveFieldPhotos(next);
        return next;
      });
      setSaved(key);
      setTimeout(() => setSaved(null), 2000);
    };
    reader.readAsDataURL(file);
  };

  const handleRemove = (key: string) => {
    setPhotos((prev) => {
      const next = { ...prev };
      delete next[key];
      saveFieldPhotos(next);
      return next;
    });
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-white">
      {/* Header */}
      <div className="border-b border-black/8 px-10 py-8">
        <h1 className="text-[22px] font-black tracking-tight text-gray-900">Settings</h1>
        <p className="mt-1 text-[13px] text-black/40">
          Upload a hover preview photo for every individual item below. Photos appear on the
          right edge when you hover that specific item in the Forms wizard.
        </p>
      </div>

      <div className="mx-auto max-w-[900px] px-10 py-10">
        <div className="flex flex-col gap-12">
          {PHOTO_CATEGORIES.map((category) => (
            <div key={category.key}>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-black/30">
                {category.label}
              </p>
              <p className="mb-5 text-[12px] text-black/40">{category.description}</p>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {category.options.map((option) => {
                  const key     = photoKey(category.key, option);
                  const photo   = photos[key];
                  const isSaved = saved === key;

                  return (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col items-center gap-2.5 border border-black/8 p-4"
                    >
                      {/* Preview square */}
                      <div className="relative h-[84px] w-[84px] shrink-0 overflow-hidden bg-black/4 border border-black/8">
                        {photo ? (
                          <>
                            <img src={photo} alt={option} className="h-full w-full object-cover" />
                            <button
                              onClick={() => handleRemove(key)}
                              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center bg-black/60 text-white hover:bg-black transition-colors"
                              title="Remove photo"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </>
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] font-medium text-black/20 text-center px-1.5 leading-tight">
                            No photo
                          </div>
                        )}
                      </div>

                      {/* Label */}
                      <p className="text-center text-[11.5px] font-medium leading-snug text-gray-800 line-clamp-2" title={option}>
                        {option}
                      </p>

                      {isSaved && (
                        <motion.p
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-center gap-1 text-[10.5px] font-semibold text-[#219251]"
                        >
                          <Check className="h-3 w-3" /> Saved
                        </motion.p>
                      )}

                      {/* Upload button */}
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
                        className="flex items-center gap-1.5 border border-black/15 px-3 py-1.5 text-[11px] font-semibold text-black/60 hover:border-[#2ecc71] hover:text-[#2ecc71] transition-colors"
                      >
                        <Upload className="h-3 w-3" />
                        {photo ? 'Replace' : 'Upload'}
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-10 text-[11px] text-black/25">
          Photos are stored locally in your browser. They will persist across sessions on this device.
        </p>
      </div>
    </div>
  );
}

export default Settings;
