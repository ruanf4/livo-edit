/**
 * SimpleCaptions — the three STATIC caption styles.
 *
 *   "simples"  Poppins semibold, squeezed, off-white, ONE line, up to 3 words
 *   "serifada" the same rules in a classic serif (Libre Baskerville)
 *   "classica" classic subtitle: small sans (Inter), TWO lines, low on frame
 *
 * No animation anywhere — a cue simply replaces the previous one on the frame
 * the word starts. That is the whole point of these three: they are what you
 * reach for when the footage, not the typography, should carry the motion.
 *
 * Lines are grouped by MEASURED WIDTH, not by word count. "inteligência" and
 * "de" cannot share a rule: the long word takes its own line and the short ones
 * ride together, which is exactly what a fixed 3-words-per-line would get wrong.
 *
 * Data: public/captions.json (word level) — no extra generation step.
 */
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {BASKERVILLE, INTER, POPPINS, loadLivoEditFonts} from './fonts';
import {measureText} from '@remotion/layout-utils';
import {useProjectData} from './data';
import {captionPaddingBottomAt, captionSegmentAt, useEditData} from './Main';
import {useEffect, useState} from 'react';
import {continueRender, delayRender, staticFile} from 'remotion';

loadLivoEditFonts();

const OFFWHITE = '#f4f1e9';

type Word = {text: string; startMs: number; endMs: number};
type Variant = {
  family: string;
  weight: number;
  size: number;
  maxWords: number;
  lines: 1 | 2;
  squeeze: number; // horizontal scale — Poppins ships no condensed cut
  squeezeY: number; // vertical scale — squat the letterforms, does NOT regroup
  tracking: number;
  bottom: number;
  maxW: number;
  // Cor do texto; ausente, o off-white de sempre.
  color?: string;
};

// LEGENDA PERSONALIZADA (0.65.23): a quarta variante estatica, montada a
// partir do edit-data — a fonte do aluno (copiada para public/fonts/
// personalizadas/ e declarada aqui por @font-face com um nome interno unico),
// cor, corpo, uma ou duas linhas e o teto de palavras. O peso e o do proprio
// arquivo escolhido, por isso o CSS pede 400: pedir 700 sobre um arquivo
// regular faria o navegador engordar as letras por conta propria.
export const FONTE_PERSONALIZADA = 'LivoEditPersonalizada';
// Uma familia POR ARQUIVO (0.65.28): legenda e texto podem usar fontes
// diferentes ao mesmo tempo, e duas faces com o mesmo nome e os mesmos
// descritores disputariam o mesmo slot no navegador.
export const familiaDaFonte = (arquivo: string): string =>
  `${FONTE_PERSONALIZADA}-${arquivo.slice(arquivo.lastIndexOf('/') + 1).replace(/\.[a-z0-9]+$/iu, '').replace(/[^a-z0-9-]/giu, '-')}`;
export type Personalizada = {arquivo: string; cor: string; tamanho: number; linhas: 1 | 2; palavras: 1 | 3 | 5};
export function variantePersonalizada(p: Personalizada): Variant {
  return {
    family: familiaDaFonte(p.arquivo),
    weight: 400,
    size: p.tamanho,
    // Em duas linhas o agrupador mede pela largura, como a classica.
    maxWords: p.linhas === 2 ? 14 : p.palavras,
    lines: p.linhas,
    squeeze: 1,
    squeezeY: 1,
    tracking: 0,
    bottom: 430,
    maxW: 860,
    color: p.cor,
  };
}

