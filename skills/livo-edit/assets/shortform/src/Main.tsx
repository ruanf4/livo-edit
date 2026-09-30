/**
 * SHORT-FORM composition (Reels/TikTok/Shorts) — DATA-DRIVEN. DO NOT EDIT.
 *
 * All per-video values live in ../public/edit-data.json (schema in README.md):
 * camera zooms, hook headline, captions config, image inserts,
 * behind-the-subject windows, soundtrack. Machine-generated data files in
 * public/: captions.json (captions_for_remotion.py), track.json
 * (face_track.py), segments.json (EDL output-timeline boundaries).
 *
 * The ONE editable file is CustomGraphics.tsx — bespoke motion graphics only.
 *
 * Audio: keep layers low (whoosh WHOOSH_VOLUME, pop ~0.12, music ~0.079) and always run
 * a final loudnorm pass on the render — voice + music + SFX summed will clip.
 */
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  staticFile,
  interpolate,
  Easing,
  getRemotionEnvironment,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {useEffect, useMemo, useRef} from 'react';
import {POPPINS, loadLivoEditFonts} from './fonts';
import {measureText} from '@remotion/layout-utils';
import {type GraphicLayer, useProjectData} from './data';
import {CustomGraphics} from './CustomGraphics';
import {StackedCaptions} from './StackedCaptions';
import {ScatterCaptions} from './ScatterCaptions';
import {CaptionImpact} from './CaptionImpact';
import {CaptionStyleLayer} from './CaptionStyleLayer';
import {SimpleCaptions, SIMPLE_VARIANTS, familiaDaFonte, useFontePersonalizada} from './SimpleCaptions';
import {PISO_TRACKING, suavizarTrajetoDaCamera, type CenaDeCorte} from './camera-path';

loadLivoEditFonts();
const fontFamily = POPPINS;

// ============ TYPES + DATA ====================================================
type Caption = {text: string; startMs: number; endMs: number};
// `kind` acompanha o Split: o b-roll gerado no hub vem em .mp4, e um insert
// so de imagem obrigaria a tela dividida mesmo quando o clipe deveria ocupar
// o cartao inteiro. `muted` nao e enfeite — o clipe entra por baixo da voz.
// `fullscreen` cobre o QUADRO INTEIRO em vez do cartao arredondado. B-roll de
// video longform pede a tela toda — o cartao e idioma de vertical curto —, e
// sem esta opcao o clipe gerado por IA nao tinha onde entrar: o agente
// registrava o arquivo num campo que ninguem lia e ele nunca aparecia.
// srcStart (0.67.0, modo narracao): de que segundo DO ARQUIVO o clipe entra.
// Sem ele o clipe toca do zero — o que servia ao b-roll gerado de 5 s e nao
// serve a uma montagem que reusa um clipe longo em varios planos.
type Insert = {kind?: 'image' | 'video'; src: string; start: number; end: number; fullscreen?: boolean; transform?: ManualTransform; crop?: MediaCrop; srcStart?: number};
// Tela dividida OFICIAL: a midia ocupa uma FAIXA e o video segue no resto.
// kind "video" toca o arquivo (mudo) em loop de cover; bandTop escolhe qual
// faixa vertical do video 9:16 aparece na parte dele (fracao do topo);
// divider move a divisa (fracao da altura, medida do topo) quando a cena
// pedir — o padrao ja e o enquadramento bom.
export type Split = {
  kind?: 'image' | 'video';
  src: string;
  start: number;
  end: number;
  position?: 'top' | 'bottom';
  bandTop?: number;
  divider?: number;
  // Enquadramento manual da MIDIA dentro da faixa (pan/zoom/giro). A faixa em
  // si continua mandando no layout; isto so reposiciona o que ela mostra.
  transform?: ManualTransform;
  // Como a midia preenche a faixa. 'cover' (padrao historico) corta para
  // encher; 'contain' mostra a midia INTEIRA — e o que o app grava quando o
  // aluno aponta um arquivo, porque midia entrando ja cortada foi defeito
  // relatado: quem decide o corte e o aluno, com o crop abaixo.
  fit?: 'cover' | 'contain';
  crop?: MediaCrop;
};

// RECORTE MANUAL da midia, em fracoes da caixa do elemento (a faixa, no split;
// o cartao, no insert). Aplicado como clip-path ANTES do transform: o aluno
// arrasta as bordas no palco e o que sai daqui e exatamente o inset.
export type MediaCrop = {left?: number; top?: number; right?: number; bottom?: number};

export const mediaCropCss = (crop: MediaCrop | undefined): string | undefined => {
  if (!crop) return undefined;
  const v = (n: number | undefined) => Math.max(0, Math.min(0.9, n ?? 0)) * 100;
  const top = v(crop.top);
  const right = v(crop.right);
  const bottom = v(crop.bottom);
  const left = v(crop.left);
  if (!top && !right && !bottom && !left) return undefined;
  return `inset(${top}% ${right}% ${bottom}% ${left}%)`;
};
// TRANSFORMACAO MANUAL (0.29.0): o gizmo da previa grava aqui. x/y sao
// fracoes do quadro (portavel entre resolucoes), scale multiplica e rotation
// e em graus. Ausente = identidade — e o teste de paridade byte a byte do
// refactor de contexto e re-rodado a cada mudanca destas para garantir isso.
export type ManualTransform = {x?: number; y?: number; scale?: number; rotation?: number};

export const manualTransformCss = (
  t: ManualTransform | undefined,
  width: number,
  height: number,
): string => {
  if (!t) return '';
  const parts: string[] = [];
  if (t.x || t.y) parts.push(`translate(${(t.x ?? 0) * width}px, ${(t.y ?? 0) * height}px)`);
  if (t.rotation) parts.push(`rotate(${t.rotation}deg)`);
  if (t.scale !== undefined && t.scale !== 1) parts.push(`scale(${t.scale})`);
  return parts.join(' ');
};

type BehindImage = {kind: 'image'; src: string; matte: string; start: number; dur: number};
type BehindWords = {kind: 'words'; words: {t: string; at: number}[]; matte: string; start: number; dur: number};
type Behind = BehindImage | BehindWords;

// TRECHO DA FAIXA DE LEGENDA (0.65.22): a navalha na timeline corta a faixa
// em trechos [start, end) em segundos, cada um com posicao propria (os MESMOS
// nomes dos campos globais de cada estilo) e a opcao de ficar oculto.
// Posicao de trecho VENCE a janela do agente e a junção da tela dividida —
// gesto do aluno manda (decisao do Fill, 03/09/2026). Fora de qualquer
// trecho vale o global. Ocultar e reversivel: o dado fica, so nao desenha.
export type CaptionSegment = {
  start: number;
  end: number;
  oculto?: boolean;
  paddingBottom?: number;
  stackedOffsetY?: number;
  scatterOffsetY?: number;
  simpleBottom?: number;
};

export type EditData = {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  // tracking (0.65.2): TODA cena mira os olhos num zoom sutil (1.10), nao so
  // as cenas escolhidas pelo plano de zoom. Continua POR CENA — a mediana da
  // linha dos olhos, travada do inicio ao fim da cena — porque seguir o ponto
  // quadro a quadro ja foi tentado e lido como camera flutuando (0.36.1).
  camera: {enabled: boolean; zooms: number[]; pushIn: number; targetX: number; targetY: number; tracking?: boolean};
  hook: {
    // `startSec` (padrao 0) existe para o trim da faixa Texto na timeline do
    // Livo Edit: ate a 0.31.4 a headline SEMPRE comecava no quadro 0 e so a ponta
    // direita era ajustavel.
    enabled: boolean; startSec?: number; endSec: number; lines: string[]; logo: string | null; sign: string | null;
    // `text` is preferred over `lines`: the headline is ALWAYS re-broken into
    // exactly two balanced lines and the size fitted to them (see twoLines /
    // fitHeadline). Anything in `lines` is joined back into one string first.
    text?: string;
    // "outline" (default): white text + thick black stroke, no card — the
    //   MrBeast/TikTok headline.
    // "card": Poppins Black on a dark rounded card, UPPERCASE, optional logo row.
    // "realce": each line on its own solid orange marker block.
    // "misto": line 1 light white, line 2 heavy orange.
    // "papel" (0.65.28): o papel dobrado que abriu — branco por fora,
    //   vermelho por dentro, o texto em caixa alta no meio.
    // "zero" (0.65.29): so o texto — a base "do zero" do texto personalizado.
    style?: 'outline' | 'card' | 'realce' | 'misto' | 'papel' | 'zero';
    // Cor de destaque escolhida pelo usuario. Usada por "realce" (fundo dos
    // blocos) e "misto" (segunda linha). Default: laranja do Livo Edit.
    accent?: string;
    // TEXTO PERSONALIZADO (0.65.28): a fonte do aluno (public/fonts/
    // personalizadas/<arquivo>) sobre o estilo vigente; `cor` opcional
    // troca a cor do texto do estilo.
    personalizada?: {
      base?: string; arquivo: string; cor?: string;
      // Os extras (0.65.29): teto do corpo, contorno, fundo e sombra do
      // TEXTO — valem em qualquer base, inclusive "zero" (so o texto).
      tamanho?: number;
      contorno?: {cor: string; espessura: number};
      fundo?: {cor: string};
      sombra?: {distancia: number; suavidade: number};
    };
    fontSizePx?: number;   // auto-fit CEILING (alias of maxFontPx, kept for compat)
    maxFontPx?: number;    // auto-fit ceiling (per-style default)
    safeWidth?: number;    // auto-fit width budget (per-style default)
    strokePx?: number;     // outline: black stroke width (default 12)
    paddingTop?: number;   // distance from top (per-style default)
    lineHeight?: number;
  };
  captions: {
    enabled: boolean;
    // Janela da faixa inteira (padrao: o video todo), para o trim na timeline.
    // As palavras continuam com o tempo delas; isto so recorta QUANDO a faixa
    // aparece.
    startSec?: number;
    endSec?: number;
    fontSize: number;
    maxWords: number;
    safeWidth: number;
    paddingBottom: number;
    // ranges (seconds) where the caption sits somewhere else — used by the
    // "tela dividida" style to park it on the seam between image and video
    windows?: {start: number; end: number; paddingBottom: number}[];
    // "karaoke" (default, single line), "stacked" (multi-font stack + pencil
    // outline + click/scratch SFX, reads public/caption-cues.json) or "scatter"
    // (serif, lowercase, scattered word-by-word — reads captions.json alone).
    // The three STATIC ones ("simples", "serifada", "classica") live in
    // SimpleCaptions.tsx; their calibrated look IS the default, and the stage
    // gizmo may override it via simpleBottom/simpleScale below.
    style?: 'karaoke' | 'stacked' | 'scatter' | 'simples' | 'serifada' | 'classica' | 'personalizada';
    // Cor de destaque escolhida pelo usuario. Usada apenas por "stacked", na
    // linha serifada. Os demais estilos de legenda nao usam accent.
    accent?: string;
    scatterOffsetY?: number;   // scatter: block centre, fraction of height
    scatterFontSize?: number;  // scatter: ordinary word size (default 58)
    scatterSafeWidth?: number; // scatter: layout width budget (default 940)
    stackedOffsetY?: number;
    fontScale?: number;
    // simples/serifada/classica: distancia do pe do texto ao pe do quadro em
    // px da composicao (default: o `bottom` calibrado do estilo) e escala
    // sobre o corpo calibrado. Escritos pelo gizmo do palco, como os pares
    // acima — cada estilo de legenda tem os SEUS campos, para o ajuste de um
    // nao vazar no outro quando o aluno troca de estilo.
    simpleBottom?: number;
    simpleScale?: number;
    sfx?: {enabled?: boolean; clickVolume?: number; scratchVolume?: number};
    // Ver CaptionSegment e captionSegmentAt.
    segmentos?: CaptionSegment[];
    // LEGENDA PERSONALIZADA (0.65.23): a fonte do aluno, copiada pelo app
    // para public/fonts/personalizadas/ (o SimpleCaptions a carrega por
    // @font-face), com cor, corpo, linhas e palavras por linha.
    personalizada?: {familia: string; estilo: string; arquivo: string; cor: string; tamanho: number; linhas: 1 | 2; palavras: 1 | 3 | 5};
  };
  inserts: Insert[];
  behind: Behind[];
  splits?: Split[];
  // Animacoes DECLARATIVAS: o CustomGraphics desenha cada uma pelo `kind`
  // (flash, timeline, script, shapes) e a timeline do Livo Edit usa a mesma janela
  // para a track de Animacoes. Registrar aqui e o que faz aparecer no video —
  // antes isto era so metadata e o registro saia mudo no render.
  animations?: {
    start: number;
    end: number;
    label?: string;
    kind?: 'flash' | 'timeline' | 'script' | 'shapes' | 'custom';
    lines?: string[];
    intensity?: number;
  }[];
  soundtrack: {enabled: boolean; file: string; volume: number};
  // O FADER DAS FAIXAS DE AUDIO (0.53.0). Opcional de proposito: todo
  // edit-data escrito antes disto nao tem `voice`, e o que falta vale 1 —
  // a voz como foi gravada.
  voice?: {volume?: number};
};

