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
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/vers%C3%A3o-0.3.2-4f46e5?style=flat-square&amp;labelColor=1e1b4b" alt="Versão 0.3.2"></a>
  <a href="https://www.npmjs.com/package/@bladecp/cli"><img src="https://img.shields.io/badge/npm-%40bladecp%2Fcli-6366f1?style=flat-square&amp;labelColor=1e1b4b&amp;logo=npm&amp;logoColor=white" alt="Pacote npm @bladecp/cli"></a>
  <a href="#instalacao"><img src="https://img.shields.io/badge/Node.js-20%2B-4f46e5?style=flat-square&amp;labelColor=1e1b4b&amp;logo=nodedotjs&amp;logoColor=white" alt="Node.js 20 ou superior"></a>
  <a href="#primeiros-passos"><img src="https://img.shields.io/badge/idiomas-EN%20%C2%B7%20PT--BR%20%C2%B7%20ES-7c3aed?style=flat-square&amp;labelColor=1e1b4b" alt="Inglês, português (Brasil) e espanhol"></a><br>
  <a href="#qualidade"><img src="https://img.shields.io/badge/testes-1148%20aprovados-8b5cf6?style=flat-square&amp;labelColor=1e1b4b" alt="1148 testes automatizados aprovados na versão 0.3.2"></a>
  <a href="#qualidade"><img src="https://img.shields.io/badge/depend%C3%AAncias%20de%20runtime-0-6d28d9?style=flat-square&amp;labelColor=1e1b4b" alt="Sem dependências de runtime"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licen%C3%A7a-MIT-4338ca?style=flat-square&amp;labelColor=1e1b4b" alt="Licença MIT"></a>
  <a href="https://github.com/bladecp/bladecp-cli/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/bladecp/bladecp-cli/ci.yml?branch=main&amp;style=flat-square&amp;labelColor=1e1b4b&amp;label=CI%20p%C3%BAblico" alt="Estado do CI público"></a>
</p>

<p align="center">
  <code>npm install -g @bladecp/cli</code>
  <br>
  <a href="https://www.npmjs.com/package/@bladecp/cli"><strong>Instalar pelo npm</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/bladecp/bladecp-cli/releases/tag/v0.3.2">Notas da versão</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/bladecp/bladecp-cli/releases/download/v0.3.2/SHA256SUMS">Checksum SHA-256</a>
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
> **Versão `0.4.0`.** A CLI agora alcança toda a Customer API: domínios, apps,
> WordPress e componentes dos seus servidores, `bladecp api` para qualquer
> rota e as ferramentas de parceiro (catálogo, servidores dos clientes, contas
> do Vibe, marketplace, webhooks e migrações do Fast Deploy). Os códigos de
> saída, o envelope `--json` e os códigos de erro são um contrato público:
> esta versão só acrescenta.

A BladeCP CLI é o cliente oficial de terminal da Customer API da BladeCP. Ela
faz o login pelo navegador, lista seus servidores e os destinos disponíveis para
migração, e leva um site para a BladeCP a partir de um backup completo do
cPanel: envia o backup em partes, acompanha a migração e para na prévia,
esperando a sua aprovação.

Ela também alcança o resto da Customer API: os domínios, apps, WordPress e
componentes dos seus servidores, qualquer rota pelo `bladecp api` e, com uma
chave de parceiro, as ferramentas que os parceiros da BladeCP usam para operar
os serviços dos clientes.

