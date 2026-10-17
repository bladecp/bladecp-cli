<p align="center">
  <picture>
    <source media="(max-width: 600px)" srcset="https://raw.githubusercontent.com/bladecp/bladecp-cli/main/assets/hero-compact.pt-BR.svg">
    <img src="https://raw.githubusercontent.com/bladecp/bladecp-cli/main/assets/hero.pt-BR.svg" alt="BladeCP CLI. Linha de comando oficial: a BladeCP no seu terminal. Entre, liste seus servidores e migre backups do cPanel, com login pelo navegador, migração retomável e saída JSON estável para scripts e agentes de IA." width="100%">
  </picture>
</p>

<p align="center">
  <strong>Entre, liste seus servidores e migre backups do cPanel para a BladeCP pelo terminal.</strong><br>
  A linha de comando oficial e open source da Customer API da BladeCP, feita para pessoas, scripts e agentes de IA.
</p>

<p align="center">
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/vers%C3%A3o-0.1.0-4f46e5?style=flat-square&amp;labelColor=1e1b4b" alt="Versão 0.1.0"></a>
  <a href="https://www.npmjs.com/package/@bladecp/cli"><img src="https://img.shields.io/badge/npm-%40bladecp%2Fcli-6366f1?style=flat-square&amp;labelColor=1e1b4b&amp;logo=npm&amp;logoColor=white" alt="Pacote npm @bladecp/cli"></a>
  <a href="#instalacao"><img src="https://img.shields.io/badge/Node.js-20%2B-4f46e5?style=flat-square&amp;labelColor=1e1b4b&amp;logo=nodedotjs&amp;logoColor=white" alt="Node.js 20 ou superior"></a>
  <a href="#primeiros-passos"><img src="https://img.shields.io/badge/idiomas-EN%20%C2%B7%20PT--BR%20%C2%B7%20ES-7c3aed?style=flat-square&amp;labelColor=1e1b4b" alt="Inglês, português (Brasil) e espanhol"></a><br>
  <a href="#qualidade"><img src="https://img.shields.io/badge/testes-152%20aprovados-8b5cf6?style=flat-square&amp;labelColor=1e1b4b" alt="152 testes automatizados aprovados na versão 0.1.0"></a>
  <a href="#qualidade"><img src="https://img.shields.io/badge/depend%C3%AAncias%20de%20runtime-0-6d28d9?style=flat-square&amp;labelColor=1e1b4b" alt="Sem dependências de runtime"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licen%C3%A7a-MIT-4338ca?style=flat-square&amp;labelColor=1e1b4b" alt="Licença MIT"></a>
  <a href="https://github.com/bladecp/bladecp-cli/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/bladecp/bladecp-cli/ci.yml?branch=main&amp;style=flat-square&amp;labelColor=1e1b4b&amp;label=CI%20p%C3%BAblico" alt="Estado do CI público"></a>
</p>

<p align="center">
  <code>npm install -g @bladecp/cli</code>
  <br>
  <a href="https://www.npmjs.com/package/@bladecp/cli"><strong>Instalar pelo npm</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/bladecp/bladecp-cli/releases/tag/v0.1.0">Notas da versão</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/bladecp/bladecp-cli/releases/download/v0.1.0/SHA256SUMS">Checksum SHA-256</a>
</p>

<p align="center">
  <a href="#recursos">Recursos</a> ·
  <a href="#arquitetura">Arquitetura</a> ·
  <a href="#instalacao">Instalação</a> ·
  <a href="#primeiros-passos">Primeiros passos</a> ·
  <a href="#automacao">Automação</a> ·
  <a href="#documentacao">Documentação</a> ·
  <a href="#seguranca">Segurança</a> ·
  <a href="#suporte">Suporte</a>
  <br>
  <sub><a href="README.md">English</a> · <a href="README.es.md">Español</a></sub>
</p>

> [!NOTE]
> **Versão `0.1.0`, a primeira release pública.** Os códigos de saída, o
> envelope `--json` e os códigos de erro são um contrato público: mudar qualquer
> um deles exige uma nova versão major.

A BladeCP CLI é o cliente oficial de terminal da Customer API da BladeCP. Ela
faz o login pelo navegador, lista seus servidores e os destinos disponíveis para
migração, e leva um site para a BladeCP a partir de um backup completo do
cPanel: envia o backup em partes, acompanha a migração e para na prévia,
esperando a sua aprovação.

