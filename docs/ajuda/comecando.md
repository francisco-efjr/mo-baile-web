---
area: comecando
titulo: Começando
resumo: Audite o tagueamento de um app direto no navegador, sem instalar nada.
precisa: um navegador atualizado (Chrome, Edge, Firefox ou Safari)
---

## O que é

O Mo baile Web é a parte de tagueamento do Mo baile rodando como site. O **Relatório** audita um log de eventos contra a spec, e o **Analytics** lista os eventos de um logcat salvo. O motor roda no seu navegador: seus arquivos não saem dele.

> Atenção: o Mo baile Web está em beta e pode ter bugs. Se algo falhar, use [Relatar um Problema](relatar-problema.md).

## Quando usar

- Quando você não usa macOS ou não quer instalar o Mo baile.
- Para auditar um log que alguém do time salvou.
- Para conferir rápido os eventos de um logcat.

## Passo a passo

1. Abra a aba **Relatório** para auditar uma spec contra um log.
2. Abra a aba **Analytics** para ver os eventos de um logcat salvo.
3. Sem arquivos à mão? Clique em **Experimentar com um Exemplo** no Relatório.
4. Exporte o resultado em HTML, Markdown ou TSV para mandar ao time.

## Exemplo prático

Você recebeu do time a spec da tela de login do DemoApp e um log salvo do Android. Abra **Relatório**, arraste os dois arquivos, deixe a plataforma como **A da Spec** e clique em **Auditar**. Filtre por **Divergentes**, abra o item e compare Obtido × Esperado. Clique em **Baixar HTML** e anexe o relatório no card.

## Recursos

- **Relatório**: audita o log contra a spec, parâmetro por parâmetro. Veja [Relatório](report.md).
- **Analytics**: lista os eventos do Firebase de um logcat salvo. Veja [Analytics](analytics.md).
- **Tema**: siga o sistema ou escolha Claro ou Escuro. O site lembra a escolha neste navegador.
- **Relatar um Problema**: abre um relato público no GitHub, já com a aba em que você estava.

## Problemas comuns

- **A página parou de responder.** Atualize a página e escolha os arquivos de novo. Nada foi enviado, então nada se perdeu fora daqui.
- **Procuro o espelho do aparelho ou o Page Objects.** Essas áreas existem só no Mo baile para macOS.
- **Um log grande demora.** A leitura acontece no seu computador. Logs muito grandes levam alguns segundos.