// Multiplicador de volume vindo do arquivo. Amplitude, nao decibel: e o que o
// Remotion recebe, e e o formato que `soundtrack.volume` sempre teve. Campo
// ausente NAO e silencio — e "nao mexeram nisto".
export const volumeDoCampo = (valor: unknown, padrao: number): number =>
  typeof valor === 'number' && Number.isFinite(valor) ? Math.max(0, Math.min(2, valor)) : padrao;

// Os dados chegam pelo CONTEXTO (./data): o render usa o padrao estatico e a
// previa ao vivo do Livo Edit injeta o projeto aberto por cima. Uma constante de
// modulo aqui congelaria o import — a previa mostraria para sempre o projeto
// de exemplo, que foi exatamente o primeiro defeito da bancada.
export const useEditData = (): EditData => useProjectData().editData as unknown as EditData;

// Divisa da tela dividida no frame GLOBAL. Sem lag nenhum (0.37.0): com o
// corte em CFR exato a imagem troca NO quadro da conta e a janela e o
// intervalo fechado-aberto [inicio, fim) — o +1 antigo compensava o PTS
// torto do corte pre-relogio-unico. `splits` vem de quem chama
// (D.splits ?? []): funcao de modulo nao pode usar hook.
export const activeSplitAt = (splits: readonly Split[], globalFrame: number, fps: number): Split | null =>
  splits.find((s) => {
    const inicio = Math.round(s.start * fps);
    return globalFrame >= inicio && globalFrame < Math.round(s.end * fps);
  }) ?? null;

// Cor de destaque padrao do Livo Edit, usada quando o edit-data.json nao traz uma.
// Antes ela estava literal dentro de cada estilo, e a escolha do usuario na
// aba Estilos era silenciosamente ignorada no render.
export const LIVOEDIT_ACCENT = '#ff5200';

// ENTRADA NO PRIMEIRO QUADRO: nao existe.
//
// Um elemento que comeca junto com o video nao "entra" — ele JA ESTA la. Animar
// a entrada no quadro 0 faz o video abrir meio vazio e se montar sozinho na
// frente de quem assiste, e a primeira imagem de um reel e a que segura a
// pessoa. Vale so para o inicio: quem entra no meio continua entrando, porque
// ali a animacao marca a troca.
const entrada = (frame: number, quadros: number, noInicio: boolean): number =>
  (noInicio
    ? 1
    : interpolate(frame, [0, quadros], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    }));

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const clamp01 = (v: number) => clamp(v, 0, 1);

// O ARQUIVO DECIDE SE E VIDEO, NAO O ROTULO.
//
// Defeito medido, e do pior tipo: uma tela dividida gravada com
// `kind: "video"` apontava para `imagens/....png`. O template obedecia o
// rotulo e montava um <video> com um PNG dentro. Um <video> assim NUNCA fica
// pronto e NUNCA levanta erro — fica em readyState 0 para sempre — e o Player
// do Remotion espera por ele: o play simplesmente PARA, com o botao dizendo
// "Pausar" e o relogio parado em zero. Nada na tela explica.
//
// Quem escreve o `src` (o agente, o app, um projeto antigo) pode errar o
// `kind`; a extensao do arquivo, nao. Entao ela manda: extensao de imagem e
// imagem, aconteca o que acontecer com o rotulo. Sem extensao conhecida, o
// rotulo decide, que e o comportamento de antes.
const EXTENSOES_DE_IMAGEM = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp', '.svg'];
const EXTENSOES_DE_VIDEO = ['.mp4', '.mov', '.webm', '.m4v', '.mkv'];

// MIDIA QUE NAO CARREGA NAO PODE CONGELAR O VIDEO — E O onError SOZINHO NAO
// BASTA (0.65.12, medido com render de um quadro real).
//
// O <Img> do Remotion abre um delayRender e so o solta quando a imagem
// CARREGA. Com `onError`, ele nao trata mais a falha como fatal — mas
// tambem NAO solta a trava: o handler vazio engolia o erro, o delayRender
// estourava em 28s ("was called but not cleared") e o render era cancelado —
// no Player isso e o PALCO PRETO inteiro (visto no projeto Julgamento Meta,
// still no quadro 246 reproduziu). O conserto e do jeito documentado: a
// midia que falhou vira um PIXEL TRANSPARENTE no proprio elemento — o load
// do placeholder dispara o onComplete do Remotion, a trava solta, a janela
// fica vazia (estado normal de espaco sem midia) e o video continua.
// So para <img>: trocar o src de um <video> por um png geraria novo erro em
// loop; o guard do dataset impede requentar o mesmo elemento.
const PIXEL_TRANSPARENTE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
// O parametro e `unknown` de proposito: o <Img> manda o EVENTO (com target)
// e o <OffthreadVideo> manda um Error pelado — os dois caem aqui.
export const aoFalharMidia = (evento?: unknown) => {
  const cru = evento as {target?: unknown; currentTarget?: unknown} | undefined;
  const alvo = (cru?.target ?? cru?.currentTarget) as HTMLImageElement | undefined;
  if (!alvo || typeof alvo !== 'object' || !('tagName' in alvo)) return;
  if (alvo.tagName !== 'IMG') return;
  if (alvo.dataset.livoeditFalhou === '1') return;
  alvo.dataset.livoeditFalhou = '1';
  alvo.src = PIXEL_TRANSPARENTE;
};

