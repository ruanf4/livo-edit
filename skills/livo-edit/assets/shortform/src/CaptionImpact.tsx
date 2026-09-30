/**
 * CaptionImpact — UM componente configurável que reproduz toda a família de
 * legendas dos modelos do usuário (pasta MODELOS DE LEGENDA), via PRESETS.
 * Estruturas: 'flow' (palavras fluindo, chave maior/colorida) · 'stack' (apoio
 * em cima, CHAVE grande, apoio embaixo, inclinável, letras que assentam) ·
 * 'single' (uma palavra/efeito). Dados: JSONs na skill / contexto no player.
 * Fontes: Inter, Playfair e Great Vibes — locais.
 */
import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, staticFile, delayRender, continueRender} from 'remotion';
import {useProjectData} from './caption-data';

// TODAS as fontes locais (public/fonts), carregadas via @font-face — sem depender
// de rede nem de @remotion/google-fonts, então roda igual na skill e nos apps
// (que renderizam offline). Inter é uma fonte OFL livre; Playfair
// e Great Vibes são OFL (livres).
const SANS = 'Inter';
const SERIF = 'Playfair Display';
const SCRIPT = 'Great Vibes';
const FACES: [string, string, string, 'normal' | 'italic'][] = [
  [SANS, 'Inter.ttf', '400', 'normal'],
  [SANS, 'Inter.ttf', '500', 'normal'],
  [SANS, 'Inter.ttf', '700', 'normal'],
  [SANS, 'Inter.ttf', '800', 'normal'],
  [SANS, 'Inter-Italic.ttf', '700', 'italic'],
  [SANS, 'Inter-Italic.ttf', '800', 'italic'],
  [SERIF, 'PlayfairDisplay.ttf', '400 900', 'normal'],
  [SERIF, 'PlayfairDisplay-Italic.ttf', '400 900', 'italic'],
  [SCRIPT, 'GreatVibes-Regular.ttf', '400', 'normal'],
];
// À PROVA DE FALHAS: nunca pode travar o render. É chamado DENTRO do componente
// (não no topo do módulo), então só roda quando uma legenda 'impacto/destaque/
// palavra' está na tela — nunca afeta os outros estilos nem o vídeo-base. O
// continueRender SEMPRE dispara, mesmo se uma fonte falhar ou o FontFace lançar.
let facesDone = false;
let facesPromise:Promise<unknown>|null=null;
function loadFaces(): void {
  if (facesDone || typeof document === 'undefined') return;
  facesDone = true;
  let h: ReturnType<typeof delayRender>;
  try {
    h = delayRender('Fontes das legendas');
  } catch {
    return;
  }
  try {
    const loading = Promise.all(
      FACES.map(([family, file, weight, style]) => {
        try {
          const face = new FontFace(family, `url(${staticFile('fonts/' + file)})`, {weight, style});
          return face.load().then((f) => {(document as any).fonts.add(f);}).catch(() => undefined);
        } catch {
          return Promise.resolve();
        }
      }),
    );
    let timer: ReturnType<typeof setTimeout>;
    facesPromise=Promise.race([loading, new Promise<void>((resolve) => {timer = setTimeout(resolve, 5000);})])
      .finally(() => {clearTimeout(timer); continueRender(h);});
  } catch {
    continueRender(h);
  }
}

// paleta de destaque (tokens: legenda_neon etc.)
const RED = '#f50808';
const YELLOW = '#ffe500';
const CYAN = '#34dfff';
const WHITE = '#fafafa';
const RAINBOW = 'linear-gradient(100deg,#ff5a2c 0%,#ffd23f 34%,#35d07f 66%,#22c1c3 100%)';

type Preset = {
  struct: 'flow' | 'stack' | 'single';
  accent: string;
  rainbow?: boolean;
  font?: 'sans' | 'serif' | 'script';
  italic?: boolean;
  caps?: boolean;
  glow?: boolean;
  echo?: boolean;
  tilt?: number;
  scatter?: boolean;
  layout?: 'inline' | 'chave-embaixo' | 'chave-em-cima';
  effect?: 'bounce';
};

// cada preset = um template da referência
const PRESETS: Record<string, Preset> = {
  'impacto': {struct: 'flow', accent: RED, font: 'sans', glow: true, layout: 'chave-embaixo'}, // 15/17
  'impacto-inline': {struct: 'flow', accent: RED, font: 'sans', glow: true, layout: 'inline'}, // 08
  'impacto-topo': {struct: 'flow', accent: RED, font: 'sans', glow: true, layout: 'chave-em-cima'}, // 21
  'impacto-branco': {struct: 'stack', accent: WHITE, font: 'sans', glow: false, tilt: 0}, // 06
  'destaque': {struct: 'stack', accent: RED, font: 'sans', italic: true, glow: true, tilt: -4, scatter: true}, // 14
  'palavra-bounce': {struct: 'single', accent: '#e6e6e6', font: 'sans', effect: 'bounce'}, // 09 Rebote
};