Antes de migrar, `bladecp analyze` lê o backup no seu computador e mostra o
que ele tem, o que vem para a BladeCP, o que fica e o menor plano necessário.
Nada é enviado.

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
| `bladecp` | No terminal: boas-vindas com o que precisa de você agora |
| `bladecp servers list [--all]` | Listar seus servidores (`--all` mostra também os apagados) |
| `bladecp servers show <uuid>` | Mostrar um servidor e o uso de recursos |
| `bladecp destinations list [--currency <código>]` | Planos, disco, preços mensais e locais disponíveis para migração |
| `bladecp analyze <backup.tar.gz> [--prices]` | Ver o que um backup do cPanel tem e o que vem para a BladeCP, sem internet |
| `bladecp migrate <backup.tar.gz>` | Enviar um backup do cPanel e migrar o site |
| `bladecp migrations list` | Listar suas migrações |
| `bladecp migrations status <uuid> [--watch]` | Mostrar ou acompanhar uma migração |
| `bladecp migrations review <uuid> --domain <host>` | Confirmar o domínio de uma migração |
| `bladecp migrations approve <uuid> [--yes]` | Aprovar depois de conferir a prévia |
| `bladecp migrations cancel <uuid> [--reason <texto>] [--yes]` | Cancelar uma migração |
| `bladecp migrations retry <uuid>` | Tentar de novo uma migração que falhou |
| `bladecp update [--check] [--yes]` | Ver o que mudou e atualizar a CLI |
| `bladecp config list` / `get <chave>` / `set <chave> <valor>` | Preferências: `auto-update`, `update-check`, `lang` |

#### Sites

| Comando | O que faz |
| --- | --- |
| `bladecp domains list <server>` | Listar os domínios de um servidor |
| `bladecp domains add <server> <host>` | Adicionar um domínio a um servidor |
| `bladecp domains remove <server> <host> [--yes]` | Remover um domínio de um servidor |
| `bladecp domains check <host>` | Ver se um domínio pode ser usado na BladeCP |
| `bladecp apps list` | Listar os apps que a BladeCP instala para você |
| `bladecp apps show <app>` | Mostrar um app e as configurações que ele pede |
| `bladecp apps install <server> <app> [--domain <host>] [--app-version <version>] [--option <id>=<value>]... [--yes]` | Instalar um app em um domínio de um servidor |
| `bladecp wordpress status <server> [--external-id <id>]` | Ver se as ferramentas do WordPress funcionam em um servidor |
| `bladecp wordpress dashboard <server> [--external-id <id>] [--wait]` | Ver a versão, os plugins e os temas do WordPress de um servidor |
| `bladecp wordpress update core <server> [--external-id <id>] [--wait] [--yes]` | Atualizar o próprio WordPress para a versão mais nova |
| `bladecp wordpress update plugin <server> <plugin> [--external-id <id>] [--wait] [--yes]` | Atualizar um plugin para a versão mais nova |
| `bladecp wordpress update theme <server> <theme> [--external-id <id>] [--wait] [--yes]` | Atualizar um tema para a versão mais nova |
| `bladecp wordpress task <server> <task> [--external-id <id>] [--wait]` | Ver como foi uma tarefa do WordPress |
| `bladecp components list` | Listar os componentes do catálogo da BladeCP |

#### Parceiros (chaves de parceiro)