É um único pacote npm, sem dependências de runtime. No terminal, ela só
pergunta o que não consegue descobrir sozinha. Em scripts, CI e agentes de IA,
ela nunca pergunta e responde em JSON.

<a id="recursos"></a>

## Feita para o terminal

| Login pelo navegador | Migração retomável | Pronta para automação |
| --- | --- | --- |
| `bladecp login` abre o Hub, você autoriza uma vez e a chave fica salva, legível só por você. Uma chave do Hub ou o `BLADECP_API_KEY` também servem. | O backup sobe em partes, três por vez, com novas tentativas. Se parar, rode o mesmo comando de novo: só as partes que faltam são enviadas. | `--json` imprime exatamente um documento, os códigos de saída são estáveis e a CLI nunca pergunta nada sem terminal. |

### Comandos

| Comando | O que faz |
| --- | --- |
| `bladecp login [--token <chave>] [--no-browser]` | Entrar |
| `bladecp logout` | Remover o login salvo |
| `bladecp whoami` | Mostrar a conta e a chave em uso |
| `bladecp servers list` | Listar seus servidores |
| `bladecp servers show <uuid>` | Mostrar um servidor e o uso de recursos |
| `bladecp destinations list [--currency <código>]` | Planos, disco, preços mensais e locais disponíveis para migração |
| `bladecp migrate <backup.tar.gz>` | Enviar um backup do cPanel e migrar o site |
| `bladecp migrations list` | Listar suas migrações |
| `bladecp migrations status <uuid> [--watch]` | Mostrar ou acompanhar uma migração |
| `bladecp migrations review <uuid> --domain <host>` | Confirmar o domínio de uma migração |
| `bladecp migrations approve <uuid>` | Aprovar depois de conferir a prévia |
| `bladecp migrations cancel <uuid> [--reason <texto>]` | Cancelar uma migração |
| `bladecp migrations retry <uuid>` | Tentar de novo uma migração que falhou |

Opções globais: `--json`, `--api-url <url>` (ou `BLADECP_API_URL`, padrão
`https://api.bladecp.com`), `--lang en|pt-BR|es`, `--help`, `--version`. A
[referência de comandos](docs/commands.md), em inglês, traz todas as opções.

### Do que a CLI cuida

- **Menos passos.** No terminal, o `migrate` só pergunta para onde o site vai,
  uma confirmação e, quando o backup precisar, o domínio. Toda pergunta tem uma
  opção equivalente.
- **Destino nunca adivinhado.** Sem terminal, ela nunca escolhe para onde o site
  vai: informe `--plan` e `--location`, ou `--yes` quando sua conta tem
  exatamente um destino.
- **Nunca pergunta duas vezes.** Depois que o domínio de uma migração é
  confirmado, a CLI segue aguardando a BladeCP continuar, sem perguntar de novo.
- **Concluída na aprovação.** A migração conclui quando a prévia é aprovada.
  Apontar o domínio é opcional; a CLI mostra os nameservers da BladeCP e, quando
  a API devolve, o endereço para um registro A.
- **Três idiomas.** Mensagens em inglês, português do Brasil e espanhol, a partir
  de `LC_ALL`, `LC_MESSAGES` ou `LANG`, ou escolhidas com `--lang`.

## Arquitetura

A CLI separa o que acontece no seu computador, o que ela guarda ali e o que vai
para a BladeCP. A chave só é enviada para o endereço da API em uso, por HTTPS, e
as partes do backup vão direto ao armazenamento por URLs pré-assinadas.

<p align="center">
  <picture>
    <source media="(max-width: 600px)" srcset="https://raw.githubusercontent.com/bladecp/bladecp-cli/main/assets/architecture-compact.pt-BR.svg">
    <img src="https://raw.githubusercontent.com/bladecp/bladecp-cli/main/assets/architecture.pt-BR.svg" alt="Arquitetura da BladeCP CLI. No seu computador ou na CI, o terminal, scripts e agentes de IA rodam os comandos, o navegador responde o login em 127.0.0.1 e o backup do cPanel é lido em partes. A CLI guarda o login num config.json privado, mostra a saída escapada e com a chave oculta, e o cliente da API chama a Customer API em api.bladecp.com por HTTPS. O envio retomável manda as partes do backup direto ao armazenamento por URLs pré-assinadas e registra o progresso localmente, e a CLI acompanha a migração até a prévia e a aprovação." width="100%">
  </picture>
