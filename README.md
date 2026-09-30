<p align="center"><img src="assets/livo-logo.png" alt="Livo Edit" height="72"></p>

# Livo Edit

**Editor de vídeo por conversa, mantido por [Ruan Duarte (@ruanf4)](https://github.com/ruanf4).**

Transforme seu vídeo em Reels, TikTok, Shorts ou conteúdo horizontal. A Livo Edit
analisa a fala, propõe os cortes, prepara o vídeo e aplica legendas animadas após
sua aprovação. Você descreve o resultado; o agente executa a edição.

Este repositório distribui o **plugin e a skill**. O aplicativo desktop é um produto
separado. Os arquivos dos seus vídeos e chaves de API não fazem parte deste pacote.

## Usar no ChatGPT Work pelo celular

Depois de instalar/importar o plugin em uma conta compatível, abra **Work**, selecione
**Livo Edit** pelo menu `@`, envie seu vídeo e descreva o que deseja. Exemplo:

> Use Livo Edit para transformar este vídeo em um Reels. Corte os silêncios,
> mantenha minha fala natural e use Destaque no início e Simples depois.
> Mostre o corte para eu aprovar antes de finalizar as legendas.

A edição usa as ferramentas de execução disponíveis no Work Cloud ou no computador
conectado. O processamento não acontece no hardware do celular. Disponibilidade,
instalação e ferramentas variam conforme a conta e o ambiente; instalar uma skill
não instala automaticamente Python, ffmpeg ou Node.

**Para importar pelo GitHub em um workspace com administração habilitada:**

1. Abra **Admin → Plugins → Add → Import marketplace**.
2. Informe `https://github.com/ruanf4/livo-edit`.
3. Deixe **Path** vazio e use a branch `main`.
4. Importe e configure o acesso ao plugin **Livo Edit**.
5. Instale o plugin e abra uma nova conversa no Work.

O catálogo fica em `.agents/plugins/marketplace.json`, o manifesto em `plugin.json`
e a skill em `skills/livo-edit/SKILL.md`. O pacote não declara servidor MCP.
Se sua conta não mostrar importação, use a opção de criação/importação de skills
que estiver disponível nela; este link também permite ao Work consultar os arquivos
quando ele tiver acesso ao repositório. Publicar no GitHub não coloca o plugin
automaticamente no diretório público da OpenAI.

Referências: [Plugins](https://learn.chatgpt.com/docs/plugins),
[importação pelo GitHub](https://learn.chatgpt.com/docs/enterprise/plugin-management),
[formato de pacote](https://developers.openai.com/plugins/build/plugins).

## Modelos de legenda Livo

- **Impacto** — palavra de destaque maior.
- **Impacto (linha)** — frase fluida na mesma linha.
- **Impacto (topo)** — bloco com ancoragem superior.
- **Impacto branco** — ênfase em branco.
- **Destaque** — palavra principal colorida.
- **Palavra (rebote)** — animação de rebote por palavra.

Também inclui os estilos clássicos, cor de destaque e configurações por trecho.
A versão pública usa **Inter** nos modelos Livo, com licença OFL; as demais fontes
livres e suas licenças são incluídas. A fonte comercial do aplicativo em testes
não é distribuída aqui.

## Instalar no computador — Claude Code, Codex e Gemini

Tenha `uv`, `ffmpeg`, `ffprobe` e Node 18+ disponíveis e execute:

```bash
uv run https://raw.githubusercontent.com/ruanf4/livo-edit/main/livo_edit_install.py
```

O instalador baixa este repositório, encontra `skills/livo-edit`, instala a skill
nos agentes disponíveis e preserva `.env` e `.venv` existentes. Na primeira
transcrição, os modelos de fala são baixados; isso pode consumir alguns GB.
Veja [instalação detalhada](skills/livo-edit/install.md).

## O que está incluído

- Cortes pela fala, JCut e correção de cor.
- Transcrição local com alinhamento por palavra.
- Templates Remotion com legendas, câmera, zoom e rastreamento de rosto.
- Helpers e instruções para trabalhar com os vídeos enviados.
- Fontes locais para o render e identidade visual Livo Edit.

Sem chave de API para transcrição. Imagens por serviços externos e trilha com IA
são recursos opcionais e precisam de credenciais do próprio operador. O pacote
não inclui credenciais de terceiros. O uso de Remotion segue suas próprias
[condições de licença](https://www.remotion.dev/license).

## Manutenção e licença

Projeto: **Ruan Duarte / Livo Edit**. Abra problemas e sugestões em
[Issues](https://github.com/ruanf4/livo-edit/issues).

O código mantém a licença [MIT](LICENSE) e a atribuição da base Edvid / Creator
Factory. As fontes têm licenças próprias em `skills/livo-edit/assets/shortform/public/fonts/`.