// Carrega a fonte do aluno UMA vez por arquivo e segura o quadro ate ela
// chegar (delayRender) — sem isso o primeiro quadro sairia na fonte de
// reserva. Falha de carga nao trava o render: registra e segue na reserva.
const fontesCarregadas = new Map<string, 'pronta' | 'falhou'>();
export function useFontePersonalizada(arquivo?: string): boolean {
  const [pronta, setPronta] = useState(() => !arquivo || fontesCarregadas.has(arquivo));
  useEffect(() => {
    if (!arquivo || fontesCarregadas.has(arquivo)) {
      setPronta(true);
      return undefined;
    }
    const handle = delayRender(`Carregando a fonte personalizada ${arquivo}`, {timeoutInMilliseconds: 60_000});
    let viva = true;
    const face = new FontFace(familiaDaFonte(arquivo), `url(${staticFile(arquivo)})`);
    face.load()
      .then((carregada) => {
        document.fonts.add(carregada);
        fontesCarregadas.set(arquivo, 'pronta');
      })
      .catch((erro) => {
        console.error(`livoedit-fonts: a fonte personalizada nao carregou (${arquivo}):`, erro);
        fontesCarregadas.set(arquivo, 'falhou');
      })
      .finally(() => {
        if (viva) setPronta(true);
        continueRender(handle);
      });
    return () => {
      viva = false;
    };
  }, [arquivo]);
  return pronta;
}

export const SIMPLE_VARIANTS: Record<string, Variant> = {
  simples: {
    family: POPPINS,
    weight: 600,
    size: 66,
    maxWords: 3,
    lines: 1,
    squeeze: 0.9,
    squeezeY: 0.9,
    tracking: -3,
    bottom: 430,
    maxW: 860,
  },
  serifada: {
    family: BASKERVILLE,
    weight: 700,
    size: 67,
    maxWords: 3,
    lines: 1,
    squeeze: 1,
    squeezeY: 1,
    tracking: -1,
    bottom: 430,
    maxW: 860,
  },
  classica: {
    family: INTER,
    weight: 500,
    size: 42,
    maxWords: 14,
    lines: 2,
    squeeze: 1,
    squeezeY: 1,
    tracking: 0,
    bottom: 430, // same height as the other two — low on frame it read as an afterthought
    maxW: 840,
  },
};

const clean = (t: string) => t.replace(/[.,!?…]+$/, '');
const isBreak = (t: string) => /[.,!?…]$/.test(t);

const widthOf = (words: Word[], V: Variant) =>
  measureText({
    text: words.map((w) => clean(w.text)).join(' '),
    fontFamily: V.family,
    fontSize: V.size,
    fontWeight: V.weight,
    letterSpacing: `${V.tracking}px`,
  }).width * V.squeeze;

// Group by width first, word count second. A cue also ends on punctuation or on
// a speech gap, so the text breaks where the speaker breathes.
function buildCues(words: Word[], V: Variant): Word[][] {
  const budget = V.maxW * V.lines;
  const cues: Word[][] = [];
  let cur: Word[] = [];
  words.forEach((w, i) => {
    const trial = [...cur, w];
    if (cur.length && (trial.length > V.maxWords || widthOf(trial, V) > budget)) {
      cues.push(cur);
      cur = [w];
    } else {
      cur = trial;
    }
    const prev = words[i];
    const next = words[i + 1];
    const gap = next ? next.startMs - prev.endMs : 0;
    if (cur.length && (isBreak(prev.text) || gap > 450)) {
      cues.push(cur);
      cur = [];
    }
  });
  if (cur.length) cues.push(cur);
  return cues;
}

// Two-line styles split where the halves come out closest in width — but a pure
// width balance happily ends a line on "o" or "de", which is the one thing a
// classic subtitle never does. Breaking after a short function word carries a
// penalty worth ~200px of imbalance, so it only wins when nothing else is close.
const ORPHAN = /^(o|a|os|as|e|é|de|do|da|em|no|na|um|uma|que|se|ao|à|por|com)$/i;

