// Operações compartilhadas pelo player e pelo processo principal. Sem dependências.
export const CAPTION_STYLES = ['karaoke','stacked','scatter','simples','serifada','classica','personalizada','impacto','impacto-inline','impacto-topo','impacto-branco','destaque','palavra-bounce'];
export const REMOVED_CAPTION_STYLES = ['destaque-serif','palavra-script','impacto-amarelo'];
export function captionStyle(style) {return REMOVED_CAPTION_STYLES.includes(style) ? 'impacto' : style || 'karaoke';}
export function captionSnap(words,time,duration) {
  const starts=(words||[]).map(w=>Number(w.startMs)/1000).filter(n=>Number.isFinite(n)&&n>=0&&n<duration);
  if(!starts.length)return Math.max(0,Math.min(duration,time));
  return starts.reduce((best,n)=>Math.abs(n-time)<Math.abs(best-time)?n:best,starts[0]);
}
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi,n));
const number = (n) => typeof n === 'number' && Number.isFinite(n);
export function LivoApplyEdit(data, op) {
  if(op.op==='set-caption-layout'&&Number.isInteger(op.segmento)){
    const segment=data.captions?.segmentos?.[op.segmento];
    if(segment){const {op:_,segmento,...patch}=op;return LivoApplyEdit(data,{op:'livo-caption-settings',start:segment.start,end:segment.end,patch});}
  }
  if (op.op !== 'livo-caption-settings' && op.op !== 'livo-split-position' && op.op !== 'livo-caption-boundary') return null;
  const fail = (reason) => ({ok:false,reason,changed:false,data});
  if(op.op==='livo-caption-boundary'){
    const segments=(data.captions?.segmentos||[]).map(s=>({...s}));
    const left=segments[op.index],right=segments[op.index+1];
    if(!Number.isInteger(op.index)||!left||!right||!number(op.time)||Math.abs(left.end-right.start)>.001)return fail('Limite de legenda inválido.');
    const gap=Math.min(.05,(right.end-left.start)/4);
    const time=clamp(op.time,left.start+gap,right.end-gap);
    left.end=time;right.start=time;
    return {ok:true,data:{...data,captions:{...data.captions,segmentos:segments}},changed:time!==data.captions.segmentos[op.index].end};
  }
  if (op.op === 'livo-split-position') {
    if (!Number.isInteger(op.index) || !data.splits?.[op.index] || !number(op.bandTop)) return fail('Faixa de tela dividida inválida.');
    const tracks = data.splits.map((item,i) => i === op.index ? {...item,bandTop:clamp(op.bandTop,0,1)} : item);
    return {ok:true,data:{...data,splits:tracks},changed:true};
  }
  const patch = {};
  for (const [key,value] of Object.entries(op.patch || {})) {
    if (key === 'style') {
      if (!CAPTION_STYLES.includes(value)) return fail('Modelo de legenda inválido.');
      patch.style = value;
    } else if (key === 'accent') {
      if (!/^#[0-9a-f]{6}$/i.test(value)) return fail('Cor de destaque inválida.');
      patch.accent = value;
    } else if (key === 'personalizada') {
      if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.arquivo!=='string' || !value.arquivo || typeof value.familia!=='string' || !value.familia) return fail('Escolha uma fonte para o modelo personalizado.');
      patch.personalizada = JSON.parse(JSON.stringify(value));
    } else {
      const bounds = {fontSize:[8,400],fontScale:[0.1,4],scatterFontSize:[8,400],simpleScale:[0.1,4],livoScale:[0.25,3],livoOffsetX:[-0.4,0.4],livoOffsetY:[-0.4,0.4],paddingBottom:[0,10000],stackedOffsetY:[-10000,10000],scatterOffsetY:[-10000,10000],simpleBottom:[0,10000]};
      if (!bounds[key] || !number(value)) return fail('Ajuste de legenda inválido.');
      patch[key] = clamp(value,...bounds[key]);
    }
  }
  if (!Object.keys(patch).length) return fail('Nenhum ajuste informado.');
  const captions = {...data.captions};
  if(patch.style)captions.enabled=true;
  if (op.start === undefined && op.end === undefined) {
    Object.assign(captions,patch);
    if(patch.style){captions.startSec=0;captions.endSec=Number(data.durationSec)||captions.endSec;}
    // "Todo o vídeo" substitui os mesmos campos nos trechos, sem revelar trechos ocultos.
    if(captions.segmentos)captions.segmentos=captions.segmentos.map(s=>Object.fromEntries(Object.entries(s).filter(([key])=>!(key in patch))));
  }
  else {
    const duration = Number(data.durationSec);
    if (!number(op.start) || !number(op.end) || op.start < 0 || op.end <= op.start || !number(duration) || op.end > duration + 0.001) return fail('Informe um trecho dentro da duração do vídeo.');
    const start = op.start, end = Math.min(op.end,duration);
    if(patch.style || patch.personalizada){
      captions.startSec=Math.min(Number(captions.startSec)||0,start);
      captions.endSec=Math.max(number(captions.endSec)?captions.endSec:duration,end);
    }
    // Dividir os intervalos conserva as configurações e os trechos ocultos fora da seleção.
    const old = captions.segmentos || [];
    const points = [...new Set([0,duration,start,end,...old.flatMap(s=>[clamp(s.start,0,duration),clamp(s.end,0,duration)])])].sort((a,b)=>a-b);
    const segments = [];
    for (let i=0;i<points.length-1;i++) {
      const a=points[i], b=points[i+1]; if (b<=a) continue;
      const existing=old.find(s=>s.start<=a && s.end>=b);
      const covered=a>=start && b<=end;
      const item={...existing,start:a,end:b,...covered?patch:{}};
      const previous=segments[segments.length-1];
      const settings=s=>JSON.stringify(Object.fromEntries(Object.entries(s).filter(([k])=>k!=='start'&&k!=='end').sort(([a],[b])=>a.localeCompare(b))));
      if (previous && previous.end===a && settings(previous)===settings(item)) previous.end=b;
      else segments.push(item);
    }
    captions.segmentos=segments;
  }
  const result={...data,captions};
  return {ok:true,data:result,changed:JSON.stringify(result)!==JSON.stringify(data)};
}
export function LivoScopeOperation(op) {
  const scope=typeof window==='undefined'?null:window.__livoCaptionScope;
  if (!['set-caption-style','set-caption-personalizada','set-caption-layout'].includes(op.op)) return op;
  if(!scope && op.op==='set-caption-layout')return op;
  const {op:_,segmento,...layout}=op;
  return {op:'livo-caption-settings',...scope?{start:scope.start,end:scope.end}:{},patch:op.op==='set-caption-style'?{style:op.style}:op.op==='set-caption-layout'?layout:{...op.ativar===false?{}:{style:'personalizada'},personalizada:op.personalizada ?? op.config}};
}