</p>

<p align="center"><sub>Visão lógica da CLI. <a href="assets/architecture.pt-BR.svg">Abrir o diagrama em tamanho real</a>.</sub></p>

### Do backup ao site aprovado

1. **Conferência local.** O `bladecp migrate` confere o arquivo: um arquivo
   comum, não vazio, de até 50 GB, que começa com a assinatura gzip de um backup
   `.tar.gz`.
2. **Destino.** A migração é criada no plano e no local escolhidos, de
   `bladecp destinations list`.
3. **Envio retomável.** O cliente da API pede à Customer API as URLs
   pré-assinadas, e cada parte vai direto ao armazenamento, três por vez. Uma
   parte que falha é tentada de novo com espera crescente. O progresso fica
   salvo localmente, nunca a chave.
4. **Acompanhamento.** A BladeCP confirma o backup e a CLI acompanha cada etapa.
   Se o domínio precisar de confirmação, ela pergunta uma vez; Enter aceita o
   domínio encontrado no backup.
5. **Prévia e aprovação.** Quando o site fica pronto, a CLI mostra o endereço da
   prévia e o comando para aprovar, e termina com código de saída `0`. Depois da
   aprovação, a migração está concluída.

| Camada | Responsabilidade |
| --- | --- |
| **Comandos** | Argumentos, perguntas só no terminal, idioma |
| **Saída** | Texto ou o envelope `--json`; texto externo escapado, chave oculta |
| **Login** | Navegador (PKCE S256, resposta em `127.0.0.1`), `--token` ou `BLADECP_API_KEY`, salvo num `config.json` privado |
| **Cliente da API** | HTTPS com a chave Bearer, `429` com `Retry-After`, novas tentativas |
| **Envio** | Partes do plano de envio da BladeCP, transmitidas com tamanho explícito, retomadas do progresso local |
| **Estado local** | A pasta da CLI: o login salvo e o progresso dos envios interrompidos |

<a id="instalacao"></a>

## Instalação rápida

Você precisa do Node.js 20 ou mais recente, no macOS, Linux ou Windows, e de
acesso HTTPS de saída a `api.bladecp.com` (e a `hub.bladecp.com` no navegador,
para o login).

```sh
npm install -g @bladecp/cli
bladecp --version
```

Ou rode sem instalar:

```sh
npx @bladecp/cli login
```

### Conferir um download da release

