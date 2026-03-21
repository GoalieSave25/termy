import type { TermyApi } from '../../shared/types';

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare global {
  interface Window {
    termyApi: TermyApi;
  }
}
