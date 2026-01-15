declare module "mammoth" {
  interface ConversionResult {
    value: string;
    messages: Array<{
      type: string;
      message: string;
    }>;
  }

  interface Options {
    styleMap?: string[];
    includeDefaultStyleMap?: boolean;
    convertImage?: {
      element(image: any): Promise<any>;
    };
  }

  export function convertToHtml(input: { buffer: Buffer } | { path: string }, options?: Options): Promise<ConversionResult>;
  export function extractRawText(input: { buffer: Buffer } | { path: string }): Promise<ConversionResult>;
  
  export default {
    convertToHtml,
    extractRawText,
  };
}
