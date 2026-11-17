---
area: report
titulo: Relatório
resumo: Audite um log de eventos contra a spec de tagueamento, parâmetro por parâmetro.
precisa: a spec da demanda (JSON) e um log de eventos
---

## O que é

O Relatório compara os eventos de um log com a spec de tagueamento (os cards do Figma) e mostra o que bate, o que diverge e o que não disparou.

> Dica: a spec é o JSON exportado ou editado no Mo baile. O log pode ser um logcat salvo, o JSON do Firebase ou o JSON exportado pelo Analytics do Mo baile.

## Quando usar

- Para validar o tagueamento de uma tela antes de liberar.
- Para conferir um log que alguém do time salvou.
- Para gerar um relatório pronto para o time.

## Passo a passo

1. Clique em **Escolher Spec…** ou arraste a spec para o quadro **Spec da demanda**.
2. Clique em **Escolher Log…** ou arraste o log para o quadro **Log de eventos**.
3. Em **Plataforma**, deixe **A da Spec** ou escolha Android ou iOS.
4. Clique em **Auditar**.
5. Filtre por **Divergentes** ou **Não Disparadas** e clique no evento para comparar Obtido × Esperado.
6. Exporte com **Baixar HTML**, **Baixar Markdown** ou **Baixar TSV**, ou clique em **Copiar Resumo**.

## Exemplo prático

Você precisa auditar o carrinho do DemoApp. Arraste a `spec.json` e o `log.txt` salvo com `adb logcat -d > log.txt`, deixe a plataforma como **A da Spec** e clique em **Auditar**. O resumo mostra 2 divergentes. Filtre por **Divergentes**, clique no `add_to_cart` e veja que o `screen_name` veio com o nome de outra tela. Clique em **Baixar HTML** e anexe o relatório no card do bug.

## Recursos

- **Resumo**: validações, OK, divergentes, não disparadas, conformidade em %, eventos fora da spec e alertas.
- **Filtros e busca**: Todas, Pedem Ação, Divergentes, Não Disparadas e OK, e a busca por evento, parâmetro ou divergência.
- **Detalhe**: Obtido × Esperado de cada parâmetro e o bloco do disparo, com **Copiar Bloco**.
- **Fora da spec e alertas**: eventos dos fluxos da spec que nenhum card cobre, e `app_exception` ou `error_view` nas telas da spec.
- **Ver HTML**: mostra aqui mesmo o relatório que você vai baixar.
- **Exportar**: HTML (abre em qualquer navegador), Markdown e TSV (para colar numa planilha).

## Problemas comuns

- **Tudo aparece como Não Disparado.** Confira a **Plataforma**: ela precisa ser a do log.
- **A spec não abre.** O arquivo precisa ser o JSON da spec do Mo baile. A mensagem embaixo do quadro diz o que está errado.
- **O log salvo no Windows não abre.** O site lê UTF-8 e UTF-16, que é o que o `>` do PowerShell grava. Se ainda falhar, relate o problema com um log fictício.
- **Ainda não tenho a spec, só os prints.** Clique em **Importar Prints do Figma…** no quadro da spec. O guia Importar Prints do Figma explica como.
