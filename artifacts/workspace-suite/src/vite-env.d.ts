/// <reference types="vite/client" />

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
