export type ToolType = 
  | 'merge-pdf' 
  | 'split-pdf' 
  | 'compress-pdf' 
  | 'rotate-pdf';

export interface WorkerAPI {
  mergePDFs(files: ArrayBuffer[]): Promise<Uint8Array>;
  splitPDF(file: ArrayBuffer, pageRanges: string): Promise<Uint8Array[]>;
  rotatePDF(file: ArrayBuffer, degrees: number): Promise<Uint8Array>;
  compressPDF(file: ArrayBuffer): Promise<Uint8Array>;
}