// Operações compartilhadas pelo player e pelo processo principal. Sem dependências.
export const CAPTION_STYLES = ['karaoke','stacked','scatter','simples','serifada','classica','personalizada','impacto','impacto-inline','impacto-topo','impacto-branco','destaque','palavra-bounce'];
export const REMOVED_CAPTION_STYLES = ['destaque-serif','palavra-script','impacto-amarelo'];
export function captionStyle(style) {return REMOVED_CAPTION_STYLES.includes(style) ? 'impacto' : style || 'karaoke';}
export function captionSnap(words,time,duration) {
  const starts=(words||[]).map(w=>Number(w.startMs)/1000).filter(n=>Number.isFinite(n)&&n>=0&&n<duration);
  if(!starts.length)return Math.max(0,Math.min(duration,time));
  return [0,duration,...starts].reduce((best,n)=>Math.abs(n-time)<Math.abs(best-time)?n:best,0);
}
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi,n));
const number = (n) => typeof n === 'number' && Number.isFinite(n);
// A faixa sempre cobre o vídeo; os vazios são intervalos ocultos explícitos.
export function captionTimeline(captions, duration) {
  const c=captions||{},old=Array.isArray(c.segmentos)?c.segmentos.filter(s=>s&&number(s.start)&&number(s.end)&&s.end>s.start):[];
  const start=clamp(number(c.startSec)?c.startSec:0,0,duration),end=clamp(number(c.endSec)?c.endSec:duration,start,duration);
  const points=[...new Set([0,duration,start,end,...old.flatMap(s=>[clamp(s.start,0,duration),clamp(s.end,0,duration)])])].filter(number).sort((a,b)=>a-b);
  const result=[];
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1];if(b<=a)continue;
    const item=old.find(s=>s.start<=a&&s.end>=b);
    result.push({...item,start:a,end:b,...a<start||b>end||c.enabled===false||old.length&&!item?{oculto:true}:{}});
  }
  return result;
}
export function LivoApplyEdit(data, op) {
  if(op.op==='set-caption-layout'&&Number.isInteger(op.segmento)){
    const segment=data.captions?.segmentos?.[op.segmento];
    if(segment){const {op:_,segmento,...patch}=op;return LivoApplyEdit(data,{op:'livo-caption-settings',start:segment.start,end:segment.end,patch});}
  }
  const timelineOps=['split-caption-segment','merge-caption-segment','livo-caption-delete','livo-caption-move','livo-caption-trim','livo-caption-restore'];
  if (op.op !== 'livo-caption-settings' && op.op !== 'livo-split-position' && op.op !== 'livo-caption-boundary' && !timelineOps.includes(op.op)) return null;
  const fail = (reason) => ({ok:false,reason,changed:false,data});
  if(timelineOps.includes(op.op)){
    const duration=Number(data.durationSec);if(!number(duration)||duration<=0)return fail('Duração de vídeo inválida.');
    const c={...data.captions},segments=captionTimeline(c,duration);
    const done=(captions)=>({ok:true,data:{...data,captions},changed:JSON.stringify(captions)!==JSON.stringify(data.captions)});
    if(op.op==='livo-caption-restore'){
      if(!op.captions||typeof op.captions!=='object'||Array.isArray(op.captions))return fail('Estado de legenda inválido.');
      if(op.captions.segmentos!==undefined&&(!Array.isArray(op.captions.segmentos)||op.captions.segmentos.some(s=>!s||!number(s.start)||!number(s.end)||s.start<0||s.end>duration+.001||s.end<=s.start||s.style&&!CAPTION_STYLES.includes(captionStyle(s.style)))))return fail('Trechos de legenda inválidos.');
      return done(JSON.parse(JSON.stringify(op.captions)));
    }
    if(op.op==='split-caption-segment'){
      if(!number(op.time))return fail('Instante do corte inválido.');
      const index=segments.findIndex(s=>!s.oculto&&op.time>s.start&&op.time<s.end),s=segments[index];
      if(!s||op.time-s.start<.05||s.end-op.time<.05)return fail('Posicione a agulha dentro de um trecho da legenda.');
      return done({...c,segmentos:[...segments.slice(0,index),{...s,end:op.time},{...s,start:op.time},...segments.slice(index+1)]});
    }
    const s=segments[op.index];if(!Number.isInteger(op.index)||!s)return fail('Esse trecho da legenda não existe mais.');
    if(op.op==='merge-caption-segment'){
      const next=segments[op.index+1];if(!next||Math.abs(s.end-next.start)>.001)return fail('Não há trecho seguinte para juntar.');
      return done({...c,segmentos:[...segments.slice(0,op.index),{...s,end:next.end},...segments.slice(op.index+2)]});
    }
    if(op.op==='livo-caption-delete')return done({...c,enabled:true,segmentos:segments.map((item,i)=>i===op.index?{...item,oculto:true}:item)});
    if(s.oculto||!number(op.start)||!number(op.end)||op.end-op.start<.05||op.start<0||op.end>duration+.001)return fail('Movimento fora da duração do vídeo.');
    if(op.sourceStart!==undefined&&(!number(op.sourceStart)||!number(op.sourceEnd)||Math.abs(s.start-op.sourceStart)>.001||Math.abs(s.end-op.sourceEnd)>.001))return fail('O trecho mudou; tente arrastar novamente.');
    if(op.op==='livo-caption-move'&&Math.abs((op.end-op.start)-(s.end-s.start))>.001)return fail('O movimento deve conservar a duração da legenda.');
    // Retirar a origem e aplicar o bloco no destino conserva o restante da faixa.
    const remaining=segments.map((item,i)=>i===op.index?{...item,oculto:true}:item).flatMap(item=>{
      if(item.end<=op.start||item.start>=op.end)return [item];
      return [...item.start<op.start?[{...item,end:op.start}]:[],...item.end>op.end?[{...item,start:op.end}]:[]];
    });
    remaining.push({...s,style:captionStyle(s.style??c.style),start:op.start,end:op.end});remaining.sort((a,b)=>a.start-b.start);
    return done({...c,enabled:true,startSec:0,endSec:duration,segmentos:remaining});
  }
  if(op.op==='livo-caption-boundary'){
    const segments=captionTimeline(data.captions,Number(data.durationSec));
    const left=segments[op.index],right=segments[op.index+1];
    if(!Number.isInteger(op.index)||!left||!right||!number(op.time)||Math.abs(left.end-right.start)>.001)return fail('Limite de legenda inválido.');
    const gap=Math.min(.05,(right.end-left.start)/4);
    const time=clamp(op.time,left.start+gap,right.end-gap);
    left.end=time;right.start=time;
    return {ok:true,data:{...data,captions:{...data.captions,segmentos:segments}},changed:time!==captionTimeline(data.captions,Number(data.durationSec))[op.index].end};
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
    } else if (key === 'oculto') {
      if(typeof value!=='boolean')return fail('Visibilidade da legenda inválida.');
      patch.oculto=value;
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
    // Aplicar um novo modelo revela a seleção; ajustes de cor/tamanho não a revelam.
    if(captions.segmentos)captions.segmentos=captions.segmentos.map(s=>Object.fromEntries(Object.entries(s).filter(([key])=>!(key in patch))));
    if(patch.style&&captions.segmentos)captions.segmentos=captions.segmentos.map(({oculto,...s})=>s);
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
    const old = captionTimeline(data.captions,duration);
    const points = [...new Set([0,duration,start,end,...old.flatMap(s=>[clamp(s.start,0,duration),clamp(s.end,0,duration)])])].sort((a,b)=>a-b);
    const segments = [];
    for (let i=0;i<points.length-1;i++) {
      const a=points[i], b=points[i+1]; if (b<=a) continue;
      const existing=old.find(s=>s.start<=a && s.end>=b);
      const covered=a>=start && b<=end;
      const item={...existing,start:a,end:b,...covered?patch:{}};
      if(covered&&(patch.style||patch.oculto===false))delete item.oculto;
      // Não mesclar automaticamente: cortes manuais devem sobreviver aos ajustes.
      segments.push(item);
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