| Comando | O que faz |
| --- | --- |
| `bladecp partner plans [--currency <code>]` | Listar os planos que você vende, com os preços |
| `bladecp partner locations [--plan <id>]` | Listar onde cada plano pode rodar |
| `bladecp partner options [--plan <id>] [--currency <code>]` | Listar as opções configuráveis e os valores delas |
| `bladecp partner branding` | Mostrar o nome, o logo e o favicon da sua marca |
| `bladecp partner servers list [--status <status>] [--domain <host>] [--external-id <id>] [--page <n>] [--limit <n>]` | Listar os servidores dos seus clientes, com filtros |
| `bladecp partner servers create --plan <id> --location <id> --domain <host> --email <email> --name <name> [--external-id <id>] [--option <id>=<value>]... [--component <slug>]... [--contract <months>] [--yes]` | Criar um servidor para um cliente |
| `bladecp partner servers plan <server> <plan> [--yes]` | Mudar o plano de um servidor |
| `bladecp partner servers options <server> --option <id>=<value>... [--yes]` | Substituir as opções configuráveis de um servidor |
| `bladecp partner servers suspend <server> [--yes]` | Suspender um servidor (nada é apagado) |
| `bladecp partner servers unsuspend <server> [--yes]` | Reativar um servidor suspenso |
| `bladecp partner servers cancel <server> [--now] [--reason <text>] [--reason-category <category>] [--yes]` | Cancelar um servidor agora ou no fim do ciclo |
| `bladecp partner servers delete <server> [--yes]` | Apagar um servidor e tudo o que há nele |
| `bladecp partner servers open <server>` | Abrir o painel do cliente com um link de uso único |
| `bladecp partner vibe find <external-id>` | Encontrar a conta Vibe de um serviço seu |
| `bladecp partner vibe show <account>` | Mostrar uma conta Vibe |
| `bladecp partner vibe create --external-id <id> --plan <id> --email <email> --name <name> [--email-verification <verified|not-required>] [--yes]` | Criar a conta Vibe de um serviço |
| `bladecp partner vibe plan <account> <plan> [--yes]` | Mudar o plano de uma conta Vibe |
| `bladecp partner vibe suspend <account> [--yes]` | Suspender uma conta Vibe |
| `bladecp partner vibe reactivate <account> [--yes]` | Reativar uma conta Vibe suspensa |
| `bladecp partner vibe resume <account> [--yes]` | Colocar uma conta Vibe no ar de novo após inatividade |
| `bladecp partner vibe terminate <account> [--yes]` | Encerrar uma conta Vibe de vez |
| `bladecp partner vibe open <account> [--no-browser]` | Entrar no Vibe como dono da conta, com um link de uso único |
| `bladecp partner marketplace summary` | Mostrar os ganhos por moeda e quanto do servidor-base eles já cobrem |
| `bladecp partner marketplace orders [--status <status>] [--page <n>] [--limit <n>]` | Listar as vendas que a BladeCP fez dos seus planos |
| `bladecp partner marketplace commissions [--status <status>] [--page <n>] [--limit <n>]` | Listar cada fatura paga: a venda, a comissão da BladeCP e o que você recebe |
| `bladecp partner marketplace statements` | Listar os extratos mensais: seus ganhos compensados com o servidor-base |
| `bladecp partner marketplace statement <statement>` | Mostrar um extrato e as linhas de comissão dele |
| `bladecp partner marketplace invoices` | Listar as faturas em aberto do seu servidor-base |
| `bladecp partner webhooks list` | Listar seus endpoints de webhook |
| `bladecp partner webhooks show <endpoint>` | Mostrar um endpoint: endereço, eventos e status |
| `bladecp partner webhooks create --url <url> --event <type>... [--name <name>]` | Adicionar um endpoint e receber o segredo de assinatura dele |
| `bladecp partner webhooks update <endpoint> [--url <url>] [--event <type>...] [--name <name>] [--yes]` | Mudar o endereço, os eventos ou o nome de um endpoint |
| `bladecp partner webhooks pause <endpoint> [--yes]` | Parar de enviar eventos a um endpoint por enquanto |
| `bladecp partner webhooks resume <endpoint> [--yes]` | Voltar a enviar eventos a um endpoint pausado |
| `bladecp partner webhooks delete <endpoint> [--yes]` | Excluir um endpoint |
| `bladecp partner webhooks rotate-secret <endpoint> [--yes]` | Trocar o segredo de assinatura de um endpoint |
| `bladecp partner webhooks deliveries [--endpoint <id>] [--status <status>] [--page <n>] [--limit <n>]` | Listar o que a BladeCP enviou e o que o seu sistema respondeu |
| `bladecp partner webhooks replay <delivery> [--yes]` | Enviar uma entrega de novo, com o mesmo ID de evento |
| `bladecp partner migrations list --installation <id> [--client <id>] [--limit <n>] [--all]` | Listar as solicitações de Fast Deploy de uma instalação do WHMCS |
| `bladecp partner migrations show <request> --installation <id> --client <id> [--watch]` | Mostrar uma solicitação: etapa, componentes, prévia e cobrança |
| `bladecp partner migrations review <request> --installation <id> --client <id> --domain <host>` | Confirmar o domínio do site encontrado no backup |
| `bladecp partner migrations approve <request> --installation <id> --client <id> [--yes]` | Aprovar a prévia para a BladeCP concluir a migração |
| `bladecp partner migrations cancel <request> --installation <id> --client <id> [--reason <text>] [--yes]` | Cancelar uma solicitação ainda não aprovada |
| `bladecp partner migrations retry <request> --installation <id> --client <id>` | Tentar de novo uma migração que falhou, quando é seguro |
| `bladecp partner migrations billing-queue [--limit <n>] [--all]` | Listar as solicitações que aguardam o WHMCS de cobrança |
| `bladecp partner migrations billing-link <request> --installation <id> --client <id> --external-id <id> --email <email> --name <name> [--company <name>] [--yes]` | Vincular uma solicitação ao cliente e ao serviço no WHMCS de cobrança |
| `bladecp partner migrations claim-url <request> --installation <id> --client <id>` | Obter o endereço onde o titular confirma a conta |

