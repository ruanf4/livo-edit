/**
 * DADOS DO PROJETO — um contexto com os imports estaticos como VALOR PADRAO.
 *
 * O render (CLI, Root.tsx) nao passa provider nenhum: o padrao alimenta tudo e
 * o comportamento e byte a byte o mesmo de quando cada arquivo importava os
 * JSONs direto. A previa ao vivo do Livo Edit importa a MESMA composicao e injeta
 * por cima os dados do projeto aberto — e so por isso este arquivo existe.
 *
 * graphicLayers e o unico campo sem arquivo por tras: quando o CustomGraphics
 * do projeto e sob medida (o app empacotado nao compila TSX), a previa recebe
 * aqui os clipes pre-renderizados com alpha (edit/graficos/*.webm) e o Main
 * toca os clipes NO LUGAR do CustomGraphics. No render isto e sempre null.
 */
import {createContext, useContext} from 'react';
import captionsJson from '../public/captions.json';
import trackJson from '../public/track.json';
import segmentsJson from '../public/segments.json';
import cuesJson from '../public/caption-cues.json';
import editDataJson from '../public/edit-data.json';

export type CaptionWord = {text: string; startMs: number; endMs: number};
export type GraphicLayer = {src: string; start: number; end: number};

export type ProjectData = {
  editData: unknown;
  captions: CaptionWord[];
  track: {points: [number, number][]};
  segments: {segments: {start: number; dur: number}[]};
  cues: unknown;
  graphicLayers?: GraphicLayer[] | null;
};

export const STATIC_PROJECT_DATA: ProjectData = {
  editData: editDataJson,
  captions: captionsJson as CaptionWord[],
  track: trackJson as unknown as ProjectData['track'],
  segments: segmentsJson as unknown as ProjectData['segments'],
  cues: cuesJson,
  graphicLayers: null,
};

const ProjectDataContext = createContext<ProjectData>(STATIC_PROJECT_DATA);
export const ProjectDataProvider = ProjectDataContext.Provider;
export const useProjectData = (): ProjectData => useContext(ProjectDataContext);