type Word = {text: string; startMs: number; endMs: number};
type CapCfg = {style?: string; gapSec?: number; maxWords?: number; bottom?: number; fontSize?:number; paddingBottom?:number; accent?:string; startSec?:number};

const FAM = (p: Preset) => (p.font === 'serif' ? SERIF : p.font === 'script' ? SCRIPT : SANS);
const STOP = new Set(('a o e de da do das dos que em um uma the is are of to and you your this that it in on no na para por com sua seu se real just need one and like').split(' '));
const clean = (t: string) => t.replace(/[“”"«»]/g, '').trim(); // mantém apóstrofo e ponto final
const cx = (t: string, p: Preset) => (p.caps ? t.toUpperCase() : t);

function buildPhrases(words: Word[], c: CapCfg): Word[][] {
  const GAP = c.gapSec ?? 0.45;
  const MAXW = Math.max(1, c.maxWords ?? 8);
  const out: Word[][] = [];
  let cur: Word[] = [];
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    const gap = next ? (next.startMs - w.endMs) / 1000 : Infinity;
    if (cur.length >= MAXW || gap >= GAP) {out.push(cur); cur = [];}
  });
  if (cur.length) out.push(cur);
  return out;
}
function keyIndex(phrase: Word[]): number {
  let best = 0, bestLen = -1;
  phrase.forEach((w, i) => {
    const t = clean(w.text);
    if (STOP.has(t.toLowerCase())) return;
    if (t.length >= bestLen) {bestLen = t.length; best = i;}
  });
  return best;
}
const rnd = (i: number) => {const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x);};
// Medir a fonte real e reservar margem para brilho, itálico e animações.
function fitSize(text:string, requested:number, width:number, p:Preset, weight=700):number {
  if(typeof document==='undefined')return requested;
  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d');
  if(!ctx)return requested;
  ctx.font=`${p.italic?'italic ':''}${weight} ${requested}px "${FAM(p)}"`;
  const measured=ctx.measureText(cx(clean(text),p)).width;
  return Math.min(requested,requested*width/Math.max(1,measured));
}
function captionScale(){const {editData}=useProjectData();return Math.max(.1,((editData as any).captions?.fontSize??61)/61);}
const glowFor = (c: string) => `0 0 0.24em ${c}aa, 0 0 0.55em ${c}66, 0 0.03em 0.05em rgba(0,0,0,0.5)`;
const SHADOW = '0 0.04em 0.09em rgba(0,0,0,0.6)';

const gradText = (bg: string): React.CSSProperties => ({
  backgroundImage: bg, WebkitBackgroundClip: 'text', backgroundClip: 'text',
  WebkitTextFillColor: 'transparent', color: 'transparent',
});

// ---------- FLOW ----------
const FlowWord: React.FC<{w: Word; isKey: boolean; sup: number; key_: number; p: Preset}> = ({w, isKey, sup, key_, p}) => {
  const {editData}=useProjectData();
  const frame = useCurrentFrame()+Math.round(((editData as any).captions?.startSec??0)*useVideoConfig().fps);
  const {fps} = useVideoConfig();
  const local = frame - (w.startMs / 1000) * fps;
  if (local < 0) return null;
  const s = spring({frame: local, fps, config: {damping: 200, mass: 0.5, stiffness: 130}});
  const op = interpolate(local, [0, 4], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const y = interpolate(s, [0, 1], [isKey ? 0.14 : 0.09, 0]);
  const sc = interpolate(s, [0, 1], [0.86, 1]);
  const rainbow = isKey && p.rainbow;
  return (
    <span style={{
      display: 'inline-block', margin: isKey ? '0 0.04em' : '0 0.12em',
      fontFamily: FAM(p), fontStyle: p.italic ? 'italic' : 'normal', fontWeight: 500,
      fontSize: isKey ? key_ : sup, lineHeight: .94, letterSpacing: '-0.035em',
      ...(rainbow ? gradText(RAINBOW) : {color: isKey ? p.accent : WHITE}),
      textShadow: isKey && p.glow && !rainbow ? glowFor(p.accent) : SHADOW,
      filter: rainbow && p.glow ? `drop-shadow(0 0 0.18em ${p.accent}55)` : undefined,
      transform: `translateY(${y}em) scale(${sc})`, opacity: op,
    }}>{cx(clean(w.text), p)}</span>
  );
};
const Flow: React.FC<{phrase: Word[]; p: Preset}> = ({phrase, p}) => {
  const {width} = useVideoConfig();
  const ki = keyIndex(phrase);
  const scale=captionScale();
  const sup = Math.min(...phrase.map(w=>fitSize(w.text,width*.058*scale,width*.78,p,500)));
  const key_ = fitSize(phrase[ki].text,width*(p.layout==='inline'?.078:.142)*scale,width*.78,p,500);
  const block = (ws: {w: Word; i: number}[]) => (
    <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'baseline'}}>
      {ws.map(({w, i}) => <FlowWord key={i} w={w} isKey={false} sup={sup} key_={key_} p={p} />)}
    </div>
  );
  if (p.layout === 'inline') {
    return <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'baseline', maxWidth: '86%', lineHeight: .94}}>
      {phrase.map((w, i) => <FlowWord key={i} w={w} isKey={i === ki} sup={sup} key_={key_} p={p} />)}
    </div>;
  }
  const others = phrase.map((w, i) => ({w, i})).filter(({i}) => i !== ki);
  const keyEl = <FlowWord w={phrase[ki]} isKey sup={sup} key_={key_} p={p} />;
  const rows = p.layout === 'chave-em-cima' ? [keyEl, block(others)] : [block(others), keyEl];
  return <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, lineHeight:.94, maxWidth:'86%', marginTop:0}}>{rows}</div>;
};

