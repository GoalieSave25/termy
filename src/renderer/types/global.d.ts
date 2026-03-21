import type { TermyApi } from '../../shared/types';

declare global {
  interface Window {
    termyApi: TermyApi;
  }
}
