export const CAPTION_STYLES: string[];
export const REMOVED_CAPTION_STYLES: string[];
export function captionStyle(style?:string): string;
export function captionSnap(words:any[],time:number,duration:number): number;
export function captionTimeline(captions:any,duration:number): any[];
export function LivoApplyEdit(data:any,op:any): {ok:boolean;data:any;changed?:boolean;reason?:string}|null;
export function LivoScopeOperation(op:any): any;
