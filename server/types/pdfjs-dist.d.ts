declare module "pdfjs-dist" {
  export interface DocumentInitParameters {
    data?: ArrayBuffer | Uint8Array | number[];
    url?: string;
    httpHeaders?: Record<string, string>;
    withCredentials?: boolean;
    password?: string;
    length?: number;
    range?: any;
    disableWorker?: boolean;
    disableFontFace?: boolean;
    disableAutoFetch?: boolean;
    disableRange?: boolean;
    disableStream?: boolean;
    standardFontDataUrl?: string;
    useSystemFonts?: boolean;
    cMapUrl?: string;
    cMapPacked?: boolean;
  }

  export interface PDFDocumentProxy {
    numPages: number;
    fingerprint: string;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
    getPageIndex(ref: any): Promise<number>;
    getDestinations(): Promise<any>;
    getDestination(id: string): Promise<any>;
    getPageLabels(): Promise<string[] | null>;
    getPageLayout(): Promise<string>;
    getPageMode(): Promise<string>;
    getViewerPreferences(): Promise<any>;
    getOpenAction(): Promise<any>;
    getAttachments(): Promise<any>;
    getJavaScript(): Promise<string[] | null>;
    getOutline(): Promise<any>;
    getOptionalContentConfig(): Promise<any>;
    getPermissions(): Promise<number[] | null>;
    getMetadata(): Promise<{ info: any; metadata: any }>;
    getData(): Promise<Uint8Array>;
    getDownloadInfo(): Promise<{ length: number }>;
    getStats(): Promise<any>;
    cleanup(): void;
    destroy(): Promise<void>;
    loadingTask: PDFDocumentLoadingTask;
  }

  export interface PDFPageProxy {
    pageNumber: number;
    rotate: number;
    ref: any;
    userUnit: number;
    view: number[];
    getViewport(params: { scale: number; rotation?: number; offsetX?: number; offsetY?: number; dontFlip?: boolean }): PageViewport;
    getAnnotations(params?: { intent?: string }): Promise<any[]>;
    getTextContent(params?: { normalizeWhitespace?: boolean; disableCombineTextItems?: boolean; includeMarkedContent?: boolean }): Promise<TextContent>;
    getOperatorList(): Promise<any>;
    render(params: RenderParameters): RenderTask;
    getJSActions(): Promise<any>;
    cleanup(resetStats?: boolean): void;
  }

  export interface PageViewport {
    viewBox: number[];
    scale: number;
    rotation: number;
    offsetX: number;
    offsetY: number;
    transform: number[];
    width: number;
    height: number;
    clone(params?: { scale?: number; rotation?: number; offsetX?: number; offsetY?: number; dontFlip?: boolean }): PageViewport;
    convertToViewportPoint(x: number, y: number): number[];
    convertToViewportRectangle(rect: number[]): number[];
    convertToPdfPoint(x: number, y: number): number[];
  }

  export interface TextContent {
    items: TextItem[];
    styles: Record<string, any>;
  }

  export interface TextItem {
    str: string;
    dir: string;
    transform: number[];
    width: number;
    height: number;
    fontName: string;
    hasEOL: boolean;
  }

  export interface RenderParameters {
    canvasContext: any;
    viewport: PageViewport;
    intent?: string;
    enableWebGL?: boolean;
    renderInteractiveForms?: boolean;
    transform?: number[];
    imageLayer?: any;
    canvasFactory?: any;
    background?: string;
    annotationStorage?: any;
    optionalContentConfigPromise?: Promise<any>;
  }

  export interface RenderTask {
    promise: Promise<void>;
    cancel(): void;
  }

  export interface PDFDocumentLoadingTask {
    promise: Promise<PDFDocumentProxy>;
    destroy(): Promise<void>;
    onPassword: ((updateCallback: (password: string) => void, reason: number) => void) | null;
    onProgress: ((progressData: { loaded: number; total: number }) => void) | null;
    onUnsupportedFeature: ((featureId: any) => void) | null;
  }

  export function getDocument(src: string | URL | ArrayBuffer | Uint8Array | DocumentInitParameters): PDFDocumentLoadingTask;

  export const GlobalWorkerOptions: {
    workerSrc: string;
    workerPort: any;
  };

  export const version: string;
  export const build: string;
}