function splitTwo(words: Word[], V: Variant): Word[][] {
  if (V.lines === 1 || words.length < 2) return [words];
  let best = 0;
  let bestScore = Infinity;
  for (let i = 1; i < words.length; i++) {
    const diff = Math.abs(widthOf(words.slice(0, i), V) - widthOf(words.slice(i), V));
    const tail = clean(words[i - 1].text);
    const score = diff + (ORPHAN.test(tail) ? 200 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return [words.slice(0, best), words.slice(best)];
}

// A configuracao da personalizada, ou nada (style 'personalizada' sem
// configuracao valida cai na 'simples' — a interface nem deixa aplicar assim).
const C_personalizada = (D: ReturnType<typeof useEditData>): Personalizada | undefined => {
  const p = D.captions.personalizada;
  if (!p || typeof p.arquivo !== 'string' || !p.arquivo) return undefined;
  return {
    arquivo: p.arquivo,
    cor: typeof p.cor === 'string' ? p.cor : '#f4f1e9',
    tamanho: Number(p.tamanho) || 64,
    linhas: Number(p.linhas) === 2 ? 2 : 1,
    palavras: p.palavras === 1 || p.palavras === 5 ? p.palavras : 3,
  };
};

export const SimpleCaptions: React.FC<{variant: string}> = ({variant}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames, height} = useVideoConfig();
  const D = useEditData();
  const {captions} = useProjectData();
  const P = variant === 'personalizada' ? C_personalizada(D) : undefined;
  const fontePronta = useFontePersonalizada(P?.arquivo);
  const base = P ? variantePersonalizada(P) : (SIMPLE_VARIANTS[variant] ?? SIMPLE_VARIANTS.simples);
  // Ajustes do gizmo do palco (edit-data.json → captions): escala sobre o
  // corpo calibrado e pe do texto em px da composicao. Ausentes, o estilo
  // fica EXATAMENTE como calibrado — projeto antigo renderiza igual byte a
  // byte. A escala entra no V efetivo porque o corpo participa da QUEBRA de
  // linhas (widthOf mede com ele): escalar so no CSS quebraria as linhas com
  // um corpo e desenharia com outro.
  const C = D.captions;
  // A fonte do aluno ainda chegando: nada na tela ate ela (o delayRender ja
  // segura o quadro do render; na previa isto evita o piscar da reserva).
  if (P && !fontePronta) return null;
  const V = {...base, size: Math.round(base.size * (C.simpleScale ?? 1))};
  const cues = buildCues(captions as Word[], V);

  let idx = -1;
  for (let i = 0; i < cues.length; i++) {
    if (frame >= Math.round((cues[i][0].startMs / 1000) * fps)) idx = i;
  }
  if (idx < 0) return null;
  const next = cues[idx + 1];
  const end = next
    ? Math.round((next[0].startMs / 1000) * fps)
    : Math.min(durationInFrames, Math.round((cues[idx][cues[idx].length - 1].endMs / 1000) * fps) + fps);
  if (frame >= end) return null;

  const lines = splitTwo(cues[idx], V);
  // Tela dividida: a legenda se centra na divisa (o frame aqui e o GLOBAL —
  // este componente nao vive dentro de Sequence).
  // V.bottom e calibrado no quadro vertical (430 de 1920): escala pela altura
  // para o horizontal nao empurrar a legenda para o meio da tela. O
  // simpleBottom do gizmo ja vem em px da composicao — entra como esta.
  // Trecho da faixa (0.65.22): oculto nao desenha; posicao explicita do
  // trecho vence janela e junção.
  const trecho = captionSegmentAt(D, frame, fps);
  if (trecho?.oculto) return null;
  const paddingBottom = captionPaddingBottomAt(D, frame, fps, height, C.simpleBottom ?? Math.round(V.bottom * (height / 1920)), Math.round(V.size * V.lines * 0.62), trecho?.simpleBottom);
  return (
    <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom}}>
      <div
        style={{
          textAlign: 'center',
          fontFamily: V.family,
          fontWeight: V.weight,
          fontSize: V.size,
          letterSpacing: V.tracking,
          lineHeight: 1.18,
          color: V.color ?? OFFWHITE,
          whiteSpace: 'pre',
          // scaleY only squats the glyphs — the line grouping is measured on
          // WIDTH, so unlike the horizontal squeeze this changes no line breaks
          transform:
            V.squeeze === 1 && V.squeezeY === 1
              ? undefined
              : `scale(${V.squeeze}, ${V.squeezeY})`,
          textShadow: '0 4px 18px rgba(0,0,0,0.55)',
        }}
      >
        {lines.map((ln, i) => (
          <div key={i}>{ln.map((w) => clean(w.text)).join(' ')}</div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
