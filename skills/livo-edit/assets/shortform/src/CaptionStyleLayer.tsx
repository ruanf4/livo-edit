import React from 'react';
import {useCurrentFrame,useVideoConfig} from 'remotion';
import {ProjectDataProvider,useProjectData} from './caption-data';
import {captionStyle} from './caption-operations';

// O mesmo contexto alimenta todos os estilos, na prévia e na exportação.
export const CaptionStyleLayer: React.FC<{children:(style:string)=>React.ReactNode}> = ({children}) => {
  const data=useProjectData();
  const edit=data.editData as any;
  const c=edit.captions ?? {};
  const {fps,width,height}=useVideoConfig();
  const frame=useCurrentFrame()+Math.round((c.startSec ?? 0)*fps);
  const segment=c.segmentos?.find((s:any)=>frame>=Math.round(s.start*fps)&&frame<Math.round(s.end*fps));
  const active={...c,...segment,style:captionStyle(segment?.style ?? c.style)};
  const scale=active.livoScale ?? 1;
  // Aplicar escala nas fontes mantém o ponto de ancoragem e a posição escolhida.
  const resolved={...active,fontSize:(active.fontSize ?? 61)*scale,fontScale:(active.fontScale ?? .8)*scale,scatterFontSize:(active.scatterFontSize ?? 58)*scale,simpleScale:(active.simpleScale ?? 1)*scale};
  const inside=(ms:number)=>!segment||(Math.round(ms/1000*fps)>=Math.round(segment.start*fps)&&Math.round(ms/1000*fps)<Math.round(segment.end*fps));
  const captions=segment?(data.captions as any[]).filter(w=>inside(w.startMs)):data.captions;
  const cues=segment&&Array.isArray(data.cues)?data.cues.flatMap((cue:any)=>{
    const lines=(cue.lines??[]).map((line:any[])=>line.filter(w=>inside(w.fromMs)));
    const keep=lines.map((line:any[],i:number)=>line.length?i:-1).filter((i:number)=>i>=0);
    if(!keep.length)return [];
    return [{...cue,startMs:Math.max(cue.startMs,segment.start*1000),endMs:Math.min(cue.endMs,segment.end*1000),lines:keep.map((i:number)=>lines[i]),...Object.fromEntries(['lineStyles','lineBoost','lineEmph'].filter(key=>Array.isArray(cue[key])).map(key=>[key,keep.map((i:number)=>cue[key][i])]))}];
  }):data.cues;
  if (active.oculto) return null;
  return <ProjectDataProvider value={{...data,captions,cues,editData:{...edit,captions:resolved}}}>
    <div data-livo-caption-style={active.style} style={{position:'absolute',inset:0,pointerEvents:'none',transform:`translate(${(active.livoOffsetX??0)*width}px,${(active.livoOffsetY??0)*height}px)`}}>
      {children(active.style)}
    </div>
  </ProjectDataProvider>;
};