Toda [release no GitHub](https://github.com/bladecp/bladecp-cli/releases) traz o
tarball do pacote npm, o checksum e as notas da versão. O tarball é o mesmo
arquivo publicado no npm.

| Arquivo | Para que serve |
| --- | --- |
| [**bladecp-cli-0.1.0.tgz**](https://github.com/bladecp/bladecp-cli/releases/download/v0.1.0/bladecp-cli-0.1.0.tgz) | O pacote npm: `dist/`, READMEs, changelog, licença e `package.json` |
| [**SHA256SUMS**](https://github.com/bladecp/bladecp-cli/releases/download/v0.1.0/SHA256SUMS) | Checksum para conferir o tarball |
| [**RELEASE_NOTES.md**](https://github.com/bladecp/bladecp-cli/releases/download/v0.1.0/RELEASE_NOTES.md) | Notas desta versão |

```sh
shasum -a 256 -c SHA256SUMS          # no Linux: sha256sum -c SHA256SUMS
npm install -g ./bladecp-cli-0.1.0.tgz
```

### Atualizar e desinstalar

```sh
npm install -g @bladecp/cli@latest   # mantém seu login e o progresso dos envios
bladecp logout                       # remove a chave salva deste computador
npm uninstall -g @bladecp/cli
```

O `bladecp logout` não revoga a chave: revogue em
[Chaves de API](https://hub.bladecp.com/account/api-keys). O
[guia de instalação](docs/installation.md), em inglês, traz os detalhes.

## Primeiros passos

```sh
bladecp login                        # abre o navegador, um clique para autorizar
bladecp whoami                       # a conta e a chave em uso
bladecp servers list                 # seus servidores
bladecp destinations list            # planos e locais para migração
bladecp migrate cpmove-user.tar.gz   # envia, acompanha a migração e mostra a prévia
bladecp migrations approve <uuid>    # depois de conferir a prévia
```

### Login

| Forma | Quando usar |
| --- | --- |
| `bladecp login` | No seu computador. Abre o Hub no navegador; você autoriza a BladeCP CLI e o terminal recebe uma chave válida por 30 dias. |
| `bladecp login --no-browser` | O navegador não abriu. O endereço é mostrado para você abrir no mesmo computador. |
| `bladecp login --token <chave>` | Você já tem uma chave de API do Hub ([Chaves de API](https://hub.bladecp.com/account/api-keys)). Use `--token -` para ler da entrada padrão e não deixar a chave no histórico do shell. |
| `BLADECP_API_KEY=<chave>` | Scripts, CI e servidores remotos. Nada é salvo; todo comando usa a variável. |

A chave fica salva em `~/.config/bladecp/config.json` (macOS e Linux) ou
`%APPDATA%\bladecp\config.json` (Windows), legível só por você. A CLI nunca
mostra a chave. Veja [autenticação](docs/authentication.md), em inglês.

### Migrar um backup do cPanel

Use o backup completo gerado pelo cPanel, por exemplo `cpmove-user.tar.gz`, de
até 50 GB.

| Opção | Efeito |
| --- | --- |
| `--plan <id> --location <id>` | Destino, de `bladecp destinations list` |
| `--domain <host>` | Domínio que o site migrado vai usar |
| `--yes` | Sem confirmação; aceita o domínio encontrado no backup e, quando sua conta tem exatamente um destino, esse destino |
| `--no-wait` | Para quando o backup for recebido |

**O envio parou?** Rode o mesmo comando de novo. A CLI lembra a migração daquele
arquivo e envia só as partes que faltam. Se o backup já foi recebido, ela apenas
continua acompanhando a migração.

Ctrl+C durante o acompanhamento só para de acompanhar; a migração continua.
Confira depois com `bladecp migrations status <uuid> --watch`.

<a id="automacao"></a>

## Automação e JSON

Com `--json`, todo comando imprime exatamente um documento JSON na saída padrão,
sem cores, progresso ou perguntas:

```json
{ "ok": true, "data": { "migrationUuid": "…", "phase": "awaiting_approval", "previewUrl": "https://…", "nextAction": { "type": "approve", "command": "bladecp migrations approve …" } } }
```

Os erros usam o mesmo envelope. `code` é estável; `message` segue o idioma
escolhido:

```json
{ "ok": false, "error": { "code": "not_found", "message": "…", "exitCode": 5, "status": 404 } }
```

Uma migração sem nenhuma pergunta:

```sh
BLADECP_API_KEY=… bladecp migrate site.tar.gz --plan 12 --location 3 --domain example.com --json
```

`migrations status --watch --json` imprime uma linha JSON por mudança e termina
com código de saída `0` quando a migração está concluída. Os comandos de leitura
devolvem os objetos da API sem alteração em `data`. O
[guia de automação](docs/automation.md), em inglês, descreve cada campo e traz
um exemplo com GitHub Actions.

| Código | Significado |
| --- | --- |
| 0 | Sucesso (no `migrate`, o site está pronto para revisão) |
| 1 | Erro inesperado |
| 2 | Uso ou entrada inválida (opção, arquivo, destino ausente sem terminal) |
| 3 | Sem login, chave não aceita ou falha no login |
| 4 | Sem permissão |
| 5 | Não encontrado |
| 6 | Recusado pela API (por exemplo, ação indisponível na etapa atual) |
| 7 | Limite de requisições |
| 8 | Erro de rede ou do servidor, ou falha no envio |
| 9 | Migração com falha ou cancelada |
| 10 | Aguardando uma ação sua (por exemplo, confirmar o domínio) |
| 130 | Interrompido |

| Variável | Para que serve |
| --- | --- |
| `BLADECP_API_KEY` | Chave de API usada no lugar do login salvo |
| `BLADECP_API_URL` | Endereço da API (o mesmo que `--api-url`) |
| `BLADECP_CONFIG_DIR` | Pasta do login salvo e do progresso dos envios |
| `NO_COLOR` | Desliga as cores |

O [`reference.json`](reference.json) lista cada comando, opção, alias, código de
saída e código de erro, com as mensagens nos três idiomas, para ferramentas que
não devem interpretar o texto de ajuda.

<a id="documentacao"></a>

## Documentação

Os guias estão em inglês.

| Guia | O que você encontra |
| --- | --- |
| [Instalação](docs/installation.md) | Requisitos, npm, checksum, atualização, desinstalação e build a partir do código |
| [Autenticação](docs/authentication.md) | Login pelo navegador, chaves, onde a chave fica e erros de login |
| [Comandos](docs/commands.md) | Cada comando, opção, código de saída e variável de ambiente |
| [Automação e JSON](docs/automation.md) | Uso sem terminal, o envelope JSON, novas tentativas e CI |
| [Solução de problemas](docs/troubleshooting.md) | Instalação, login, migração e rede |
| [Processo de release](docs/release-process.md) | Como as releases públicas são preparadas e verificadas |
| [Governança do repositório](docs/repository-governance.md) | Issues, pull requests, histórico e releases |
| [Changelog](CHANGELOG.md) | Mudanças de cada versão pública |
| [Política de segurança](SECURITY.md) | Relato privado de vulnerabilidades |
| [Como contribuir](CONTRIBUTING.md) | Como propor e validar uma mudança |

O guia para desenvolvedores em
[developers.bladecp.com/pt-BR/cli](https://developers.bladecp.com/pt-BR/cli)
mostra a CLI junto com a Customer API, em português.

<a id="seguranca"></a>

## Segurança

- **A chave fica protegida.** Ela só é enviada para o endereço da API em uso,
  por HTTPS; HTTP sem criptografia só em `localhost`. Ela nunca aparece na saída,
  nos erros nem nos arquivos de progresso de envio, e o login salvo é legível só
  por você.
- **Login pelo navegador seguro.** Um código de uso único com PKCE (S256) e um
  `state` aleatório, recebidos em `127.0.0.1`. Uma resposta que este terminal não
  iniciou é ignorada.
- **Um terminal que não pode ser sequestrado.** Textos recebidos da API, da rede
  ou de nomes de arquivo aparecem com os caracteres de controle escapados, então
  não conseguem alterar sua tela, links, título ou área de transferência.
- **Nada a mais para confiar.** Sem dependências de runtime: `fetch`,
  `util.parseArgs`, `http(s)` e `readline` nativos. Cada release publica o
  tarball verificado e o checksum SHA-256.
- **O logout é local.** O `bladecp logout` remove a chave do computador. Revogue
  uma chave que você não usa mais em
  [Chaves de API](https://hub.bladecp.com/account/api-keys).

Para relatar uma vulnerabilidade em privado, siga o [SECURITY.md](SECURITY.md).
Nunca inclua uma chave de API numa issue pública.

<a id="qualidade"></a>

## Qualidade e validação

A versão `0.1.0` foi validada pelos mantenedores com **152 testes
automatizados** em 10 arquivos, rodados com Vitest contra uma Customer API
simulada (`test/helpers/mock-api.ts`), nunca uma real. Eles cobrem todos os
comandos, a migração e suas etapas, o login pelo navegador e o retorno local, o
login salvo, os três catálogos de mensagens, o envio em partes, sequências
hostis de terminal, os snapshots do `--json`, o `reference.json` e a ocultação da
chave em todos os comandos. O selo de testes representa essa execução.

Antes de uma release, o pacote é montado a partir da árvore pública curada, a
árvore e o tarball passam por uma varredura de credenciais e referências não
públicas, e o próprio tarball é instalado num prefixo descartável para rodar
`bladecp --version` e `bladecp --help`.

O [CI público](https://github.com/bladecp/bladecp-cli/actions/workflows/ci.yml)
roda lint, checagem de tipos, testes, build, a conferência do `reference.json` e
o portão da árvore pública (`scripts/check-public-tree.sh --package`) no Node.js
24, e o build e os testes no Node.js 20.

<a id="desenvolvimento"></a>

## Desenvolvimento e contribuição

O desenvolvimento usa o Node.js 24 (veja o `.nvmrc`) e a versão do pnpm indicada
no campo `packageManager` do `package.json`.

```sh
git clone https://github.com/bladecp/bladecp-cli.git
cd bladecp-cli
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test
pnpm build && node dist/bin.js --help
bash scripts/check-public-tree.sh --package
```

```text
src/
  bin.ts, cli.ts   Entrada, leitura dos argumentos, despacho e relatório de erro
  commands/        account, servers, migrate, migrations e follow
  auth/            Credenciais, PKCE e o retorno em 127.0.0.1
  upload/          Plano de partes, PUT em stream, estado local e envio
  i18n/            Inglês (base), português (Brasil) e espanhol
  output.ts        Toda a saída: escape, ocultação da chave, cores e --json
test/              Suíte Vitest com uma Customer API simulada
scripts/           Auxiliares de build e o portão da árvore pública
docs/              Guias
assets/            Arte do README
reference.json     Referência para máquinas
```

Contribuições são bem-vindas. Leia o [CONTRIBUTING.md](CONTRIBUTING.md) antes de
abrir uma issue ou um pull request: toda mensagem existe nos três idiomas, texto
externo nunca chega cru ao terminal, a chave nunca chega à saída, e uma mudança
de comando ou mensagem gera de novo o `reference.json`. Contribuições aprovadas
seguem o fluxo de manutenção do projeto antes de entrar numa release pública
seguinte.

<a id="perguntas"></a>

## Perguntas frequentes

<details>
<summary><strong>Preciso de algo além do Node.js?</strong></summary>

Não. O pacote não tem dependências de runtime. Basta o Node.js 20 ou mais
recente, no macOS, Linux ou Windows.

</details>

<details>
<summary><strong>Dá para entrar num servidor remoto por SSH?</strong></summary>

Sim, com uma chave. O login pelo navegador responde em `127.0.0.1` do computador
que roda a CLI; num servidor remoto, crie uma chave em
[Chaves de API](https://hub.bladecp.com/account/api-keys) e use
`bladecp login --token -` ou `BLADECP_API_KEY`.

</details>

<details>
<summary><strong>O envio parou. Preciso começar de novo?</strong></summary>

Não. Rode o mesmo `bladecp migrate` com o mesmo arquivo. A CLI envia só as
partes que faltam, ou continua acompanhando a migração se o backup já foi
recebido.

</details>

<details>
<summary><strong>Apontar o domínio segura a migração?</strong></summary>

Não. A migração conclui quando a prévia é aprovada. Apontar o domínio é opcional
e pode esperar o quanto você quiser; enquanto isso, o site antigo continua no
ar.

</details>

<details>
<summary><strong>É seguro usar em scripts e agentes de IA?</strong></summary>

Sim. Com `--json` não há perguntas nem cores, e sai exatamente um documento
JSON. Sem terminal a CLI nunca escolhe o destino, e os códigos de saída e de
erro são estáveis.

</details>

<details>
<summary><strong>"Sua chave de API não foi aceita" ou "expirou". E agora?</strong></summary>

Rode `bladecp login` de novo, ou crie uma nova chave em
[Chaves de API](https://hub.bladecp.com/account/api-keys). O
[guia de solução de problemas](docs/troubleshooting.md), em inglês, cobre os
códigos de erro mais comuns.

</details>

## Suporte

| Assunto | Canal |
| --- | --- |
| Bug reproduzível ou pedido de produto | [GitHub Issues](https://github.com/bladecp/bladecp-cli/issues) |
| Suporte técnico e de produto | [dev@bladecp.com](mailto:dev@bladecp.com) |
| Vulnerabilidade | [Política de segurança](SECURITY.md) |
| Guias | [developers.bladecp.com/pt-BR/cli](https://developers.bladecp.com/pt-BR/cli) |

Em relatos públicos, informe a versão da CLI, a versão do Node.js, o sistema
operacional, o comando e o `code` do erro. Nunca inclua uma chave de API.

## Licença

A BladeCP CLI é distribuída sob a [Licença MIT](LICENSE). A licença da CLI não
substitui os termos dos serviços da BladeCP.

<p align="center"><strong>BladeCP. Seus sites a um comando de distância.</strong></p>