export const ehVideo = (src: string | undefined, kind: string | undefined): boolean => {
  const arquivo = String(src ?? '').split(/[?#]/u)[0].toLowerCase();
  if (EXTENSOES_DE_IMAGEM.some((ext) => arquivo.endsWith(ext))) return false;
  if (EXTENSOES_DE_VIDEO.some((ext) => arquivo.endsWith(ext))) return true;
  return kind === 'video';
};

// A DIVISA NAO FICA NO MEIO. Meio a meio come metade do apresentador e o
// resultado fica pesado — o aluno marcou no proprio render onde a divisa
// devia estar, e a marca caiu em 0,39 da altura. Nao e coincidencia: e a
// mesma medida do estilo antigo de tela dividida (750px de arte num quadro de
// 1920), que foi tunado em video real. A divisa vale para as DUAS montagens:
// com a arte em cima ela e o pe da arte; com o apresentador em cima ela e o
// pe do apresentador. Quem inverte e a posicao da midia, nunca o corte.
export const SPLIT_DIVIDER = 0.39;

// Onde COMECA o recorte do video dentro da fonte. E um so para as duas
// faixas, e o motivo e fisico: a cabeca esta sempre no mesmo lugar do quadro
// original, entao o que precisa ser constante e a FOLGA ACIMA DELA, nao o
// centro da faixa. Centrar cada faixa no proprio meio foi tentado e medido
// num render real: na faixa curta o recorte descia e cortava a testa.
// 0.20 sai de medir a cabeca no cut.mp4 do aluno (topo em 0,23 da altura) e
// deixa folga nas duas montagens. Um split especifico pode ajustar por
// bandTop; o clamp abaixo impede que o recorte passe do fim da fonte.
const BAND_TOP = 0.20;

export type SplitGeometry = {
  seam: number;
  mediaTop: number;
  mediaHeight: number;
  videoTop: number;
  videoHeight: number;
  videoOffset: number;
};

export const splitGeometry = (
  height: number,
  position: 'top' | 'bottom' | undefined,
  bandTop: number | undefined,
  divider: number | undefined,
): SplitGeometry => {
  const seam = Math.round(height * clamp(divider ?? SPLIT_DIVIDER, 0.15, 0.85));
  const mediaOnTop = (position ?? 'top') === 'top';
  const mediaHeight = mediaOnTop ? seam : height - seam;
  const videoHeight = height - mediaHeight;
  const fallback = BAND_TOP;
  // O recorte nunca pode passar do fim da fonte: com faixa longa sobra pouco
  // espaco para descer, e um bandTop alto deixaria barra preta no fim.
  const band = clamp(bandTop ?? fallback, 0, Math.max(0, 1 - videoHeight / height));
  return {
    seam,
    mediaTop: mediaOnTop ? 0 : seam,
    mediaHeight,
    videoTop: mediaOnTop ? seam : 0,
    videoHeight,
    videoOffset: -Math.round(band * height),
  };
};

// Volume unico do whoosh de entrada. Era 0,09 (e 0,1 em alguns pontos) e
// chamava atencao mais que a propria animacao; o pedido foi -60%, para ficar
// sutil ao fundo. Mexer aqui muda TODOS os whooshes de uma vez.
export const WHOOSH_VOLUME = 0.036;

// SFX played at an appearance (whoosh) or a pop for shapes
export const Sfx: React.FC<{src: string; volume?: number}> = ({src, volume = WHOOSH_VOLUME}) => (
  <Audio src={staticFile(`sfx/${src}`)} volume={volume} />
);

// ============ DYNAMIC CAMERA (per-scene zoom aimed at the eyes) ================
// The eye-track gives the TARGET, never the motion: each zoomed scene locks on
// one median eye point and holds it — following the per-frame path read as a
// floating "tracking" camera (real report).
// src defaults to the base cut. frameOffset lets a windowed layer (e.g. a person
// matte inside a <Sequence>) use the GLOBAL frame for the camera math so it stays
// aligned with the base. transparent enables ProRes alpha (person matte).
// children render inside the same transformed space.
export const DynamicVideo: React.FC<{src?: string; frameOffset?: number; transparent?: boolean; children?: React.ReactNode}> = ({
  src = 'cut.mp4',
  frameOffset = 0,
  transparent = false,
  children,
}) => {
  const frame = useCurrentFrame() + frameOffset;
  const {width, height, fps, durationInFrames} = useVideoConfig();
  const {segments: segData, track} = useProjectData();
  const D = useEditData();
  const cam = D.camera;

  // TRACKING CONTINUO (0.65.3): com a caixinha ligada, o alvo deixa de ser a
  // mediana travada da cena e vira o TRAJETO SUAVIZADO dos olhos — zona
  // morta, teto de velocidade e salto seco no corte (ver camera-path.ts).
  // Sem track.json (rastreio ainda rodando ou falhou), fica null e vale o
  // comportamento por cena de sempre — o piso de zoom continua.
  const caminho = useMemo(() => {
    if (!cam.tracking) return null;
    const pts = (track.points ?? []) as [number, number][];
    if (!pts.length) return null;
    return suavizarTrajetoDaCamera({
      pontos: pts,
      cenas: (segData.segments ?? []) as CenaDeCorte[],
      fps,
      totalFrames: Math.max(pts.length, durationInFrames),
    });
  }, [cam.tracking, track, segData, fps, durationInFrames]);

  // O ALVO E FIXO POR CENA (0.36.1): usar o ponto do rastreio QUADRO A QUADRO
  // fazia a camera flutuar atras do rosto — parecia tracking ligado, e o
  // pedido e mirar os olhos, nao segui-los. Cada cena zoomada usa UM ponto: a
  // MEDIANA da linha dos olhos naquele trecho (robusta a piscadas do
  // detector), e a camera fica parada nele do inicio ao fim da cena. Sem
  // rastreio, o centro-alto padrao [0.5, 0.4] continua valendo.
  const anchors = useMemo(() => {
    const pts = (track.points ?? []) as [number, number][];
    const segs = segData.segments ?? [];
    const median = (values: number[]): number => {
      if (!values.length) return NaN;
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    };
    return segs.map((seg: {start: number; dur: number}) => {
      const from = Math.max(0, Math.round(seg.start * fps));
      const to = Math.min(pts.length, from + Math.max(1, Math.round(seg.dur * fps)));
      const slice = pts.slice(from, to);
      const cx = median(slice.map((p) => p[0]));
      const cy = median(slice.map((p) => p[1]));
      return [Number.isFinite(cx) ? cx : 0.5, Number.isFinite(cy) ? cy : 0.4] as [number, number];
    });
  }, [segData, track, fps]);

  // A transform da camera para uma escala qualquer, com a MESMA conta do
  // quadro a quadro (ancora da cena, alvo, clamp de borda) — e o que permite
  // a animacao da previa (abaixo) usar exatamente os dois extremos da cena.
  const cameraTransform = (escala: number, cx: number, cy: number): string => {
    const alvoX = clamp(cam.targetX * width - cx * width * escala, width - width * escala, 0);
    const alvoY = clamp(cam.targetY * height - cy * height * escala, height - height * escala, 0);
    return `translate(${alvoX.toFixed(2)}px, ${alvoY.toFixed(2)}px) scale(${escala.toFixed(4)})`;
  };

  let idx = 0;
  let segFrom = 0;
  let segLen = 1;
  let base = 1;
  // O zoom do PLANO (sem o piso do tracking): e ele que decide o push-in, na
  // conta do render e na animacao da previa — os dois lados a mesma regra.
  let escolhido = 1;
  let anchor: [number, number] = [0.5, 0.4];
  let S = 1;
  if (cam.enabled) {
    // which cut segment is this frame in? Sem compensacao nenhuma (0.37.0):
    // o corte em CFR exato troca a imagem NO quadro da conta, e o zoom troca
    // junto — era o -1/+1 daqui que compensava o PTS torto do corte antigo.
    const segs = segData.segments?.length ? segData.segments : [{start:0,dur:durationInFrames/fps}];
    for (let i = 0; i < segs.length; i++) {
      if (frame >= Math.round(segs[i].start * fps)) idx = i;
    }
    segFrom = Math.round(segs[idx].start * fps);
    segLen = Math.max(1, Math.round(segs[idx].dur * fps));
    // O zoom ESCOLHIDO pelo plano continua mandando no push-in; o tracking
    // garante um PISO por max(): cena parada sobe ao enquadramento do
    // tracking, e cena que o plano escolheu com zoom MAIOR continua maior —
    // um `if` no lugar do max() invertia a hierarquia (cena de tracking
    // mais fechada que cena "com zoom" de 1.10/1.13).
    escolhido = cam.zooms[idx % cam.zooms.length] ?? 1.14;
    base = cam.tracking ? Math.max(escolhido, PISO_TRACKING) : escolhido;
    // Com o trajeto do tracking, o alvo e POR QUADRO (o cinegrafista de
    // camera-path.ts); sem ele, a mediana travada da cena, como sempre.
    anchor = caminho
      ? (caminho[Math.min(frame, caminho.length - 1)] ?? anchors[idx] ?? [0.5, 0.4])
      : (anchors[idx] ?? [0.5, 0.4]);
    // Cena com zoom 1 (sem tracking) fica PARADA de verdade, e o piso do
    // tracking nao ganha push-in: o push-in em todas as cenas faria "zoom em
    // todas" pela porta dos fundos — o plano por cena (0.36.0) existe para
    // metade delas ficarem normais.
    const push = escolhido > 1 ? cam.pushIn * clamp01((frame - segFrom) / segLen) : 0;
    S = base + push;
  }

  // O PUSH-IN DA PRÉVIA NÃO PODE DEPENDER DO RITMO DO REACT. O Player só
  // reaplica o transform quando o quadro da composição avança — numa máquina
  // modesta (medido no Windows de 4 núcleos, em dev: ~22 atualizações/s com
  // engasgos de 60–364ms) o zoom contínuo virava degrau irregular, "tremido
  // como tracking". A primeira tentativa (transition CSS de 100ms) trocou o
  // degrau por flutter: cada retarget muda a velocidade da perseguição, e a
  // MEDIÇÃO na tela mostrou a velocidade oscilando 10–20x entre amostras.
  // O conserto definitivo: uma ANIMAÇÃO WAAPI por cena, do transform inicial
  // ao final, linear, com a duração exata da cena — ela roda no COMPOSITOR,
  // em velocidade constante, imune ao engasgo do React. O quadro da
  // composição só CORRIGE deriva (>120ms, ex.: scrub) e um watchdog pausa a
  // animação quando os quadros param de chegar (pause do aluno ou engasgo
  // longo), congelando no valor exato da conta.
  // SÓ NA PRÉVIA: no render (isRendering) nenhuma animação é criada e vale o
  // transform inline — cada quadro é a foto exata da conta, como sempre.
  // Animação ativa VENCE o style inline na cascata, então o inline continua
  // escrito abaixo como verdade do render e reserva de quem não tem WAAPI.
  const cameraRef = useRef<HTMLDivElement | null>(null);
  const cameraAnim = useRef<{ anim: Animation; cena: number } | null>(null);
  const cameraWatch = useRef<ReturnType<typeof setTimeout> | null>(null);
  const podeAnimar = !getRemotionEnvironment().isRendering && cam.enabled;
  useEffect(() => {
    const el = cameraRef.current;
    if (!podeAnimar || !el || typeof el.animate !== 'function') return;
    const esperado = ((frame - segFrom) / fps) * 1000;
    let atual = cameraAnim.current;
    if (!atual || atual.cena !== idx) {
      // Cena nova: animação nova, do zoom de entrada ao de saída. O corte
      // continua seco — a troca acontece no quadro, sem morph entre takes.
      atual?.anim.cancel();
      // Sem tracking: dois keyframes (entrada e saída), como sempre. Com o
      // trajeto do tracking, a cena vira keyframes AMOSTRADOS do caminho
      // (~5 por segundo) — o compositor interpola entre eles, e a prévia
      // segue o rosto com a mesma imunidade a engasgo do React. A escala de
      // cada amostra repete a conta do render (push só no zoom escolhido).
      const escalaEm = (quadroLocal: number): number =>
        base + (escolhido > 1 ? cam.pushIn * clamp01(quadroLocal / segLen) : 0);
      const quadrosDaCena: Keyframe[] = [];
      if (caminho) {
        const passo = Math.max(1, Math.round(fps / 5));
        for (let local = 0; local <= segLen; local += passo) {
          const ponto = caminho[Math.min(segFrom + local, caminho.length - 1)] ?? anchor;
          quadrosDaCena.push({
            offset: Math.min(1, local / segLen),
            transform: cameraTransform(escalaEm(local), ponto[0], ponto[1]),
          });
        }
        const fim = caminho[Math.min(segFrom + segLen, caminho.length - 1)] ?? anchor;
        if ((quadrosDaCena[quadrosDaCena.length - 1]?.offset ?? 0) < 1) {
          quadrosDaCena.push({ offset: 1, transform: cameraTransform(escalaEm(segLen), fim[0], fim[1]) });
        }
      } else {
        quadrosDaCena.push(
          { transform: cameraTransform(base, anchor[0], anchor[1]) },
          // O MESMO gate do render: so o zoom escolhido pelo plano ganha
          // push-in — o piso do tracking fica parado na previa tambem.
          { transform: cameraTransform(escolhido > 1 ? base + cam.pushIn : base, anchor[0], anchor[1]) },
        );
      }
      const anim = el.animate(
        quadrosDaCena,
        { duration: (segLen / fps) * 1000, easing: 'linear', fill: 'both' },
      );
      atual = { anim, cena: idx };
      cameraAnim.current = atual;
    }
    const anim = atual.anim;
    const agora = Number(anim.currentTime ?? 0);
    if (Math.abs(agora - esperado) > 120) anim.currentTime = esperado;
    if (anim.playState !== 'running') anim.play();
    if (cameraWatch.current) clearTimeout(cameraWatch.current);
    cameraWatch.current = setTimeout(() => {
      // Nenhum quadro novo em 150ms: aluno pausou (ou engasgo longo, quando o
      // próprio vídeo também para). Congela no valor exato da conta.
      anim.pause();
      anim.currentTime = esperado;
    }, 150);
  });
  useEffect(() => () => {
    // Desmontou (ou virou render por hot-reload): nada de animação sobrando.
    cameraAnim.current?.anim.cancel();
    cameraAnim.current = null;
    if (cameraWatch.current) clearTimeout(cameraWatch.current);
  }, []);

  return (
    <AbsoluteFill>
      <div
        ref={cameraRef}
        style={{
          width,
          height,
          transformOrigin: '0 0',
          transform: cameraTransform(S, anchor[0], anchor[1]),
        }}
      >
        {/* PREVIA E RENDER IDENTICOS, SEM TRUQUE (0.37.0). O atraso de um
            quadro que a previa aplicava aqui compensava o PTS torto do corte
            antigo (fonte 29,97 num container "30") — o extrator do render
            pegava o quadro anterior e a previa nao. Com o corte em CFR exato
            o quadro N tem PTS exatamente N/fps: os dois lados desenham o
            mesmo quadro sem compensacao nenhuma. */}
        {/* CORTE VIRTUAL (0.38.0): com baseWindows presente (cortes pendentes
            da timeline), o video-base toca em FATIAS do cut.mp4 — o corte
            fisico so acontece no Renderizar. So a base fatia; o matte do
            behind (src proprio) segue inteiro. */}
        {(() => {
          const baseWindows = src === 'cut.mp4'
            ? ((D as unknown as {baseWindows?: {from: number; srcStart: number; dur: number}[]}).baseWindows ?? null)
            : null;
          // O FADER DA VOZ so vale para a BASE. Este mesmo componente desenha
          // o matte do behind (src proprio, ProRes alpha) e as midias de
          // split entram `muted`: mexer no volume delas seria mexer no volume
          // de coisa que nao e a fala.
          const volume = src === 'cut.mp4' ? volumeDoCampo(D.voice?.volume, 1) : undefined;
          if (!baseWindows?.length) {
            return <OffthreadVideo src={staticFile(src)} volume={volume} transparent={transparent} style={{width, height}} />;
          }
          // premountFor com layout PADRAO, igual ao das midias de split
          // (0.33.x): fatia montada no exato quadro da emenda nascia preta e
          // travava o play por milesimos — o <video> da previa precisa
          // decodificar antes de ter imagem. O wrapper do layout padrao e o
          // que esconde a fatia pre-montada (opacity 0); layout="none" nem
          // aceita premountFor.
          return baseWindows.map((w, i) => (
            <Sequence key={i} from={Math.round(w.from * fps)} durationInFrames={Math.max(1, Math.round(w.dur * fps))} premountFor={SPLIT_PREMOUNT}>
              <OffthreadVideo src={staticFile(src)} volume={volume} trimBefore={Math.round(w.srcStart * fps)} transparent={transparent} style={{width, height}} />
            </Sequence>
          ));
        })()}
        {children}
      </div>
    </AbsoluteFill>
  );
};

// ============ BEHIND-THE-SUBJECT (element between person and background) ========
// Layer: base cut (bg+person) → element → person matte on top (person redrawn,
// so the element sits behind it). The matte is a ProRes 4444 alpha .mov from
// person_matte.py, one file per window, frame 0 = window start. Elements anchor
// to the TOP of the frame (a centered element hides behind the torso).
const BehindImageEl: React.FC<{src: string; totalFrames: number; noInicio?: boolean}> = ({src, totalFrames, noInicio}) => {
  const f = useCurrentFrame();
  // Calibrado no quadro vertical; escala pela ALTURA para caber tambem no
  // horizontal (1250px de cartao num quadro de 1080 estourava a moldura).
  const {height: vh} = useVideoConfig();
  const k = vh / 1920;
  const enter = entrada(f, 9, Boolean(noInicio));
  const exit = interpolate(f, [totalFrames - 8, totalFrames], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const op = Math.min(enter, exit);
  const grow = interpolate(f, [0, totalFrames], [1, 1.08], {extrapolateRight: 'clamp'});
  const scale = interpolate(enter, [0, 1], [0.94, 1]) * grow;
  return (
    <AbsoluteFill style={{justifyContent: 'flex-start', alignItems: 'center'}}>
      <Sfx src="whoosh.mp3" />
      {/* top-weighted so the image frames the head instead of hiding behind the torso */}
      <div style={{width: Math.round(1000 * k), height: Math.round(1250 * k), marginTop: Math.round(40 * k), borderRadius: 30, overflow: 'hidden', opacity: op, scale: String(scale), boxShadow: '0 24px 70px rgba(0,0,0,0.55)'}}>
        <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover'}} onError={aoFalharMidia} />
      </div>
    </AbsoluteFill>
  );
};

const BehindWordsEl: React.FC<{words: {t: string; at: number}[]; startSec: number; totalFrames: number}> = ({words, startSec, totalFrames}) => {
  const f = useCurrentFrame();
  const {fps, height: vh} = useVideoConfig();
  // Palavra gigante calibrada no vertical: escala pela altura do quadro.
  const k = vh / 1920;
  const scrim = interpolate(f, [0, 8, totalFrames - 8, totalFrames], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{justifyContent: 'flex-start', alignItems: 'center', paddingTop: Math.round(180 * k)}}>
      <AbsoluteFill style={{background: 'rgba(0,0,0,0.26)', opacity: scrim}} />
      {words.map((w, i) => {
        const from = Math.round((w.at - startSec) * fps);
        const to = i + 1 < words.length ? Math.round((words[i + 1].at - startSec) * fps) : totalFrames;
        if (f < from || f >= to) return null;
        const local = f - from;
        const pop = interpolate(local, [0, 6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.7))});
        const op = interpolate(local, [0, 4], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
        return (
          <div key={i} style={{position: 'absolute', fontFamily, fontWeight: 900, fontSize: Math.round(360 * k), color: '#fff', opacity: op, scale: String(0.72 + 0.28 * pop), letterSpacing: -12, textShadow: '0 6px 30px rgba(0,0,0,0.5)'}}>
            {w.t}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const BehindSubject: React.FC = () => {
  const {fps} = useVideoConfig();
  const D = useEditData();
  return (
    <>
      {D.behind.map((b, i) => {
        const from = Math.round(b.start * fps);
        const duration = Math.round(b.dur * fps);
        return (
          <Sequence key={i} from={from} durationInFrames={duration} layout="none">
            {b.kind === 'image' ? (
              <BehindImageEl src={b.src} totalFrames={duration} noInicio={from === 0} />
            ) : (
              <BehindWordsEl words={b.words} startSec={b.start} totalFrames={duration} />
            )}
            <DynamicVideo src={b.matte} frameOffset={from} transparent />
          </Sequence>
        );
      })}
    </>
  );
};

// ============ KARAOKE CAPTIONS (1 line, ≤3 words, rise up, safe-margin fit) =====
const cleanW = (t: string) => t.replace(/[.,!?…]+$/, '');
const isBreak = (t: string) => /[.,!?…]$/.test(t);

function buildLines(caps: Caption[], maxWords: number): Caption[][] {
  const lines: Caption[][] = [];
  let cur: Caption[] = [];
  for (const w of caps) {
    cur.push(w);
    if (cur.length >= maxWords || isBreak(w.text)) {
      lines.push(cur);
      cur = [];
    }
  }
  if (cur.length) lines.push(cur);
  return lines;
}
const Word: React.FC<{caption: Caption; lineFromFrame: number}> = ({caption, lineFromFrame}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const startLocal = (caption.startMs / 1000) * fps - lineFromFrame;
  const p = interpolate(frame, [startLocal, startLocal + 7], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  return (
    <span
      style={{
        display: 'inline-block',
        opacity: p,
        translate: `0px ${interpolate(p, [0, 1], [34, 0])}px`,
        marginRight: 18,
      }}
    >
      {cleanW(caption.text)}
    </span>
  );
};

// ——— Headline na divisa (27/08/2026) ———
// Quando o video ABRE em tela dividida, a headline nao fica no topo (dentro
// da midia): ela senta NA COSTURA, como um selo entre as duas faixas — o
// print do aluno com os blocos montados sobre a linha da divisa. A ancora
// decide-se UMA vez, pelo primeiro quadro da janela do hook; um split que
// termina no meio da headline nao a faz pular para o topo. Devolve o Y da
// costura, ou null (layout padrao de topo).
export const headlineSeamAnchor = (data: EditData, fps: number, height: number): number | null => {
  if (!data.hook?.enabled) return null;
  const inicio = Math.max(0, Math.round((data.hook.startSec ?? 0) * fps));
  const split = activeSplitAt(data.splits ?? [], inicio, fps);
  if (!split) return null;
  return splitGeometry(height, split.position, split.bandTop, split.divider).seam;
};

// Enquanto a headline ancorada na costura esta VISIVEL, a legenda cede a
// divisa e desce para a posicao baixa padrao — as duas no mesmo lugar era
// exatamente a sobreposicao do print.
export const headlineOnSeamAt = (data: EditData, globalFrame: number, fps: number): boolean => {
  if (!data.hook?.enabled) return false;
  const inicio = Math.max(0, Math.round((data.hook.startSec ?? 0) * fps));
  const fim = Math.round(Number(data.hook.endSec) * fps);
  if (globalFrame < inicio || globalFrame >= fim) return false;
  return activeSplitAt(data.splits ?? [], inicio, fps) !== null;
};

// A JUNCAO onde a legenda senta durante a tela dividida, em px do topo — ou
// null quando nao ha junção a respeitar (sem split neste quadro, ou a headline
// esta sentada na costura e a legenda cede). E a verdade UNICA dos quatro
// estilos: karaoke e os estaticos entram por captionPaddingBottomAt, o
// empilhado e o espalhado centram o bloco aqui. Antes cada um tinha a sua
// conta: quando a divisa foi para 0,39 (e8abc0c) so o karaoke ganhou a
// "divisa de verdade" — os dois centrados ficaram no atalho antigo de
// height/2, 210px abaixo da junção, dentro do video, e surdos ao gizmo
// durante todo o split (o offset e ignorado ali). Num projeto em que a tela
// dividida cobre o video inteiro, isso era "a legenda nao se move".
export const captionSeamAt = (data: EditData, globalFrame: number, fps: number, height: number): number | null => {
  const split = activeSplitAt(data.splits ?? [], globalFrame, fps);
  if (!split) return null;
  // A costura e da headline enquanto ela estiver ali (video que abre em tela
  // dividida): a legenda desce para a posicao dela em vez de dividir o mesmo
  // lugar com a headline.
  if (headlineOnSeamAt(data, globalFrame, fps)) return null;
  // Centrada na divisa de verdade: com a divisa fora do meio, height/2
  // jogava a legenda para dentro da arte.
  return splitGeometry(height, split.position, split.bandTop, split.divider).seam;
};

// O TRECHO DA FAIXA ativo neste quadro (0.65.22), ou null. Meia-aberto em
// quadros, a mesma conta do activeSplitAt. Os quatro estilos leem daqui:
// oculto => nao desenha; posicao explicita => vence janela e junção.
export const captionSegmentAt = (data: EditData, globalFrame: number, fps: number): CaptionSegment | null => {
  const lista = data.captions?.segmentos ?? [];
  return lista.find((s) => globalFrame >= Math.round(s.start * fps) && globalFrame < Math.round(s.end * fps)) ?? null;
};
export const captionHiddenAt = (data: EditData, globalFrame: number, fps: number): boolean =>
  captionSegmentAt(data, globalFrame, fps)?.oculto === true;

// captions.windows lets the caption sit somewhere else for part of the video.
// It is resolved PER FRAME, not per line: a line that starts before a window and
// runs into it has to move mid-line, otherwise it stays stuck at the bottom.
// A tela dividida OFICIAL (D.splits) dispensa windows manuais: durante um
// split, qualquer estilo de legenda se centra sozinho na divisa. Janela
// manual, quando existir, tem prioridade (ajuste fino do agente).
// textHalfPx: metade da altura visual do bloco de texto, para centrar de fato.
export const captionPaddingBottomAt = (
  data: EditData,
  globalFrame: number,
  fps: number,
  height: number,
  fallback: number,
  textHalfPx: number,
  // Posicao explicita do trecho da faixa (0.65.22): vence janela e junção.
  explicito?: number,
): number => {
  if (explicito !== undefined) return explicito;
  const C = data.captions;
  const w = (C.windows || []).find(
    (x) => globalFrame >= Math.round(x.start * fps) && globalFrame < Math.round(x.end * fps),
  );
  if (w) return w.paddingBottom;
  // Junção (ou nada): a headline na costura e a divisa de verdade vivem em
  // captionSeamAt — a MESMA conta dos estilos centrados.
  const seam = captionSeamAt(data, globalFrame, fps, height);
  if (seam !== null) return height - seam - textHalfPx;
  return fallback;
};

const CaptionShell: React.FC<{fromFrame: number; children: React.ReactNode}> = ({fromFrame, children}) => {
  const {fps, height} = useVideoConfig();
  const local = useCurrentFrame();
  const D = useEditData();
  const C = D.captions;
  // Compared in FRAMES, never seconds: window bounds are rounded in the JSON, and
  // an epsilon comparison there lands a frame off. +1 is the same video lag the
  // split layout compensates for (see VIDEO_LAG in CustomGraphics).
  // Trecho da faixa (0.65.22): oculto nao desenha; posicao explicita do
  // trecho vence janela e junção.
  const trecho = captionSegmentAt(D, fromFrame + local, fps);
  const paddingBottom = captionPaddingBottomAt(
    D,
    fromFrame + local,
    fps,
    height,
    C.paddingBottom,
    Math.round(C.fontSize * 0.6),
    trecho?.paddingBottom,
  );
  if (trecho?.oculto) return null;
  return (
    <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom}}>
      {children}
    </AbsoluteFill>
  );
};

const Karaoke: React.FC = () => {
  const {fps, durationInFrames} = useVideoConfig();
  const D = useEditData();
  const {captions} = useProjectData();
  const C = D.captions;
  // Quebra em linhas memoizada: roda por quadro no Player e o measureText das
  // larguras nao e de graca.
  const LINES = useMemo(() => buildLines(captions as Caption[], C.maxWords), [captions, C.maxWords]);
  return (
    <>
      {LINES.map((line, i) => {
        const from = Math.round((line[0].startMs / 1000) * fps);
        const nextFrom =
          i + 1 < LINES.length ? Math.round((LINES[i + 1][0].startMs / 1000) * fps) : durationInFrames;
        const duration = Math.max(1, nextFrom - from);
        const lineText = line.map((w) => cleanW(w.text)).join(' ');
        const {width} = measureText({
          text: lineText,
          fontFamily,
          fontSize: C.fontSize,
          fontWeight: 900,
          letterSpacing: '-1px',
        });
        // safe-margin fit: scale down so the line clears the platform action rail
        const fit = Math.min(1, C.safeWidth / width);
        return (
          <Sequence key={i} from={from} durationInFrames={duration} layout="none">
            <CaptionShell fromFrame={from}>
              <div
                style={{
                  fontFamily,
                  fontWeight: 900,
                  fontSize: C.fontSize,
                  color: 'white',
                  lineHeight: 1,
                  letterSpacing: -1,
                  whiteSpace: 'nowrap',
                  scale: String(fit),
                  textShadow: '0 4px 20px rgba(0,0,0,0.55)',
                }}
              >
                {line.map((w, j) => (
                  <Word key={j} caption={w} lineFromFrame={from} />
                ))}
              </div>
            </CaptionShell>
          </Sequence>
        );
      })}
    </>
  );
};

// ============ ILLUSTRATIVE IMAGE INSERTS (rounded card + shadow, upper zone) ====
export const CARD_W = 780;
export const CARD_H = 500;
export const CARD_TOP = 90;

// B-ROLL DE TELA CHEIA: cobre o quadro inteiro, sem cartao, sem whoosh e sem a
// subida de entrada. E um CORTE PARA outra imagem, nao um adorno por cima do
// apresentador — o cartao arredondado e idioma de vertical curto e no longform
// horizontal ele fica pequeno no meio da tela.
//
// CORTE SECO, sem fade nenhum. Havia um fade de 5 quadros em cada ponta aqui,
// com a justificativa de "a emenda nao piscar" — a MESMA que ja tinha sido
// derrubada no SplitMedia na 0.33.1, e pela mesma razao: com dois b-rolls
// seguidos, o fade de saida de um cruza com o de entrada do outro e vira uma
// DISSOLVENCIA. Foi o que o aluno viu num print, com dois rostos sobrepostos,
// depois de ja ter pedido para eliminar fade: "todos os cortes devem ser
// diretos". Corte de midia e como corte de take: instantaneo.
//
// O Ken-Burns fica: e movimento DENTRO do plano, nao transicao entre planos.
const InsertFullscreen: React.FC<{src: string; totalFrames: number; kind?: 'image' | 'video'; crop?: MediaCrop; srcStart?: number}> = ({src, totalFrames, kind, crop, srcStart}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const trimBefore = srcStart && srcStart > 0 ? Math.round(srcStart * fps) : undefined;
  const scale = interpolate(frame, [0, totalFrames], [1, 1.05], {extrapolateRight: 'clamp'});
  const clip = mediaCropCss(crop);
  const midia: React.CSSProperties = {
    width: '100%', height: '100%', objectFit: 'cover',
    ...(clip ? {clipPath: clip} : null),
  };
  return (
    <AbsoluteFill style={{backgroundColor: 'black'}}>
      <AbsoluteFill style={{scale: String(scale)}}>
        {ehVideo(src, kind)
          ? <OffthreadVideo src={staticFile(src)} muted trimBefore={trimBefore} style={midia} onError={aoFalharMidia} />
          : <Img src={staticFile(src)} style={midia} onError={aoFalharMidia} />}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const InsertCard: React.FC<{src: string; totalFrames: number; kind?: 'image' | 'video'; transform?: ManualTransform; crop?: MediaCrop; noInicio?: boolean; srcStart?: number}> = ({src, totalFrames, kind, transform, crop, noInicio, srcStart}) => {
  const frame = useCurrentFrame();
  const enter = entrada(frame, 9, Boolean(noInicio));
  const exit = interpolate(frame, [totalFrames - 7, totalFrames], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const opacity = Math.min(enter, exit);
  // dynamic zoom: the image itself grows slowly while on screen (Ken-Burns)
  const grow = interpolate(frame, [0, totalFrames], [1, 1.08], {extrapolateRight: 'clamp'});
  const scale = interpolate(enter, [0, 1], [0.92, 1]) * grow * (transform?.scale ?? 1);
  const y = interpolate(enter, [0, 1], [26, 0]);
  // O deslocamento manual soma-se a animacao de entrada; o giro e so manual.
  const {width: vw, height: vh, fps} = useVideoConfig();
  const tx = (transform?.x ?? 0) * vw;
  const ty = (transform?.y ?? 0) * vh;
  return (
    <AbsoluteFill style={{justifyContent: 'flex-start', alignItems: 'center'}}>
      <Sfx src="whoosh.mp3" />
      <div style={{width: CARD_W, height: CARD_H, marginTop: CARD_TOP, borderRadius: 28, overflow: 'hidden', opacity, scale: String(scale), translate: `${tx}px ${y + ty}px`, ...(transform?.rotation ? {rotate: `${transform.rotation}deg`} : null), boxShadow: '0 18px 50px rgba(0,0,0,0.45)'}}>
        {ehVideo(src, kind)
          ? <OffthreadVideo src={staticFile(src)} muted trimBefore={srcStart && srcStart > 0 ? Math.round(srcStart * fps) : undefined} style={{width: '100%', height: '100%', objectFit: 'cover', ...(mediaCropCss(crop) ? {clipPath: mediaCropCss(crop)} : null)}} onError={aoFalharMidia} />
          : <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover', ...(mediaCropCss(crop) ? {clipPath: mediaCropCss(crop)} : null)}} onError={aoFalharMidia} />}
      </div>
    </AbsoluteFill>
  );
};

const Inserts: React.FC = () => {
  const {fps} = useVideoConfig();
  const D = useEditData();
  return (
    <>
      {D.inserts.map((it, i) => {
        const from = Math.round(it.start * fps);
        const duration = Math.round((it.end - it.start) * fps);
        return (
          <Sequence key={i} from={from} durationInFrames={duration} layout="none">
            {it.fullscreen
              ? <InsertFullscreen src={it.src} kind={it.kind} crop={it.crop} totalFrames={duration} srcStart={it.srcStart} />
              : <InsertCard src={it.src} kind={it.kind} transform={it.transform} crop={it.crop} totalFrames={duration} noInicio={from === 0} srcStart={it.srcStart} />}
          </Sequence>
        );
      })}
    </>
  );
};

// ============ TELA DIVIDIDA (midia numa faixa, video na outra) ================
// A base do video NAO some: durante um split ela encolhe para a faixa oposta,
// mostrando um recorte vertical do quadro original (splitGeometry manda na
// divisa). A midia entra com fade curto.
const SplitMedia: React.FC<{split: Split}> = ({split}) => {
  const {width, height} = useVideoConfig();
  const manual = manualTransformCss(split.transform, width, height);
  const clip = mediaCropCss(split.crop);
  // CORTE SECO (0.33.1): sem fade de entrada, sem fade de saida e sem whoosh.
  // Com a faixa unica recortada pela tesoura, cada pedaco e uma Sequence — o
  // fade fazia TODA emenda piscar e o whoosh tocava a cada recorte. Corte de
  // midia e como corte de take: instantaneo.
  const style: React.CSSProperties = {
    width: '100%', height: '100%',
    objectFit: split.fit === 'contain' ? 'contain' : 'cover',
    // O recorte manual acontece ANTES do transform (clip-path e no espaco do
    // elemento); o enquadramento gira/desloca a midia ja recortada, e o
    // overflow hidden do container da faixa apara o que sair.
    ...(clip ? {clipPath: clip} : null),
    ...(manual ? {transform: manual} : null),
  };
  // ESPACO VAZIO e um estado legitimo (origem "nenhum": o aluno aponta o
  // arquivo depois). staticFile('') estouraria; o placeholder diz o que fazer
  // e so aparece na previa — um render com faixa vazia e um render que o
  // aluno pediu assim.
  if (!split.src) {
    return (
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', background: '#101216', border: '2px dashed rgba(255,255,255,0.22)', boxSizing: 'border-box'}}>
        <div style={{fontFamily, fontWeight: 700, fontSize: 34, color: 'rgba(255,255,255,0.55)'}}>Escolha a mídia desta faixa</div>
        <div style={{fontFamily, fontWeight: 500, fontSize: 24, color: 'rgba(255,255,255,0.35)', marginTop: 10}}>Selecione o trecho na timeline e aponte o arquivo</div>
      </AbsoluteFill>
    );
  }
  return ehVideo(split.src, split.kind)
    ? <OffthreadVideo src={staticFile(split.src)} muted style={style} onError={aoFalharMidia} />
    : <Img src={staticFile(split.src)} style={style} onError={aoFalharMidia} />;
};

// Envolve a base: sem split ativo rende o DynamicVideo cheio; com split, o
// mesmo DynamicVideo aparece recortado na metade dele. O recorte e feito por
// container (overflow hidden) para a camera dinamica continuar valendo.
// Quantos quadros ANTES da janela cada midia de split e montada. A Sequence
// usa o layout PADRAO (absolute-fill), nao "none": o premountFor precisa do
// wrapper para esconder a midia pre-montada (opacity 0), e o layout none nao
// tem wrapper — o tipo nem aceita o premountFor la.
// O numero
// resolve dois defeitos vistos na previa ao vivo: a faixa PRETA nos 2-3
// primeiros quadros (o <video> do Player precisa decodificar antes de ter
// imagem) e a mini-travada na emenda (montar um elemento de video no exato
// quadro do corte trava o main thread por um instante). 30 quadros = 1s de
// folga de decodificacao. No render o OffthreadVideo extrai quadro a quadro e
// nada disto muda o resultado.
const SPLIT_PREMOUNT = 30;

const BaseWithSplits: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const D = useEditData();
  const splits = D.splits ?? [];
  const s = activeSplitAt(splits, frame, fps);
  const g = s ? splitGeometry(height, s.position, s.bandTop, s.divider) : null;
  return (
    <AbsoluteFill style={s ? {backgroundColor: 'black'} : undefined}>
      {/* TODAS as midias de split vivem em Sequences proprias, pre-montadas.
          Antes so a ATIVA era montada — o subtree nascia no exato quadro do
          corte, e nascia preto. A janela de cada Sequence repete a conta do
          activeSplitAt, senao a geometria diria "split ativo" num quadro em
          que a midia nao existe. */}
      {splits.map((sp, i) => {
        const de = Math.round(sp.start * fps);
        const ate = Math.round(sp.end * fps);
        if (ate - de < 1) return null;
        const gi = splitGeometry(height, sp.position, sp.bandTop, sp.divider);
        return (
          <Sequence key={i} from={de} durationInFrames={ate - de} premountFor={SPLIT_PREMOUNT}>
            <div style={{position: 'absolute', left: 0, width, height: gi.mediaHeight, top: gi.mediaTop, overflow: 'hidden'}}>
              <SplitMedia split={sp} />
            </div>
          </Sequence>
        );
      })}
      {/* O VIDEO-BASE NUNCA MUDA DE LUGAR NA ARVORE.
          Antes isto era um ternario: sem split, `<DynamicVideo />` solto; com
          split, o MESMO componente dentro de dois divs novos. Para o React
          sao posicoes diferentes — ele DESMONTA o video e monta outro no
          exato quadro da emenda, e o elemento novo nasce sem quadro
          decodificado: preto, ou o quadro anterior congelado. Era o glitch
          relatado em toda troca de tela cheia para tela dividida.
          Agora a estrutura e SEMPRE a mesma e so o estilo muda: sem split o
          recorte e o quadro inteiro sem deslocamento, que e visualmente
          identico ao que havia antes. Mesma posicao, mesmo elemento, nenhuma
          remontagem. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          width,
          height: g ? g.videoHeight : height,
          top: g ? g.videoTop : 0,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width,
            height,
            transform: `translateY(${g ? g.videoOffset : 0}px)`,
          }}
        >
          <DynamicVideo />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ============ SOUNDTRACK (Treblo AI track or a local file) — background bed ====
const Soundtrack: React.FC = () => {
  const {durationInFrames} = useVideoConfig();
  const D = useEditData();
  const S = D.soundtrack;
  // Sem o guarda, um `volume` faltando no arquivo viraria NaN dentro do
  // interpolate e a trilha inteira sairia muda.
  const nivel = volumeDoCampo(S.volume, 0.177828);
  return (
    <Audio
      src={staticFile(S.file)}
      volume={(f) =>
        interpolate(f, [0, 10, durationInFrames - 24, durationInFrames], [0, nivel, nivel, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      }
    />
  );
};

// ============ VISUAL HOOK (static headline in the first ~4s — always on) =======
// Copy comes from edit-data.json `hook.lines` — written like a copywriting/
// virality specialist from the cut transcript (curiosity gap · high stakes ·
// specificity · urgency). Four styles via `hook.style`, ALL of them two lines
// with the size fitted to the text:
//   "outline" (default): white + thick black stroke, no card, sentence-case,
//     sits lower (paddingTop~330, may overlap the top of the head) — TikTok.
//   "card": Poppins Black on a dark-gray rounded card, UPPERCASE, optional
//     logo + symbol row above.
//   "realce": each line on its own solid orange marker block.
//   "misto": line 1 light white, line 2 heavy orange.
// All static (fade + rise only) with a soft whoosh on entry. Tunables:
// fontSizePx / maxFontPx (ceiling for the fit — NOT a fixed size), safeWidth,
// strokePx, paddingTop, lineHeight.
// ---- ALWAYS two lines, size fitted to them ----------------------------------
// The headline has one job: be read in a glance. A third line shrinks the type
// and costs exactly that, so whatever comes in is re-broken into TWO balanced
// lines and the size is fitted to the widest one. Author `hook.text` as a plain
// sentence and let this do the breaking — hand-broken `lines` get rejoined.
const HL_MIN = 28;

type HlStyle = {weights: [number, number]; cap: number; safeW: number; lh: number; top: number};
const HL_STYLES: Record<string, HlStyle> = {
  outline: {weights: [800, 800], cap: 51, safeW: 900, lh: 1.02, top: 330},
  card: {weights: [900, 900], cap: 46, safeW: 820, lh: 1.06, top: 120},
  realce: {weights: [900, 900], cap: 48, safeW: 830, lh: 1.04, top: 300},
  misto: {weights: [400, 900], cap: 55, safeW: 900, lh: 0.98, top: 300},
  papel: {weights: [900, 900], cap: 50, safeW: 780, lh: 1.0, top: 300},
  // "zero" (0.65.29): so o texto, sem traco, cartao ou bloco — o que o aluno
  // ligar (contorno, fundo, sombra) e tudo o que ha.
  zero: {weights: [800, 800], cap: 56, safeW: 900, lh: 1.02, top: 300},
};

// A familia entra como parametro (0.65.28): com a fonte do aluno, medir com
// a Poppins daria uma largura e desenhar com outra — e a quebra em duas
// linhas e o ajuste de corpo dependem da medida.
const hlWidth = (text: string, size: number, weight: number, family: string = fontFamily) =>
  text
    ? measureText({text, fontFamily: family, fontSize: size, fontWeight: weight, letterSpacing: '-1px'}).width
    : 0;

// Balance by MEASURED width, not word count: "É assim que vai" and "ficar a sua
// headline" are 4 words and 3 words but nearly the same width — counting words
// would break it in the wrong place.
function twoLines(text: string, weights: [number, number], family: string = fontFamily): [string, string] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return [words[0] ?? '', ''];
  let best: [string, string] = [words[0], words.slice(1).join(' ')];
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const d = Math.abs(hlWidth(a, 100, weights[0], family) - hlWidth(b, 100, weights[1], family));
    if (d < bestDiff) {
      bestDiff = d;
      best = [a, b];
    }
  }
  return best;
}

// Width scales with size, but letterSpacing (-1px per gap) does NOT — so the
// first estimate is off by a few px on long lines. One refinement pass at the
// estimated size fixes that; iterating further buys nothing.
function fitHeadline(lines: [string, string], s: HlStyle, family: string = fontFamily): number {
  const widest = (size: number) =>
    Math.max(hlWidth(lines[0], size, s.weights[0], family), hlWidth(lines[1], size, s.weights[1], family));
  let size = Math.floor((s.safeW / Math.max(1, widest(100))) * 100);
  size = clamp(Math.floor((s.safeW / Math.max(1, widest(size))) * size), HL_MIN, s.cap);
  return size;
}

const HookInner: React.FC<{totalFrames: number; noInicio?: boolean}> = ({totalFrames, noInicio}) => {
  const f = useCurrentFrame();
  // A tabela HL_STYLES e calibrada no quadro vertical (1080x1920). Num quadro
  // horizontal os eixos escalam SEPARADOS: a distancia do topo acompanha a
  // altura e o orcamento de largura acompanha a largura — o teto de fonte fica
  // o mesmo, porque o lado curto e 1080 nos dois formatos. No vertical as
  // razoes valem 1 e nada muda.
  const {width: vw, height: vh, fps} = useVideoConfig();
  const D = useEditData();
  const H = D.hook;
  // A fonte do aluno (0.65.28): carregada uma vez por arquivo, o quadro
  // espera por ela; enquanto nao chega, nada na tela (o mesmo da legenda).
  const P = H.personalizada && typeof H.personalizada.arquivo === 'string' && H.personalizada.arquivo
    ? H.personalizada
    : undefined;
  const fontePronta = useFontePersonalizada(P?.arquivo);
  const enter = entrada(f, 8, Boolean(noInicio));
  const exit = interpolate(f, [totalFrames - 9, totalFrames], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const op = Math.min(enter, exit);
  const y = interpolate(enter, [0, 1], [24, 0]);

  const styleId = H.style ?? 'outline';
  // Com a fonte do aluno o peso e o do proprio arquivo (400 no CSS, como na
  // legenda): pedir 900 sobre um arquivo regular faria o navegador engordar
  // as letras por conta propria.
  const familiaDoTexto = P ? familiaDaFonte(P.arquivo) : fontFamily;
  const S: HlStyle = P
    ? {...(HL_STYLES[styleId] ?? HL_STYLES.outline), weights: [400, 400]}
    : (HL_STYLES[styleId] ?? HL_STYLES.outline);
  const corDoTexto = P?.cor ?? '#fff';
  // Os extras do texto personalizado (0.65.29) valem em QUALQUER base: sao a
  // decoracao do texto. O contorno substitui o traco preto do outline, o
  // fundo substitui o bloco do realce, a sombra substitui a do estilo.
  const decoracao: React.CSSProperties = {
    ...(P?.contorno ? {WebkitTextStroke: `${P.contorno.espessura}px ${P.contorno.cor}`, paintOrder: 'stroke fill'} : {}),
    ...(P?.sombra ? {filter: `drop-shadow(0 ${P.sombra.distancia}px ${P.sombra.suavidade}px rgba(0,0,0,0.6))`} : {}),
  };
  const blocoDeFundo: React.CSSProperties | undefined = P?.fundo
    ? {background: P.fundo.cor, padding: '0.08em 0.3em 0.16em', borderRadius: 12}
    : undefined;
  // As linhas em coluna centrada: com fundo, cada linha e um bloco do seu
  // tamanho (como a realce); sem, e o mesmo desenho de sempre.
  const coluna: React.CSSProperties = {display: 'flex', flexDirection: 'column', alignItems: 'center', gap: blocoDeFundo ? 8 : 0};
  const accent = H.accent ?? LIVOEDIT_ACCENT;
  const raw = (H.text ?? (H.lines || []).join(' ')).trim();
  const lines = twoLines(styleId === 'card' || styleId === 'papel' ? raw.toUpperCase() : raw, S.weights, familiaDoTexto);
  // fontSizePx is a CEILING, never a fixed size. As a hard override it silently
  // defeats the whole point: at a size the text cannot fit in, the line wraps and
  // the headline becomes three lines again — which is exactly what happened with
  // the uppercase "card" style at the project's inherited fontSizePx of 66.
  // O tamanho do painel (0.65.29) e um teto, como os outros — e vence o
  // ajuste do gizmo enquanto estiver definido.
  const cap = P?.tamanho ?? H.fontSizePx ?? H.maxFontPx ?? S.cap;
  const size = fitHeadline(lines, {...S, cap, safeW: H.safeWidth ?? Math.round(S.safeW * (vw / 1080))}, familiaDoTexto);
  const lh = H.lineHeight ?? S.lh;
  if (P && !fontePronta) return null;
  const top = H.paddingTop ?? Math.round(S.top * (vh / 1920));
  // Video que ABRE em tela dividida: a headline senta na costura. O bloco
  // vira absoluto com o CENTRO no Y da divisa — vale para os quatro estilos,
  // sem estimar altura de texto ou cartao (translate -50% mede sozinho).
  const seam = headlineSeamAnchor(D, fps, vh);
  const naCostura = seam != null;
  const quadro: React.CSSProperties = {
    justifyContent: 'flex-start',
    alignItems: 'center',
    ...(naCostura ? null : {paddingTop: top}),
  };
  const ancora: React.CSSProperties = naCostura
    ? {position: 'absolute', top: seam ?? 0, left: 0, right: 0}
    : {};
  const deslocamento = naCostura ? `0px calc(${y}px - 50%)` : `0px ${y}px`;
  const shell: React.CSSProperties = {
    opacity: op,
    translate: deslocamento,
    textAlign: 'center',
    fontFamily: familiaDoTexto,
    lineHeight: lh,
    letterSpacing: -1,
    // the two-line promise is structural: if a fit is ever off, this overflows
    // visibly instead of quietly wrapping into a third line
    whiteSpace: 'nowrap',
  };

  if (styleId === 'realce') {
    return (
      <AbsoluteFill style={quadro}>
        <Sfx src="whoosh.mp3" volume={WHOOSH_VOLUME} />
        <div style={{...shell, ...ancora, ...decoracao, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10}}>
          {lines.filter(Boolean).map((l, i) => (
            <div
              key={i}
              style={{
                background: P?.fundo?.cor ?? accent,
                color: corDoTexto,
                fontWeight: S.weights[1],
                fontSize: size,
                padding: '0.08em 0.3em 0.16em',
                borderRadius: 12,
                boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
              }}
            >
              {l}
            </div>
          ))}
        </div>
      </AbsoluteFill>
    );
  }

  if (styleId === 'misto') {
    return (
      <AbsoluteFill style={quadro}>
        <Sfx src="whoosh.mp3" volume={WHOOSH_VOLUME} />
        <div style={{...shell, ...ancora, filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.55))', ...decoracao, ...coluna}}>
          <div style={{fontWeight: S.weights[0], fontSize: size, color: corDoTexto, ...blocoDeFundo}}>{lines[0]}</div>
          <div style={{fontWeight: S.weights[1], fontSize: size, color: accent, ...blocoDeFundo}}>{lines[1]}</div>
        </div>
      </AbsoluteFill>
    );
  }

  if (styleId === 'card') {
    return (
      <AbsoluteFill style={quadro}>
        <Sfx src="whoosh.mp3" volume={WHOOSH_VOLUME} />
        <div style={{opacity: op, translate: deslocamento, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, ...ancora}}>
          {H.logo || H.sign ? (
            <div style={{display: 'flex', alignItems: 'center', gap: 34}}>
              {H.logo ? <Img src={staticFile(H.logo)} style={{width: 300, borderRadius: 18, boxShadow: '0 12px 34px rgba(0,0,0,0.4)'}} onError={aoFalharMidia} /> : null}
              {H.sign ? <Img src={staticFile(H.sign)} style={{width: 128, filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.45))'}} onError={aoFalharMidia} /> : null}
            </div>
          ) : null}
          <div style={{background: '#232326', borderRadius: 24, padding: '28px 46px', textAlign: 'center', fontFamily: familiaDoTexto, fontWeight: S.weights[0], fontSize: size, color: corDoTexto, ...decoracao, lineHeight: lh, letterSpacing: -1, textShadow: '0 4px 20px rgba(0,0,0,0.55)', boxShadow: '0 18px 50px rgba(0,0,0,0.45)'}}>
            {lines.filter(Boolean).map((l, i) => (<div key={i} style={blocoDeFundo}>{l}</div>))}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  if (styleId === 'zero') {
    return (
      <AbsoluteFill style={quadro}>
        <Sfx src="whoosh.mp3" volume={WHOOSH_VOLUME} />
        <div style={{...shell, ...ancora, ...coluna, fontWeight: S.weights[0], fontSize: size, color: corDoTexto, padding: '0 60px', ...decoracao}}>
          {lines.filter(Boolean).map((l, i) => (<div key={i} style={blocoDeFundo}>{l}</div>))}
        </div>
      </AbsoluteFill>
    );
  }

  if (styleId === 'papel') {
    // PAPEL (0.65.28): um papel que estava dobrado ao meio e foi aberto —
    // branco por fora (a folha maior, atras), vermelho por dentro, bordas
    // rasgadas e vincos, o texto em caixa alta no meio. A entrada e a
    // ABERTURA: a folha gira em torno da dobra horizontal (rotateX) enquanto
    // ganha altura, e o texto so aparece quando ela esta quase aberta. No
    // quadro 0 nao ha entrada (regra geral: quem comeca com o video ja esta
    // la). O vermelho e do estilo, nao a cor de destaque: foi assim que o
    // Fill o descreveu, e a cor de destaque continua sendo da realce/misto.
    const linhas = lines.filter(Boolean);
    // Respiro interno do papel: o texto nao encosta nas bordas (refino do
    // Fill na 0.65.29).
    const padX = Math.round(size * 0.85);
    const padY = Math.round(size * 0.5);
    const larguraTexto = Math.max(1, ...linhas.map((l) => hlWidth(l, size, S.weights[0], familiaDoTexto)));
    const boxW = Math.round(larguraTexto + padX * 2);
    const boxH = Math.round(linhas.length * size * lh + padY * 2);
    const abrir = entrada(f, 14, Boolean(noInicio));
    const rasgo = papelRasgado(boxW, boxH);
    const textoVisivel = interpolate(abrir, [0.55, 1], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    return (
      <AbsoluteFill style={quadro}>
        <Sfx src="whoosh.mp3" volume={WHOOSH_VOLUME} />
        <div style={{...shell, ...ancora, display: 'flex', justifyContent: 'center', perspective: 1400}}>
          <div
            style={{
              position: 'relative',
              width: boxW,
              height: boxH,
              transform: `rotateX(${((1 - abrir) * 78).toFixed(2)}deg) scaleY(${(0.12 + 0.88 * abrir).toFixed(3)})`,
              transformOrigin: '50% 50%',
              filter: 'drop-shadow(0 14px 26px rgba(0,0,0,0.45))',
            }}
          >
            <svg
              width={boxW + PAPEL_MARGEM * 2}
              height={boxH + PAPEL_MARGEM * 2}
              viewBox={`0 0 ${boxW + PAPEL_MARGEM * 2} ${boxH + PAPEL_MARGEM * 2}`}
              style={{position: 'absolute', left: -PAPEL_MARGEM, top: -PAPEL_MARGEM, overflow: 'visible'}}
            >
              <defs>
                <linearGradient id="livoedit-papel-vermelho" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff3a2e" />
                  <stop offset="50%" stopColor="#e01717" />
                  <stop offset="100%" stopColor="#b51010" />
                </linearGradient>
              </defs>
              <path d={rasgo.fora} fill="#9e1212" />
              <path d={rasgo.dentro} fill="url(#livoedit-papel-vermelho)" />
              {/* a dobra do meio e dois vincos de quem amassou o papel */}
              <line x1={PAPEL_MARGEM} y1={PAPEL_MARGEM + boxH / 2} x2={PAPEL_MARGEM + boxW} y2={PAPEL_MARGEM + boxH / 2} stroke="rgba(0,0,0,0.13)" strokeWidth={3} />
              <line x1={PAPEL_MARGEM + boxW * 0.08} y1={PAPEL_MARGEM} x2={PAPEL_MARGEM + boxW * 0.3} y2={PAPEL_MARGEM + boxH} stroke="rgba(255,255,255,0.06)" strokeWidth={2} />
              <line x1={PAPEL_MARGEM + boxW * 0.66} y1={PAPEL_MARGEM} x2={PAPEL_MARGEM + boxW * 0.9} y2={PAPEL_MARGEM + boxH} stroke="rgba(255,255,255,0.05)" strokeWidth={2} />
            </svg>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: corDoTexto,
                fontWeight: S.weights[0],
                fontSize: size,
                lineHeight: lh,
                opacity: textoVisivel,
                textShadow: '0 2px 6px rgba(0,0,0,0.25)',
                gap: blocoDeFundo ? 8 : 0,
                ...decoracao,
              }}
            >
              {linhas.map((l, i) => (<div key={i} style={blocoDeFundo}>{l}</div>))}
            </div>
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  const stroke = H.strokePx ?? 7;
  return (
    <AbsoluteFill style={quadro}>
      <Sfx src="whoosh.mp3" volume={WHOOSH_VOLUME} />
      <div
        style={{
          ...shell,
          ...ancora,
          fontWeight: S.weights[0],
          fontSize: size,
          color: corDoTexto,
          WebkitTextStroke: `${stroke}px #000`,
          paintOrder: 'stroke fill',
          filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.45))',
          padding: '0 60px',
          ...coluna,
          ...decoracao,
        }}
      >
        {lines.filter(Boolean).map((l, i) => (<div key={i} style={blocoDeFundo}>{l}</div>))}
      </div>
    </AbsoluteFill>
  );
};

// A BORDA RASGADA do papel: um contorno por vertices com um desvio
// perpendicular pseudo-aleatorio — mas DETERMINISTICO (hash do indice, como
// a legenda dispersa faz): cada quadro do render tem de concordar com o
// anterior, e Math.random aqui faria a borda tremer a 30 fps. A folha branca
// e um pouco maior e tem o proprio rasgo, por isso aparece por fora em
// larguras diferentes ao longo da borda — e isso que le como papel.
const PAPEL_MARGEM = 26;
const ruidoDoPapel = (n: number) => {
  const x = Math.sin(n * 91.7 + 47.3) * 43758.5453;
  return x - Math.floor(x);
};
function bordaRasgada(x0: number, y0: number, w: number, h: number, amplitude: number, semente: number): string {
  const pontos: string[] = [];
  const passo = 22;
  const lado = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number, s: number) => {
    const comprimento = Math.hypot(bx - ax, by - ay);
    const n = Math.max(2, Math.round(comprimento / passo));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const desvio = (ruidoDoPapel(semente * 1000 + s * 100 + i) - 0.5) * 2 * amplitude;
      pontos.push(`${(ax + (bx - ax) * t + nx * desvio).toFixed(1)} ${(ay + (by - ay) * t + ny * desvio).toFixed(1)}`);
    }
  };
  lado(x0, y0, x0 + w, y0, 0, -1, 1);
  lado(x0 + w, y0, x0 + w, y0 + h, 1, 0, 2);
  lado(x0 + w, y0 + h, x0, y0 + h, 0, 1, 3);
  lado(x0, y0 + h, x0, y0, -1, 0, 4);
  return `M${pontos.join('L')}Z`;
}
export function papelRasgado(w: number, h: number): {fora: string; dentro: string} {
  // Pouco branco a mostra (refino do Fill, 0.65.29): a folha de tras passa
  // so 3px da vermelha e os rasgos sao curtos — mais real do que a moldura
  // serrilhada da primeira versao.
  return {
    fora: bordaRasgada(PAPEL_MARGEM - 3, PAPEL_MARGEM - 3, w + 6, h + 6, 5, 7),
    dentro: bordaRasgada(PAPEL_MARGEM, PAPEL_MARGEM, w, h, 4, 3),
  };
}

const HookIntro: React.FC = () => {
  const {fps} = useVideoConfig();
  const D = useEditData();
  const from = Math.max(0, Math.round((D.hook.startSec ?? 0) * fps));
  const dur = Math.max(1, Math.round(D.hook.endSec * fps) - from);
  return (
    <Sequence from={from} durationInFrames={dur} layout="none">
      <HookInner totalFrames={dur} noInicio={from === 0} />
    </Sequence>
  );
};

// Grafico sob medida PRE-RENDERIZADO (edit/graficos/*.webm, VP9 com alpha).
// So a previa ao vivo monta isto: o CustomGraphics do projeto nao compila no
// app, entao o clipe pronto toca no lugar dele. No render, graphicLayers e
// sempre null e o CustomGraphics roda ao vivo como sempre rodou.
//
// O CLIPE PINTA POR CANVAS, NAO PELO <video> (0.39.x). Medido no Electron 43:
// um <video> VP9-com-alpha dentro de um ancestral com scale CSS (o wrapper do
// Player e sempre escalado para caber no palco) perde o canal alpha na
// composicao — o fundo transparente vira PRETO OPACO e cobre o video-base. O
// mesmo arquivo, fora da subarvore escalada, compoe perfeito; nenhum estilo no
// elemento (filter, opacity, will-change, translateZ, rotate) cura. O
// drawImage recebe o QUADRO decodificado, antes do compositor doente, entao o
// video fica invisivel (opacity 0, seguindo o relogio do Player) e um canvas
// irmao desenha cada quadro com o alpha intacto.
const LayerClip: React.FC<{src: string}> = ({src}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const video = holderRef.current?.querySelector('video');
    const canvas = canvasRef.current;
    if (!video || !canvas) return undefined;
    const draw = () => {
      if (video.readyState < 2) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    };
    draw();
    // O scrub pausado termina num seek ASSINCRONO: sem o 'seeked' o canvas
    // ficaria um quadro atrasado ao soltar a agulha.
    video.addEventListener('seeked', draw);
    video.addEventListener('loadeddata', draw);
    return () => {
      video.removeEventListener('seeked', draw);
      video.removeEventListener('loadeddata', draw);
    };
    // frame na dependencia: cada quadro do Player redesenha o canvas.
  }, [frame]);

  return (
    <AbsoluteFill>
      <div ref={holderRef} style={{opacity: 0}}>
        <OffthreadVideo
          src={src}
          muted
          style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}
        />
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none'}}
      />
    </AbsoluteFill>
  );
};

const PrerenderedGraphics: React.FC<{layers: GraphicLayer[]}> = ({layers}) => {
  const {fps} = useVideoConfig();
  return (
    <>
      {layers.map((layer, i) => {
        const from = Math.round(layer.start * fps);
        const duration = Math.max(1, Math.round((layer.end - layer.start) * fps));
        return (
          // premountFor com layout padrao, o mesmo remedio das midias de split
          // (0.33.x): a camada montada no exato quadro da janela nasceria sem
          // imagem decodificada. O wrapper do premount esconde (opacity 0) o
          // clipe pre-montado ate a janela comecar.
          <Sequence key={i} from={from} durationInFrames={duration} premountFor={SPLIT_PREMOUNT}>
            <LayerClip src={layer.src} />
          </Sequence>
        );
      })}
    </>
  );
};

// A FAIXA DE LEGENDA inteira dentro de uma janela.
//
// Recortar aqui, e nao dentro de cada estilo, e o que torna o trim da faixa
// Texto/Legendas possivel sem tocar em Karaoke, Stacked, Scatter e nas quatro
// variantes simples — sete lugares para a mesma decisao. As palavras seguem
// com o tempo delas; isto so diz QUANDO a faixa existe.
const CaptionWindow: React.FC<{children: React.ReactNode}> = ({children}) => {
  const {fps, durationInFrames} = useVideoConfig();
  const D = useEditData();
  const inicio = Number(D.captions.startSec);
  const fim = Number(D.captions.endSec);
  const temJanela = (Number.isFinite(inicio) && inicio > 0) || Number.isFinite(fim);
  if (!temJanela) return <>{children}</>;
  const from = Number.isFinite(inicio) ? Math.max(0, Math.round(inicio * fps)) : 0;
  const ate = Number.isFinite(fim) ? Math.round(fim * fps) : durationInFrames;
  return (
    <Sequence from={from} durationInFrames={Math.max(1, ate - from)} layout="none">
      {children}
    </Sequence>
  );
};

// ============ MAIN ============
export const Main: React.FC = () => {
  const D = useEditData();
  const {graphicLayers} = useProjectData();
  return (
    <AbsoluteFill style={{backgroundColor: 'black'}}>
      {D.soundtrack.enabled ? <Soundtrack /> : null}
      <BaseWithSplits />
      <BehindSubject />
      <Inserts />
      {graphicLayers?.length ? <PrerenderedGraphics layers={graphicLayers} /> : <CustomGraphics />}
      {D.hook.enabled ? <HookIntro /> : null}
      {D.captions.enabled
        ? (
          <CaptionWindow>
            <CaptionStyleLayer>{(style) => style === 'stacked'
              ? <StackedCaptions />
              : style === 'scatter'
                ? <ScatterCaptions />
                : ['impacto','impacto-inline','impacto-topo','impacto-branco','destaque','palavra-bounce'].includes(style)
                  ? <CaptionImpact />
                  : SIMPLE_VARIANTS[style] || style === 'personalizada'
                    ? <SimpleCaptions variant={style} />
                    : <Karaoke />}</CaptionStyleLayer>
          </CaptionWindow>
        )
        : null}
    </AbsoluteFill>
  );
};
