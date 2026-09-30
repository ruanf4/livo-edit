# Livo Edit — identidade visual (v0, provisória)

<p><img src="livo-logo.png" alt="Livo Edit" height="64"></p>

## Símbolo

Um **play** atravessado por um **corte** diagonal — vídeo + edição num ícone só.
Quadrado de cantos arredondados, em preto e branco (funciona como ícone de app e
favicon, legível a 16 px).

## Paleta — preto e branco

| Papel | Hex | Onde aparece |
|---|---|---|
| Primária | `#FFFFFF` | botões principais, fase ativa, agulha da timeline, seleção |
| Secundária | `#C8C8C8` | "salvo", trilha de legendas, caixas marcadas |
| Terciária | `#8A8A8A` | trilha de áudio na timeline |
| Preto | `#0B0B0B` | texto sobre a cor primária, logo sobre fundo claro |
| Fundo | `#08090C` → `#10141B` | interface de preview |

O vermelho das **marcações de ajuste** (`#FF5470`) foi mantido de propósito: é
sinal funcional ("aqui tem algo a corrigir"), não cor de marca. A cor de destaque
das legendas e headlines nos vídeos continua sendo escolhida em cada projeto, na
aba Estilo.

## Tipografia

- **Logo:** Sora ExtraBold ("livo") + Sora Light ("edit"), convertida em contorno no SVG.
- **Interface:** Poppins (mantida, porque as prévias de legenda dependem dela).

## Arquivos

| Arquivo | Uso |
|---|---|
| `livo-logo-white.svg` / `.png` | logo horizontal branca, para **fundo escuro** |
| `livo-logo.svg` / `.png` | logo horizontal preta, para **fundo claro** |
| `livo-mark-white.svg` · `livo-mark-white-512/192/64.png` | símbolo branco |
| `livo-mark.svg` · `livo-mark-512/192/64.png` | símbolo preto |

## Como trocar

1. Edite `BLACK` / `WHITE` (ou a forma do símbolo) em `make_logo.py`.
2. Rode `uv run python brand/make_logo.py` na pasta da skill: ele regrava tudo
   aqui e as cópias em `assets/preview/`.
3. As cores da interface ficam no `:root` de `assets/preview/app.css`
   (`--primary`, `--secondary`, `--tertiary`) e nos `rgba(...)` do mesmo arquivo.

Tem uma logo própria pronta? Substitua `assets/preview/livo-logo-white.svg`
(cabeçalho) e `livo-mark.svg` / `livo-mark.png` (favicon) mantendo os nomes.
