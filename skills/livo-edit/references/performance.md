# Desempenho: transcrever e exportar

O processamento acontece no ambiente de execução do agente, não no telefone.
Preserve o vídeo original, a transcrição corrigida, os tempos e os efeitos pedidos.

## Transcrição

Quando vários vídeos precisam ser transcritos, execute o helper uma vez com todos
os caminhos. O processo reutiliza WhisperX e o alinhador entre arquivos:

```sh
uv run python helpers/transcribe.py video1.mp4 video2.mp4 --language pt
```

O helper detecta CUDA quando disponível e usa CPU/INT8 caso contrário. O modelo
padrão permanece large-v3, preservando a qualidade. `--model large-v3-turbo` é uma
opção quando o usuário aceita comparar a precisão. O cache existente continua
válido: não use `--force` para mudar estilo ou corrigir uma grafia. Pedidos de texto
passam pelo glossário/correct_transcript.py, sem reconhecer o áudio de novo.
Trocar modelo, idioma ou prompt invalida o modelo em memória. Encerrar o processo
libera os modelos. Não execute vários reconhecedores em paralelo com pouca RAM.

## Exportação

Os modelos Livo reaproveitam agrupamento e medidas de texto e buscam apenas a frase
do quadro atual. Alterar legenda ou fonte invalida os dados necessários. Não modifique
src/Main.tsx para acelerar uma edição, nem remova animações pedidas pelo usuário.

Reutilize o cache padrão do bundler; não apague node_modules/.cache/webpack entre
renders. Exporte um vídeo por vez. Em pouca memória, `--concurrency=1` e cache de
200 MB são o caminho conservador. Em máquinas maiores, compare 1, 2 e 4 abas num
trecho representativo, preservando resolução, fps e áudio. Mais abas não garantem
mais velocidade. Não rode exportação final, exportação por trecho e gráficos em
paralelo enquanto a máquina estiver exportando.

Se o usuário pedir um arquivo rápido para revisar, use 720p/30 fps. Para entrega
final mantenha resolução e fps combinados; 1080p/30 fps pode ser escolhido pelo
usuário, mas não reduza automaticamente um projeto de 60 fps.

Preserve o fluxo MOV/H.264 com áudio PCM e conversão final para MP4/AAC documentado
no guia de formato. Não reative codificação paralela sem testar sincronismo: ela
provocava atraso de áudio neste projeto. Não atualize o runtime Mac 13/14 sem
validar compositor e navegador naquele sistema.
