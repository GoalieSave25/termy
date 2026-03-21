export type TabId = string;

export interface CarouselItem {
  id: string;
  sessionId: string;
}

export interface Tab {
  id: TabId;
  label: string;
  manualLabel?: boolean;
  carouselItems: CarouselItem[];
  carouselFocusedIndex: number;
  carouselFocusedItemId: string;
}