#### Automação

| Comando | O que faz |
| --- | --- |
| `bladecp api <path> [-X <method>] [--data <json> | --input <file>] [--yes]` | Chamar qualquer rota da Customer API com o seu login |
| `bladecp api list` | Listar todas as rotas da API e o comando que cobre cada uma |

Os comandos de parceiro precisam de uma chave com a permissão `partner:read`; com uma chave de cliente, param com `partner_only` (saída 4). Os comandos de WordPress precisam de `--external-id`, o ID do serviço no sistema de cobrança.

Opções globais: `--json`, `--api-url <url>` (ou `BLADECP_API_URL`, padrão
`https://api.bladecp.com`), `--lang en|pt-BR|es`, `--debug` (ou `--verbose`),
`--help`, `--version`. Onde um comando recebe um ID, bastam os primeiros
caracteres (pelo menos 4) quando só um item seu começa com eles. A
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
- **Avisa quando algo demora.** Uma fase que passa do tempo normal aparece na
  tela (e no `--json` como `slowPhase`), com como acompanhar depois e, quando
  passa muito, como falar com o suporte.
- **Cabe na sua janela.** Tabelas, ajuda e progresso se adaptam a 40, 80 ou 120
  colunas; a porcentagem do envio fica sempre visível.
- **Se mantém atualizada.** Uma vez por dia a CLI pergunta ao npm qual é a
  versão mais recente e mostra uma linha discreta no fim de um comando
  interativo. O `bladecp update` mostra o que mudou e atualiza com o
  gerenciador de pacotes que a instalou. Nada mais é enviado.
