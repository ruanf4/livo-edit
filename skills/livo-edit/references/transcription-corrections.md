# Correções de transcrição

Quando o usuário pedir “troque sempre ligia por Lígia”, procure palavras inteiras
ignorando acentos, maiúsculas e a representação Unicode. Grave exatamente a grafia
pedida. Não confunda corrigir a escrita com recortar a fala ou retranscrever o vídeo.

Para substituir uma palavra em todo o projeto:

```bash
uv run python helpers/correct_transcript.py --project /pasta/do/projeto --from ligia --to Lígia
```

O helper atualiza transcrições, captions.json e caption-cues.json já existentes;
mantém tempos, pontuação e estilos. Salva a preferência em
`edit/transcription-glossary.json`. Regerar legendas e retranscrever reaplica essa
grafia. O relatório informa quantas ocorrências há nas legendas e quais arquivos
mudaram. Se não houver correspondência, diga isso; não alegue ter corrigido.

“ligia” encontra “Lígia”, “LIGIA” e “Ligia”, mas não “Ligiane”. Para reescrever uma
frase, acrescentar palavras ou corrigir apenas um trecho, edite os tokens desse
trecho; não use uma correção global. O helper de grafia aceita uma palavra por vez.

Antes de transcrever, se o usuário informou nomes, marcas ou termos da fala, passe
esses termos em `transcribe.py --prompt "Lígia, Livo Edit"`. O glossário do projeto
também entra no prompt do WhisperX. Isso é contexto para o reconhecimento, não um
roteiro para completar frases. `--language pt` fixa português; use outro idioma
quando o material pedir. `--force` refaz uma transcrição em cache; uma simples
correção de grafia dispensa esse trabalho. A extração usa WAV PCM, sem MP3 intermediário.