// ---------- STACK ----------
const SupWord: React.FC<{w: Word; size: number; fromLeft: boolean; p: Preset}> = ({w, size, fromLeft, p}) => {
  const {editData}=useProjectData();
  const frame = useCurrentFrame()+Math.round(((editData as any).captions?.startSec??0)*useVideoConfig().fps);
  const {fps} = useVideoConfig();
  const local = frame - (w.startMs / 1000) * fps;
  if (local < 0) return null;
  const s = spring({frame: local, fps, config: {damping: 200, mass: 0.5, stiffness: 130}});
  const op = interpolate(local, [0, 4], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const x = interpolate(s, [0, 1], [fromLeft ? -0.4 : 0.4, 0]);
  return <span style={{display: 'inline-block', lineHeight:.94, margin: '0 0.10em', fontFamily: FAM(p), fontStyle: p.italic ? 'italic' : 'normal', fontWeight: 700, fontSize: size, color: WHITE, letterSpacing: '-0.035em', textShadow: SHADOW, transform: `translateX(${x}em)`, opacity: op}}>{cx(clean(w.text), p)}</span>;
};
const KeyStack: React.FC<{w: Word; size: number; p: Preset}> = ({w, size, p}) => {
  const {editData}=useProjectData();
  const frame = useCurrentFrame()+Math.round(((editData as any).captions?.startSec??0)*useVideoConfig().fps);
  const {fps} = useVideoConfig();
  const start = (w.startMs / 1000) * fps;
  const letters = cx(clean(w.text), p).split('');
  const paint = p.rainbow ? gradText(RAINBOW) : {color: p.accent};
  return (
    <span style={{display: 'inline-flex', fontSize: size, filter: p.glow ? `drop-shadow(0 0 0.16em ${p.accent}99) drop-shadow(0 0.05em 0.06em rgba(0,0,0,0.45))` : undefined}}>
      {letters.map((ch, i) => {
        const local = frame - start - (p.scatter ? i * 1.4 : 0);
        const s = local < 0 ? 0 : spring({frame: local, fps, config: p.scatter ? {damping: 14, mass: 0.7, stiffness: 120} : {damping: 200, mass: 0.5, stiffness: 130}});
        const rot = p.scatter ? interpolate(s, [0, 1], [(rnd(i) * 2 - 1) * 22, 0]) : 0;
        const dy = p.scatter ? interpolate(s, [0, 1], [(rnd(i + 9) * 2 - 1) * 0.28, 0]) : interpolate(s, [0, 1], [0.12, 0]);
        const sc = interpolate(s, [0, 1], [p.scatter ? 0.4 : 0.88, 1]);
        const op = interpolate(local, [0, 5], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
        return <span key={i} style={{display: 'inline-block', whiteSpace: 'pre', fontFamily: FAM(p), fontStyle: p.italic ? 'italic' : 'normal', fontWeight: p.font === 'serif' ? 900 : p.italic ? 800 : 700, letterSpacing: '-0.045em', lineHeight: 1, ...paint, transform: `translateY(${dy}em) rotate(${rot}deg) scale(${sc})`, opacity: op}}>{ch}</span>;
      })}
    </span>
  );
};
const Stack: React.FC<{phrase: Word[]; p: Preset}> = ({phrase, p}) => {
  const {width} = useVideoConfig();
  const ki = keyIndex(phrase);
  const scale=captionScale();
  const sup = Math.min(...phrase.map(w=>fitSize(w.text,width*.05*scale,width*.78,p)));
  const key_ = fitSize(phrase[ki].text,width*.135*scale,width*.78,p,p.italic?800:700);
  const before = phrase.map((w, i) => ({w, i})).filter(({i}) => i < ki);
  const after = phrase.map((w, i) => ({w, i})).filter(({i}) => i > ki);
  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `rotate(${p.tilt ?? 0}deg)`}}>
      {before.length > 0 && <div style={{alignSelf: 'flex-start', marginLeft: '0.5em', marginBottom: '-0.12em', lineHeight:.94, display: 'flex', flexWrap:'wrap'}}>{before.map(({w, i}) => <SupWord key={i} w={w} size={sup} fromLeft p={p} />)}</div>}
      <KeyStack w={phrase[ki]} size={key_} p={p} />
      {after.length > 0 && <div style={{alignSelf: 'flex-end', marginRight: '0.5em', marginTop: '-0.12em', lineHeight:.94, display: 'flex', flexWrap:'wrap'}}>{after.map(({w, i}) => <SupWord key={i} w={w} size={sup} fromLeft={false} p={p} />)}</div>}
    </div>
  );
};