- **Três idiomas.** Mensagens em inglês, português do Brasil e espanhol, a partir
  de `LC_ALL`, `LC_MESSAGES` ou `LANG`, de `bladecp config set lang`, ou
  escolhidas com `--lang`.

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
| [**bladecp-cli-0.3.2.tgz**](https://github.com/bladecp/bladecp-cli/releases/download/v0.3.2/bladecp-cli-0.3.2.tgz) | O pacote npm: `dist/`, READMEs, changelog, licença e `package.json` |
| [**SHA256SUMS**](https://github.com/bladecp/bladecp-cli/releases/download/v0.3.2/SHA256SUMS) | Checksum para conferir o tarball |
| [**RELEASE_NOTES.md**](https://github.com/bladecp/bladecp-cli/releases/download/v0.3.2/RELEASE_NOTES.md) | Notas desta versão |

```sh
shasum -a 256 -c SHA256SUMS          # no Linux: sha256sum -c SHA256SUMS
npm install -g ./bladecp-cli-0.3.2.tgz
```

### Atualizar e desinstalar

```sh
bladecp update                       # o que mudou, depois atualiza com npm, pnpm, yarn ou bun
bladecp config set auto-update off   # parar de atualizar sozinha antes de um comando
bladecp logout                       # remove a chave salva deste computador
npm uninstall -g @bladecp/cli
```

A verificação diária só pergunta ao registro do npm o número da versão mais
recente. Desligue com `BLADECP_NO_UPDATE_CHECK=1`, `NO_UPDATE_NOTIFIER` ou
`bladecp config set update-check off`.

O `bladecp logout` não revoga a chave: revogue em
[Chaves de API](https://hub.bladecp.com/account/api-keys). O
[guia de instalação](docs/installation.md), em inglês, traz os detalhes.

## Primeiros passos

```sh
bladecp login                        # abre o navegador, um clique para autorizar
bladecp whoami                       # a conta e a chave em uso
bladecp servers list                 # seus servidores
bladecp destinations list            # planos e locais para migração
bladecp analyze cpmove-user.tar.gz   # o que migra e o plano mínimo, sem internet
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

### Analisar um backup antes de migrar

`bladecp analyze` lê um backup completo do cPanel no seu computador, uma vez e
em fluxo, e mostra:

- **o que o backup tem:** a conta, os sites (principal, domínios adicionais e
  subdomínios, com WordPress e a versão do PHP de cada um), os bancos com motor
  e versão, os domínios e as caixas de e-mail, as zonas DNS, as tarefas cron,
  os arquivos e o tamanho;
- **o que vem para a BladeCP e o que fica:** vêm os sites e seus arquivos,
  todos os bancos MySQL e MariaDB, as caixas de e-mail por IMAP e POP3 com o MX
  preservado, a zona DNS completa, as tarefas cron e a versão do PHP de cada
  site; os certificados SSL são emitidos de novo quando o domínio apontar para
  a BladeCP, e a senha do cPanel fica (o acesso à BladeCP é pelo seu e-mail);
- **avisos e recusas:** quando a migração recusaria o backup como está
  (arquivo danificado ou cortado, site que não é WordPress, WordPress
  Multisite ativo, um valor do `wp-config.php` que ela não aceita), diz o
  motivo e o que fazer;
- **o plano mínimo:** disco e bancos, e o comando `bladecp migrate` pronto.

| Opção | Efeito |
| --- | --- |
| `--prices` | Mostra também o plano mais barato da sua conta que cabe, com o preço de agora e o `--plan` e o `--location` para usar. Pede login; envia só a moeda |
| `--currency <código>` | Preços em uma moeda, junto com `--prices` |
| `--json` | O relatório no esquema `bladecp.analyze.v1` |

A análise não pede login nem internet: nada do backup sai do seu computador, e
senhas, chaves e o texto do `wp-config.php` nunca aparecem na tela nem no
relatório. O código de saída `0` quer dizer que o backup migra (talvez com
avisos), e o `6`, que ele não migra como está.

O mesmo analisador é uma biblioteca sem dependências, para Node e navegadores:

```js
import { analyzeFile } from '@bladecp/cli/analyzer/node';

const report = await analyzeFile('cpmove-user.tar.gz');
console.log(report.verdict, report.blockers, report.requirements);
```

`@bladecp/cli/analyzer/web` lê um `File` ou `Blob` (num Web Worker, por
exemplo) com o leitor gzip do próprio analisador, sem depender do
`DecompressionStream` do navegador.

### Migrar um backup do cPanel

Use o backup completo gerado pelo cPanel, por exemplo `cpmove-user.tar.gz`, de
até 50 GB.

| Opção | Efeito |
| --- | --- |
| `--plan <id> --location <id>` | Destino, de `bladecp destinations list` |
| `--domain <host>` | Domínio que o site migrado vai usar |
| `--yes` | Sem confirmação; aceita o domínio encontrado no backup e, quando sua conta tem exatamente um destino, esse destino. Nunca aprova a migração |
| `--no-wait` | Para quando o backup for recebido |

**O envio parou?** Rode o mesmo comando de novo. A CLI lembra a migração daquele
arquivo e envia só as partes que faltam. Se o backup já foi recebido, ela apenas
continua acompanhando a migração.

No terminal, quando a prévia fica pronta, `o` abre a prévia e `a` aprova; `d`
decide depois. Ctrl+C durante o acompanhamento só para de acompanhar; a
migração continua. Confira depois com `bladecp migrations status <uuid> --watch`.

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

`migrations status --watch --json` imprime uma linha JSON por mudança, erros
incluídos, e termina com código de saída `0` quando a migração está concluída.
Os comandos de leitura devolvem os objetos da API sem alteração em `data`; a
CLI só acrescenta campos como `domainPointing` e `slowPhase`. O `--help --json`
devolve a ajuda como um documento. O
[guia de automação](docs/automation.md), em inglês, descreve cada campo e traz
um exemplo com GitHub Actions.

`bladecp analyze --json` sempre responde `{ "ok": true, "data": <relatório> }`,
também quando o backup não migra (código de saída `6`): decida por `verdict`
(`supported`, `supported_with_warnings` ou `blocked`), `blockers` e
`warnings`, cujos valores de `code` estão no `reference.json`.

| Código | Significado |
| --- | --- |
| 0 | Sucesso (no `migrate`, o site está pronto para revisão) |
| 1 | Erro inesperado |
| 2 | Uso ou entrada inválida (opção, arquivo, destino ausente sem terminal) |
| 3 | Sem login, chave não aceita ou falha no login |
| 4 | Sem permissão |
| 5 | Não encontrado |
| 6 | Recusado pela API (por exemplo, ação indisponível na etapa atual), ou backup que não migra como está (`analyze`) |
| 7 | Limite de requisições |
| 8 | Erro de rede ou do servidor, ou falha no envio |
| 9 | Migração com falha ou cancelada |
| 10 | Aguardando uma ação sua (por exemplo, confirmar o domínio) |
| 11 | Atualização necessária (a API não aceita mais esta versão: rode `bladecp update`) |
| 130 | Interrompido |

| Variável | Para que serve |
| --- | --- |
| `BLADECP_API_KEY` | Chave de API usada no lugar do login salvo |
| `BLADECP_API_URL` | Endereço da API (o mesmo que `--api-url`) |
| `BLADECP_HUB_URL` | Endereço do Hub para o login e os links (padrão: o Hub do endereço da API) |
| `BLADECP_CONFIG_DIR` | Pasta do login salvo, das preferências e do progresso dos envios (`~` é expandido) |
| `BLADECP_NO_UPDATE_CHECK` | `1` nunca procura versão nova (`NO_UPDATE_NOTIFIER` também vale) |
| `BLADECP_MOTION` | `off` mostra o B sem animação, `reduced` só o último quadro |
| `NO_COLOR` | Desliga as cores (qualquer valor não vazio) |
| `FORCE_COLOR` | Força as cores (`1`, `2` ou `3`), inclusive em pipe, ou desliga (`0`) |
| `CI` | Nunca pergunta e nunca anima |

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
- **O logout é local.** O `bladecp logout` remove a chave do computador; a
  Customer API não tem rota para revogar a chave em uso, então revogue uma
  chave que você não usa mais em
  [Chaves de API](https://hub.bladecp.com/account/api-keys).
- **Sem telemetria.** A verificação diária de versão pergunta ao registro do npm
  um número de versão, nada mais, e pode ser desligada.

Para relatar uma vulnerabilidade em privado, siga o [SECURITY.md](SECURITY.md).
Nunca inclua uma chave de API numa issue pública.

<a id="qualidade"></a>

## Qualidade e validação

A versão `0.3.2` foi validada pelos mantenedores com **1148 testes
automatizados** em 19 arquivos, rodados com Vitest contra uma Customer
API simulada (`test/helpers/mock-api.ts`) e um registro npm simulado, nunca
reais. Eles cobrem todos os comandos, a migração e suas etapas, o login pelo
navegador e o retorno local, o login salvo, os três catálogos de mensagens, o
envio em partes, as atualizações, sequências hostis de terminal, os snapshots
do `--json`, o `reference.json`, a ocultação da chave em todos os comandos, uma
foto de cada tela em 40, 80 e 120 colunas nos três idiomas, com e sem cor, e uma
trava que mantém todo o visual num único kit. O selo de testes representa essa
execução.

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
  commands/        account, servers, migrate, migrations, follow, home, update, config
  ui/              O kit visual: saída, terminal, peças, perguntas e o B em 3D
  update/          Verificação diária de versão, forma de instalação e novidades
  auth/            Credenciais, PKCE e o retorno em 127.0.0.1
  upload/          Plano de partes, PUT em stream, estado local e envio
  i18n/            Inglês (base), português (Brasil) e espanhol
test/              Suíte Vitest com uma Customer API simulada
scripts/           Auxiliares de build e o portão da árvore pública
docs/              Guias
assets/            Arte do README
reference.json     Referência para máquinas
```

Contribuições são bem-vindas. Leia o [CONTRIBUTING.md](CONTRIBUTING.md) antes de
abrir uma issue ou um pull request: toda mensagem existe nos três idiomas, toda
tela é montada com o kit visual em `src/ui/`, texto externo nunca chega cru ao
terminal, a chave nunca chega à saída, e uma mudança
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
