# Revisão de segurança da 0.1.0

Revisor: `security-appsec:security-reviewer`, só leitura, sobre a `main` antes
da primeira publicação. **Veredito: publicar.** Nenhum achado alto ou médio.

| # | Sev. | Onde | Achado | O que foi feito |
|---|---|---|---|---|
| S1 | Baixa | `src/engine/pyre.ts` | Regex da spec (`re:`) sem limite de passos: uma spec feita para isso trava a aba | Registrado em `SECURITY.md`. Motor num Worker com prazo fica para depois |
| S2 | Baixa | `src/ui/site.ts` (`rota`) | `decodeURIComponent` sem `try`: endereço com `%` malformado não montava a aba | `try`/`catch`, cai no Relatório |
| S3 | Baixa | `src/ui/motor.ts` | Teto de leitura de 200 MB podia esgotar a memória da aba | Usa o teto do motor (`MAX_LOG_BYTES`, 64 MB, o mesmo do Mo baile) |
| S4 | Baixa | `ci.yml`, `pages.yml` | `npm install` no lugar de `npm ci` | `--ignore-scripts`; o lockfile tem `integrity` em todos os pacotes |

Conferido e sem achado: XSS na interface (só nós de DOM, sem `innerHTML`),
escape do relatório exportado, CSP do site e do relatório, iframe `sandbox`
sem `allow-same-origin`, nenhuma chamada de rede, `localStorage` só com o
tema, dependências e ações fixadas, permissões mínimas nas workflows,
privacidade do corpus e do gabarito, link de relato (vai só a área).
