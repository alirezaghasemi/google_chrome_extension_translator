import { ScreenshotFormat } from './settings';

export interface ScreenshotDimensions {
  totalWidth: number;
  totalHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
}

export interface CaptureSlice {
  index: number;
  scrollX: number;
  scrollY: number;
  dataUrl: string;
}

export interface ScreenshotResult {
  dataUrl: string;
  format: ScreenshotFormat;
  width: number;
  height: number;
  timestamp: number;
}

export interface FullPageProgress {
  currentSlice: number;
  totalSlices: number;
  percentage: number;
  status: 'capturing' | 'stitching' | 'completed' | 'failed';
  errorMessage?: string;
}
