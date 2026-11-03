/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    readonly VITE_DESKTOP?: string;
  }

  interface Window {
    __WEOTT_DESKTOP__?: boolean;
    weottDesktop?: {
      exportLogs: () => Promise<{ canceled?: boolean; filePath?: string; error?: string }>;
      installUpdate: () => Promise<void>;
      onUpdateReady: (callback: (info: { version?: string }) => void) => () => void;
    };
  }
}

export {};

// Support uppercase image extensions
declare module '*.PNG' {
  const src: string;
  export default src;
}
declare module '*.JPG' {
  const src: string;
  export default src;
}
declare module '*.GIF' {
  const src: string;
  export default src;
}
declare module '*.WEBP' {
  const src: string;
  export default src;
}

// @assets alias (mapped by vite to ../../attached_assets)
declare module '@assets/*' {
  const src: string;
  export default src;
}
