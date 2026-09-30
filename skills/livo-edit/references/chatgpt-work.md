# ChatGPT Work — vídeo enviado pelo celular

Resolva `helpers/`, `assets/` e este guia relativamente à pasta da skill.
Em uma cópia GitHub deste pacote, ela está em `skills/livo-edit/`. Não assuma
que o vídeo está numa pasta local do celular: use o arquivo anexado disponível
no ambiente de execução ou uma fonte explicitamente fornecida pelo usuário.

1. Confirme o formato desejado e a intenção editorial com o que o usuário já disse.
2. Verifique o ambiente com `python helpers/check_environment.py`. Use o Python
   com as dependências da skill; onde houver uv, `uv run --directory <skill> python
   <skill>/helpers/check_environment.py` prepara/usa esse ambiente.
3. Se ferramentas faltarem, instale-as somente pelas capacidades permitidas no
   ambiente. `uv sync --directory <skill>` prepara as dependências Python. ffmpeg,
   ffprobe e Node são ferramentas de sistema. Instale a skill remotion-best-practices
   quando necessária e disponível; ela não é um servidor remoto de processamento.
4. Trabalhe numa pasta dedicada para as fontes e os arquivos `edit/`. Obtenha a
   estratégia e a aprovação de corte segundo as fases descritas em SKILL.md.
5. Leia o guia shortform ou longform conforme o formato. Copie o template,
   configure edit-data.json, gere captions/track/cues e renderize o resultado.
6. Entregue o arquivo real cut.mp4 para aprovar o corte e final.mp4 no final,
   usando o mecanismo de download de arquivos disponível no Work. Um endereço
   localhost de preview serve apenas ao ambiente onde o servidor está rodando;
   não o apresente como um link público que o celular consegue abrir.

As fontes da publicação são locais e OFL. Nos seis presets Livo, Inter substitui
a Helvetica comercial. Carregue a fonte personalizada só quando o usuário
fornecer um arquivo permitido. Use accent e segmentos de legenda para estilos
ou cores diferentes ao longo do vídeo. Nenhuma credencial está embutida.

Se o ambiente não disponibilizar shell/processamento de mídia ou memória suficiente
para os modelos, descreva a limitação concreta e os arquivos/instruções preparados.
Não afirme que um render foi feito sem um arquivo gerado e conferido.
