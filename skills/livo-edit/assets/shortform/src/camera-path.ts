/**
 * O TRAJETO DA CAMERA NO TRACKING CONTINUO (0.65.3).
 *
 * "Tracking de rosto" como o mercado entende: a camera SEGUE o rosto dentro
 * da cena, suave, como um cinegrafista — nao o ponto cru do detector. O
 * seguir cru ja foi tentado e rejeitado com relato real (0.36.1: "a camera
 * flutuava atras do rosto"); o que muda aqui e o TRATAMENTO do trajeto:
 *
 *   1. FALHAS PREENCHIDAS: quadro sem rosto herda o ponto anterior (e o
 *      primeiro valido preenche o comeco) — piscada do detector nao e
 *      movimento.
 *   2. MEDIA MOVEL (~0,35s para cada lado): tira o tremor de pixel.
 *   3. ZONA MORTA + TETO DE VELOCIDADE: a camera so anda quando o rosto sai
 *      de uma janela central (movimento pequeno nao mexe o quadro), e anda
 *      com velocidade limitada — nunca "gruda" no rosto, desliza atras dele.
 *   4. CORTE E TIRO SECO: em fronteira de cena a camera SALTA para a posicao
 *      nova. Corte e troca de plano; deslizar atravessando um corte parece
 *      erro de edicao.
 *
 * Modulo PURO (sem remotion, sem disco) de proposito: o mesmo trajeto vale
 * para o render (conta por quadro) e para a previa (keyframes WAAPI), e o
 * teste alcanca a matematica de verdade.
 */

export type CenaDeCorte = {start: number; dur: number};

// O TEMPERAMENTO DA CAMERA. Calibrado duas vezes: a primeira leva (0.65.3:
// zona 0.03, velocidade 0.25, janela 0.35, piso 1.10) funcionou mas o Fill
// viu "suave demais" — o seguir quase nao aparecia. Um degrau para cima em
// tudo (0.65.4): a camera responde a movimentos menores, alcanca mais
// rapido e enquadra mais fechado. Mudar de novo e decisao de produto — o
// teste trava os quatro numeros de proposito.
//
// Janela central onde o rosto pode passear sem mexer a camera (fracao do
// quadro, por eixo). Menor que isso e "tremor de gente parada".
export const ZONA_MORTA = 0.018;
// Quanto a camera anda por SEGUNDO, no maximo (fracao do quadro). 0.45
// alcanca um rosto que cruzou meio quadro em ~1s — viva, sem grudar.
export const VELOCIDADE_MAX = 0.45;
// Media movel: ~0,25s para cada lado do quadro.
export const JANELA_SUAVE_S = 0.25;
// O zoom de enquadramento do tracking. E um PISO por max(): cena que o
// plano escolheu com zoom maior continua maior (1.10–1.22 + push-in), e a
// cena parada sobe ate aqui para o seguir ter amplitude visivel.
export const PISO_TRACKING = 1.15;

const PONTO_PADRAO: readonly [number, number] = [0.5, 0.4];

const valido = (ponto: unknown): ponto is readonly [number, number] =>
  Array.isArray(ponto)
  && Number.isFinite(Number(ponto[0]))
  && Number.isFinite(Number(ponto[1]));

/**
 * O trajeto da camera, um par [cx, cy] POR QUADRO GLOBAL do video.
 * `pontos` e o track.json (um ponto por quadro, 0..1); `cenas` sao os blocos
 * do corte (segments.json). Sem pontos, devolve vazio — quem chama cai no
 * comportamento por cena de sempre.
 */
export function suavizarTrajetoDaCamera(input: {
  pontos: ReadonlyArray<unknown>;
  cenas: ReadonlyArray<CenaDeCorte>;
  fps: number;
  totalFrames?: number;
}): Array<[number, number]> {
  const fps = Number.isFinite(input.fps) && input.fps > 0 ? input.fps : 30;
  const total = Math.max(0, Math.round(input.totalFrames ?? input.pontos.length));
  if (total === 0) return [];

  // 1. Falhas preenchidas: para frente, e o primeiro valido cobre o comeco.
  const limpo: Array<[number, number]> = [];
  let ultimo: readonly [number, number] | null = null;
  for (let i = 0; i < total; i += 1) {
    const cru = input.pontos[i];
    if (valido(cru)) ultimo = [Number(cru[0]), Number(cru[1])];
    limpo.push(ultimo ? [ultimo[0], ultimo[1]] : [PONTO_PADRAO[0], PONTO_PADRAO[1]]);
  }
  const primeiroValido = limpo.findIndex((_, i) => valido(input.pontos[i]));
  if (primeiroValido > 0) {
    for (let i = 0; i < primeiroValido; i += 1) {
      limpo[i] = [limpo[primeiroValido][0], limpo[primeiroValido][1]];
    }
  }

  // 2. Media movel por soma acumulada (O(n)).
  const janela = Math.max(1, Math.round(JANELA_SUAVE_S * fps));
  const somaX = [0]; const somaY = [0];
  for (let i = 0; i < total; i += 1) {
    somaX.push(somaX[i] + limpo[i][0]);
    somaY.push(somaY[i] + limpo[i][1]);
  }
  const suave: Array<[number, number]> = [];
  for (let i = 0; i < total; i += 1) {
    const de = Math.max(0, i - janela);
    const ate = Math.min(total - 1, i + janela);
    const n = ate - de + 1;
    suave.push([(somaX[ate + 1] - somaX[de]) / n, (somaY[ate + 1] - somaY[de]) / n]);
  }

  // 3+4. O cinegrafista: zona morta e teto de velocidade DENTRO da cena,
  // salto seco na fronteira. Sem cenas, o video inteiro e uma cena so.
  const inicios = new Set<number>([0]);
  for (const cena of input.cenas) {
    const quadro = Math.round(Number(cena.start) * fps);
    if (Number.isFinite(quadro) && quadro > 0 && quadro < total) inicios.add(quadro);
  }
  const passoMax = VELOCIDADE_MAX / fps;
  const caminho: Array<[number, number]> = [];
  let cam: [number, number] = [suave[0][0], suave[0][1]];
  for (let i = 0; i < total; i += 1) {
    if (inicios.has(i)) cam = [suave[i][0], suave[i][1]];
    else {
      for (const eixo of [0, 1] as const) {
        const delta = suave[i][eixo] - cam[eixo];
        const excesso = Math.abs(delta) - ZONA_MORTA;
        if (excesso > 0) cam[eixo] += Math.sign(delta) * Math.min(excesso, passoMax);
      }
    }
    caminho.push([cam[0], cam[1]]);
  }
  return caminho;
}
