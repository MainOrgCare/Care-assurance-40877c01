declare module "xlsx" {
  export interface WorkBook {
    SheetNames: string[];
    Sheets: { [sheet: string]: WorkSheet };
    Props?: any;
    Custprops?: any;
  }

  export interface WorkSheet {
    [cell: string]: CellObject | any;
    "!ref"?: string;
    "!margins"?: any;
    "!cols"?: any[];
    "!rows"?: any[];
    "!merges"?: any[];
    "!protect"?: any;
    "!autofilter"?: any;
  }

  export interface CellObject {
    t: string; // type: b Boolean, e Error, n Number, d Date, s Text, z Stub
    v?: any; // raw value
    f?: string; // formula
    r?: string; // rich text
    h?: string; // HTML
    w?: string; // formatted text
    c?: any[]; // comments
    z?: string; // number format
    l?: any; // hyperlink
    s?: any; // style
  }

  export interface ParsingOptions {
    type?: "base64" | "binary" | "buffer" | "file" | "array" | "string";
    raw?: boolean;
    codepage?: number;
    cellFormula?: boolean;
    cellHTML?: boolean;
    cellNF?: boolean;
    cellStyles?: boolean;
    cellText?: boolean;
    cellDates?: boolean;
    dateNF?: string;
    sheetStubs?: boolean;
    sheetRows?: number;
    bookDeps?: boolean;
    bookFiles?: boolean;
    bookProps?: boolean;
    bookSheets?: boolean;
    bookVBA?: boolean;
    password?: string;
    WTF?: boolean;
    sheets?: number | string | string[];
    PRN?: boolean;
    xlfn?: boolean;
    FS?: string;
  }

  export interface WritingOptions {
    type?: "base64" | "binary" | "buffer" | "file" | "array" | "string";
    bookSST?: boolean;
    bookType?: string;
    sheet?: string;
    compression?: boolean;
    Props?: any;
    themeXLSX?: any;
    ignoreEC?: boolean;
    cellDates?: boolean;
  }

  export interface Sheet2JSONOpts {
    raw?: boolean;
    range?: any;
    header?: "A" | number | string[];
    dateNF?: string;
    defval?: any;
    blankrows?: boolean;
    skipHidden?: boolean;
    UTC?: boolean;
  }

  export function read(data: any, opts?: ParsingOptions): WorkBook;
  export function readFile(filename: string, opts?: ParsingOptions): WorkBook;
  export function write(wb: WorkBook, opts?: WritingOptions): any;
  export function writeFile(wb: WorkBook, filename: string, opts?: WritingOptions): void;
  export function writeFileXLSX(wb: WorkBook, filename: string, opts?: WritingOptions): void;

  export const utils: {
    aoa_to_sheet(data: any[][], opts?: any): WorkSheet;
    json_to_sheet(data: any[], opts?: any): WorkSheet;
    table_to_sheet(data: any, opts?: any): WorkSheet;
    sheet_to_json<T = any>(worksheet: WorkSheet, opts?: Sheet2JSONOpts): T[];
    sheet_to_csv(worksheet: WorkSheet, opts?: any): string;
    sheet_to_txt(worksheet: WorkSheet, opts?: any): string;
    sheet_to_html(worksheet: WorkSheet, opts?: any): string;
    sheet_to_formulae(worksheet: WorkSheet): string[];
    sheet_add_aoa(worksheet: WorkSheet, data: any[][], opts?: any): WorkSheet;
    sheet_add_json(worksheet: WorkSheet, data: any[], opts?: any): WorkSheet;
    book_new(ws?: WorkSheet, name?: string): WorkBook;
    book_append_sheet(workbook: WorkBook, worksheet: WorkSheet, name?: string): void;
    decode_cell(address: string): { c: number; r: number };
    encode_cell(cell: { c: number; r: number }): string;
    decode_range(range: string): { s: { c: number; r: number }; e: { c: number; r: number } };
    encode_range(range: { s: { c: number; r: number }; e: { c: number; r: number } }): string;
    format_cell(cell: CellObject, v?: any, opts?: any): string;
  };
}
