---
area: analytics
titulo: Analytics
resumo: Liste os eventos de Firebase Analytics de um logcat salvo e confira os parâmetros.
precisa: um logcat salvo de um aparelho Android, com o log do Firebase ligado
---

## O que é

Analytics lê um logcat salvo e mostra os eventos de Firebase Analytics numa tabela, com os parâmetros de cada um.

> Dica: o Android ao vivo pelo cabo (WebUSB, no Chrome e no Edge) vem numa próxima versão. Por enquanto, salve o logcat num arquivo.

## Quando usar

- Para confirmar que um evento disparou.
- Para conferir os parâmetros de um evento.
- Para levar os eventos para uma planilha.

## Passo a passo

1. Com o aparelho conectado, ligue o log do Firebase: `adb shell setprop log.tag.FA VERBOSE` e `adb shell setprop log.tag.FA-SVC VERBOSE`.
2. Use o app e faça o fluxo que você quer conferir.
3. Salve o logcat: `adb logcat -d > log.txt`.
4. Em **Analytics**, clique em **Escolher Logcat…** ou arraste o `log.txt` para o quadro.
5. Busque pelo evento e clique nele para ver os parâmetros.
6. Clique em **Baixar TSV** ou **Baixar JSON** para levar os eventos adiante.

## Exemplo prático

Você quer conferir o `screen_view` do carrinho do DemoApp. Ligue o log do Firebase, abra o carrinho no aparelho e rode `adb logcat -d > log.txt`. Arraste o arquivo para Analytics, busque `screen_view` e clique no evento: o `screen_name` aparece no JSON dos parâmetros. Para auditar contra a spec, use o mesmo `log.txt` no [Relatório](report.md).

## Recursos

- **Escolher Logcat…**: lê o arquivo no seu navegador, em UTF-8 ou UTF-16.
- **Busca**: filtra por nome do evento, parâmetro ou valor.
- **Detalhe**: o JSON dos parâmetros e a linha original do log, com **Copiar JSON**.
- **Baixar TSV**: as mesmas colunas do Analytics do Mo baile, para colar numa planilha.
- **Baixar JSON**: os eventos em JSON.

## Problemas comuns

- **Nenhum evento aparece.** Ligue o log do Firebase antes de usar o app e salve o logcat depois. O `-d` grava o que já está no aparelho e termina.
- **O começo do fluxo sumiu.** O logcat guarda pouco. Limpe com `adb logcat -c`, refaça o fluxo e salve de novo.
- **O app é iOS.** Nesta versão, Analytics lê só logcat do Android. Para iOS, use o Mo baile para macOS ou audite no Relatório o JSON exportado por ele.
