---
area: relatar-problema
titulo: Relatar um Problema
resumo: Abra um relato no GitHub com o que aconteceu, sem expor dados sensíveis.
precisa: conta gratuita no GitHub
---

## O que é

Um relato avisa sobre um erro ou uma sugestão. O link **Relatar um Problema**, no topo do site, abre o formulário de relato do repositório no GitHub, já com a aba em que você estava.

> Atenção: o relato é público no GitHub. Qualquer pessoa pode ler o que você enviar.

## Quando usar

- Quando algo falhar ou se comportar de forma estranha.
- Quando um arquivo que o Mo baile lê não abrir aqui.
- Quando a Ajuda não resolver o seu caso.

## Passo a passo

1. Clique em **Relatar um Problema**, no topo do site. O GitHub abre numa nova aba.
2. Entre na sua conta do GitHub, se ainda não entrou.
3. Conte o que aconteceu, o que você fez e o que esperava.
4. Informe o navegador e o sistema, por exemplo Chrome no Windows 11.
5. Se puder, arraste uma spec e um log fictícios para o campo **Anexos** e publique.

## Exemplo prático

Ao clicar em **Auditar** com um log salvo no Windows, aparece um erro que você não entende. Clique em **Relatar um Problema**: o campo da área já vem com Relatório. Escreva "Auditar falha com log salvo no PowerShell", diga que esperava ver o resumo e anexe um log com dados fictícios do DemoApp. Publique a issue.

## Recursos

- **Formulário do GitHub**: pede o que aconteceu, o que você fez, o que esperava, a área, o navegador e os anexos.
- **Área**: vem preenchida com a aba em que você estava.
- **Sem o site**: abra a [lista de modelos de relato](https://github.com/francisco-efjr/mo-baile-web/issues/new/choose) no GitHub.
- **Falha de segurança**: não abra issue pública. Use o relato privado descrito no `SECURITY.md` do repositório.

## Problemas comuns

- **Não consigo publicar a issue.** Você precisa de uma conta gratuita no GitHub. Entre nela e tente de novo.
- **Quase incluí um dado sensível.** Nunca inclua senhas, tokens, CPF, e-mails, dados de clientes ou logs de produção. Troque por valores fictícios antes de publicar.
- **O site não guardou o que eu escolhi.** É esperado: o site não envia nem guarda seus arquivos. Anexe você mesmo um exemplo fictício.
