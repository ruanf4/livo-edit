// Caches por dados/fonte, independentes do quadro e limitados em memória.
const phrasesCache = new WeakMap<object, Map<string, any[][]>>();
export function cachedPhrases<T>(words:T[], gap:number, max:number, build:()=>T[][]):T[][] {
  let cache=phrasesCache.get(words);
  if(!cache){cache=new Map();phrasesCache.set(words,cache);}
  const key=JSON.stringify([gap,max]);
  if(cache.has(key))return cache.get(key) as T[][];
  const value=build();
  if(cache.size>=8)cache.clear();
  cache.set(key,value);return value;
}
const measured=new Map<string,number>();
let context:CanvasRenderingContext2D|null=null;
export function clearCaptionMeasurements(){measured.clear();}
export function captionTextWidth(text:string,font:string):number|null {
  if(typeof document==='undefined')return null;
  const key=JSON.stringify([font,text]);
  const cached=measured.get(key);if(cached!==undefined)return cached;
  context??=document.createElement('canvas').getContext('2d');
  if(!context)return null;
  context.font=font;const width=context.measureText(text).width;
  if(measured.size>=4096)measured.clear();
  measured.set(key,width);return width;
}
export function phraseAt(phrases:{startMs:number}[][],frame:number,fps:number):number {
  // A transcrição é ordenada pelo motor; preservar também dados antigos fora de ordem.
  if(!phraseOrder.has(phrases))phraseOrder.set(phrases,phrases.every((p,i)=>!i||p[0].startMs>=phrases[i-1][0].startMs));
  if(!phraseOrder.get(phrases))return phrases.findIndex((p,i)=>frame>=Math.round(p[0].startMs/1000*fps)&&(i+1===phrases.length||frame<Math.round(phrases[i+1][0].startMs/1000*fps)));
  let low=0,high=phrases.length-1,result=-1;
  while(low<=high){const mid=(low+high)>>>1;
    if(Math.round(phrases[mid][0].startMs/1000*fps)<=frame){result=mid;low=mid+1;}else high=mid-1;
  }
  return result;
}
const phraseOrder=new WeakMap<object,boolean>();
export function activePhraseIndices(phrases:{startMs:number}[][],frame:number,fps:number,duration:number):number[]{
  const index=phraseAt(phrases,frame,fps);
  const inside=(i:number)=>frame>=Math.round(phrases[i][0].startMs/1000*fps)&&frame<(i+1<phrases.length?Math.round(phrases[i+1][0].startMs/1000*fps):duration);
  if(phraseOrder.get(phrases))return index>=0&&inside(index)?[index]:[];
  return phrases.map((_,i)=>i).filter(inside);
}
