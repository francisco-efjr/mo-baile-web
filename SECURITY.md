# Segurança

O Mo baile Web é um site estático: o motor roda no seu navegador e nenhum
arquivo que você escolhe sai do seu computador. A página não faz chamada de
rede (`connect-src 'none'` na CSP) e não usa CDN, cookies nem telemetria.

## Como relatar uma falha de segurança

Não abra issue pública. Use o relato privado do GitHub:
[Security › Report a vulnerability](https://github.com/francisco-efjr/mo-baile-web/security/advisories/new).
Descreva o que acontece, como reproduzir e o impacto. Use dados fictícios.

O que conta como falha: arquivo enviado para fora do navegador, execução de
script vindo de uma spec ou de um log (XSS), relatório HTML exportado que
executa conteúdo do log, ou dependência com vulnerabilidade conhecida.