// ---------- SINGLE ----------
const Single: React.FC<{phrase: Word[]; p: Preset}> = ({phrase, p}) => {
  const {editData}=useProjectData();
  const frame = useCurrentFrame()+Math.round(((editData as any).captions?.startSec??0)*useVideoConfig().fps);
  const {fps, width} = useVideoConfig();
  const start = (phrase[0].startMs / 1000) * fps;
  const local = frame - start;
  const scale = captionScale();
  if (local < 0) return null;
  const text = cx(phrase.map((w) => clean(w.text)).join(' '), p);
  const size = fitSize(text,width*.11*scale,width*.72,p);
  const bounce = spring({frame: local, fps, config: {damping: 9, mass: 0.8, stiffness: 110}});
  const smooth = spring({frame: local, fps, config: {damping: 200, mass: 0.5, stiffness: 130}});
  const op = interpolate(local, [0, 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const sc = p.effect === 'bounce' ? interpolate(bounce, [0, 1], [0.7, 1]) : interpolate(smooth, [0, 1], [0.9, 1]);
  const paint = {color:p.accent};
  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
      <span style={{fontFamily: FAM(p), fontWeight: p.font === 'script' ? 400 : 700, fontSize: size, letterSpacing: p.font === 'script' ? '0' : '-0.01em', ...paint, textShadow: p.glow ? glowFor(p.accent) : SHADOW, transform: `scale(${sc})`, opacity: op}}>{text}</span>
      {p.echo && <span style={{fontFamily: FAM(p), fontWeight: 700, fontSize: size * 0.42, letterSpacing: '0.02em', color: p.accent, opacity: op * 0.4, marginTop: '0.15em'}}>{text}</span>}
    </div>
  );
};

export const CaptionImpact: React.FC = () => {
  const [,redraw]=React.useState(0);
  React.useEffect(()=>{loadFaces();let mounted=true;facesPromise?.then(()=>{if(mounted)redraw(n=>n+1);});return()=>{mounted=false;};},[]);
  loadFaces();   // carrega as fontes só quando este estilo está na tela
  const {captions, editData} = useProjectData();
  const C = ((editData as {captions?: CapCfg}).captions ?? {}) as CapCfg;
  const {fps, durationInFrames, height} = useVideoConfig();
  const frame = useCurrentFrame()+Math.round((C.startSec??0)*fps);
  const preset = PRESETS[C.style ?? 'impacto'] ?? PRESETS['impacto'];
  const p = {...preset,accent:C.accent??preset.accent};
  const phrases = buildPhrases(captions as Word[], C);
  const bottom = C.bottom ?? C.paddingBottom ?? Math.round(height * (p.struct === 'flow' ? 0.3 : p.struct === 'single' ? 0.42 : 0.34));
  return (
    <AbsoluteFill>
      {phrases.map((phrase, i) => {
        const from = Math.round((phrase[0].startMs / 1000) * fps);
        const nextStart = i + 1 < phrases.length ? Math.round((phrases[i + 1][0].startMs / 1000) * fps) : durationInFrames;
        if (frame < from || frame >= nextStart) return null;
        const inner = p.struct === 'flow' ? <Flow phrase={phrase} p={p} /> : p.struct === 'single' ? <Single phrase={phrase} p={p} /> : <Stack phrase={phrase} p={p} />;
        return <AbsoluteFill key={i} style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: bottom}}>{inner}</AbsoluteFill>;
      })}
    </AbsoluteFill>
  );
};
