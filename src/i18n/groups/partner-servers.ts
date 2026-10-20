// Messages of the partner servers commands. Keys start with "partnerServers.".
// Every key exists in the three languages with the same {placeholders}, and
// the em dash is never used.

export const en = {
  'partnerServers.help.topic': "Create, change, suspend, cancel and open your customers' servers",
  'partnerServers.help.list': "List your customers' servers, with filters",
  'partnerServers.help.create': 'Create a server for a customer',
  'partnerServers.help.plan': 'Move a server to another plan',
  'partnerServers.help.options': 'Replace the configurable options of a server',
  'partnerServers.help.suspend': 'Suspend a server (nothing is deleted)',
  'partnerServers.help.unsuspend': 'Bring a suspended server back',
  'partnerServers.help.cancel': 'Cancel a server now or at the end of the cycle',
  'partnerServers.help.delete': 'Delete a server and everything on it',
  'partnerServers.help.open': "Open the customer's panel with a one-time link",
  'partnerServers.help.listDesc':
    'Every server your key can see, including the ones you sold. Find the server of a customer by the service ID of your billing system with --external-id.',
  'partnerServers.help.createDesc':
    'Creates a server for one of your customers, as your billing system does when a service is ordered: a plan and a location of your catalog, the main domain and the customer who owns it. On a terminal it asks first; --yes skips the question.',
  'partnerServers.help.createNote':
    'With --external-id the server keeps the service ID of your billing system, so "bladecp partner servers list --external-id" finds it later.',
  'partnerServers.help.componentNote':
    'Stack Container plans need the components to install (for example --component php, or a version from "bladecp components list" after @). Other products take none.',
  'partnerServers.help.planDesc':
    'Moves the server to another plan of your catalog. The server gets the resources of the new plan.',
  'partnerServers.help.serverArg': 'The server ID (the first characters are enough)',
  'partnerServers.help.planArg': 'The ID of the new plan (see "bladecp partner plans")',
  'partnerServers.help.optionsDesc':
    'Sets the configurable options of the server. The options you give replace the whole set: an option you leave out goes back to the plan default.',
  'partnerServers.help.optionsNote':
    'The difference is charged or credited for the rest of the billing cycle. Give an option its default value to take it off.',
  'partnerServers.help.suspendDesc':
    'Suspends the server: its sites stop answering until you unsuspend it. Nothing is deleted. On a terminal it asks first.',
  'partnerServers.help.unsuspendDesc': 'Brings a suspended server back: its sites answer again.',
  'partnerServers.help.cancelDesc':
    'Cancels the server at the end of the billing cycle, or right away with --now (the server is suspended at once). Nothing is deleted, and the cancellation is recorded with a reason.',
  'partnerServers.help.cancelNote':
    'Reasons: too-expensive, no-longer-needed, technical-issues, found-better, temporary or other (the default). A reason text needs at least 20 characters.',
  'partnerServers.help.deleteDesc':
    'Deletes the server and everything on it: sites, databases, email and files. It cannot be undone. To stop it and keep the data, use "bladecp partner servers cancel".',
  'partnerServers.help.openDesc':
    "Creates a sign-in link to the customer's panel for this server and opens it in your browser. Without a terminal it prints the link. The link works once and lasts 5 minutes.",
  'partnerServers.ex.list': 'Every server you can see',
  'partnerServers.ex.listExternal': 'The server of service 1042 in your billing system',
  'partnerServers.ex.listStatus': 'Suspended servers, 50 per page',
  'partnerServers.ex.create': 'A server on plan 12, location 3, for a customer',
  'partnerServers.ex.createOptions': 'With more memory and the PHP component',
  'partnerServers.ex.plan': 'Move the server to plan 21',
  'partnerServers.ex.options': '8 GB of memory and daily backups',
  'partnerServers.ex.optionsReset': 'Memory back to the plan default',
  'partnerServers.ex.suspend': 'Suspend the server',
  'partnerServers.ex.unsuspend': 'Bring it back',
  'partnerServers.ex.cancel': 'Cancel at the end of the cycle',
  'partnerServers.ex.cancelNow': 'Cancel now, with the reason',
  'partnerServers.ex.delete': 'Delete the server for good',
  'partnerServers.ex.open': "Open the customer's panel",
  'partnerServers.ex.openJson': 'The link as JSON, to pass it on',
  'partnerServers.option.component':
    'Component to install, with an optional version (repeat for more than one)',
  'partnerServers.option.contract':
    'Contract term in months (12, 24, 36 or 48) for plans sold with a contract; records that the customer accepted the terms',
  'partnerServers.option.now':
    'Cancel right away (the server is suspended now) instead of at the end of the cycle',
  'partnerServers.option.reasonCategory':
    'Why it is cancelled: too-expensive, no-longer-needed, technical-issues, found-better, temporary or other',
  'partnerServers.option.domainFilter': 'Only the server with this main domain',
  'partnerServers.option.externalIdFilter':
    'Only the server with this service ID of your billing system',
  'partnerServers.option.limit': 'How many per page (up to 100)',
  'partnerServers.option.plan': 'Plan ID (see "bladecp partner plans")',
  'partnerServers.option.location': 'Location ID of the plan (see "bladecp partner locations")',
  'partnerServers.option.domain': 'Main domain of the new server',
  'partnerServers.option.email': 'Email of the customer who owns the server',
  'partnerServers.option.name': 'Name of the customer who owns the server',
  'partnerServers.option.externalId':
    'The service ID in your billing system, to find the server later',
  'partnerServers.option.option':
    'Configurable option and value, by name or ID (see "bladecp partner options"); for a quantity, the number. Repeat for more than one',
  'partnerServers.option.reason':
    'Why it is cancelled, at least 20 characters (kept with the request)',
  'partnerServers.declined': 'Nothing was changed.',
  'partnerServers.error.optionFormat': 'Write the option as <option>=<value>, got "{value}".',
  'partnerServers.error.optionUnknown':
    'There is no option "{option}". See them with "bladecp partner options".',
  'partnerServers.error.optionNotInPlan':
    'Plan {plan} has no option "{option}". See them with "bladecp partner options --plan {plan}".',
  'partnerServers.error.optionAmbiguous':
    'More than one option is called "{option}". Use its ID from "bladecp partner options --json".',
  'partnerServers.error.optionTwice': 'The option {option} was given more than once.',
  'partnerServers.error.quantity': '{option} takes a quantity of at least {min}, got "{value}".',
  'partnerServers.error.quantityRange':
    '{option} takes a quantity from {min} to {max}, got "{value}".',
  'partnerServers.error.valueUnknown': '{option} has no value "{value}". Use one of: {values}.',
  'partnerServers.error.limit': '--limit goes up to 100, got {value}.',
  'partnerServers.error.component':
    'Write a component as <slug> or <slug>@<version>, got "{value}".',
  'partnerServers.error.componentTwice': 'The component {component} was given with two versions.',
  'partnerServers.error.contract': 'The contract term is 12, 24, 36 or 48 months, got "{value}".',
  'partnerServers.error.domain': '"{value}" is not a valid domain. Use a name like example.com.',
  'partnerServers.error.email': '"{value}" is not a valid email address.',
  'partnerServers.error.plan':
    '"{value}" is not a plan ID. Use the number from "bladecp partner plans".',
  'partnerServers.error.category': 'Unknown reason "{value}". Use one of: {categories}.',
  'partnerServers.error.reason': 'The reason needs from 20 to 2000 characters, got {count}.',
  'partnerServers.optionLine': '{option}: {value}',
  'partnerServers.optionDefault': '{option}: {value} (plan default)',
  'partnerServers.optionQuantity': '{option}: {quantity}',
  'partnerServers.list.count': '{count} servers',
  'partnerServers.list.countOne': '1 server',
  'partnerServers.list.page': 'page {page}',
  'partnerServers.list.empty': 'No servers yet.',
  'partnerServers.list.emptyFiltered': 'No server matches these filters.',
  'partnerServers.list.more': 'More servers on the next page:',
  'partnerServers.list.createHint': 'Create one for a customer:',
  'partnerServers.list.hint': 'Details of a server: {command}',
  'partnerServers.label.customer': 'Customer',
  'partnerServers.label.externalId': 'Service ID',
  'partnerServers.customer': '{name} ({email})',
  'partnerServers.create.confirm': 'Create a server for {domain}?',
  'partnerServers.create.detailOwner': 'Customer: {name} ({email})',
  'partnerServers.create.detailPlan': 'Plan {plan} · location {location}',
  'partnerServers.create.detailComponents': 'Components: {components}',
  'partnerServers.create.detailContract':
    'Contract of {months} months, terms accepted by the customer',
  'partnerServers.create.detailExternal': 'Service ID in your billing system: {id}',
  'partnerServers.create.manualNote':
    'This plan is delivered by hand: BladeCP prepares the server, and its status changes when it is ready.',
  'partnerServers.create.next': 'Follow it with:',
  'partnerServers.create.nextOpen': "Open the customer's panel:",
  'partnerServers.plan.confirm': 'Move {domain} to plan {plan}?',
  'partnerServers.plan.detail':
    'The server gets the resources of the new plan, and billing follows it.',
  'partnerServers.plan.done': '{domain} is on plan {plan} now.',
  'partnerServers.plan.next': 'Options of the new plan:',
  'partnerServers.options.confirm': 'Replace the options of {domain}?',
  'partnerServers.options.replaceNote':
    'This replaces every option of the server: the ones left out go back to the plan default.',
  'partnerServers.options.allDefault': 'Every option goes back to the plan default.',
  'partnerServers.options.done': 'Options of {domain} replaced.',
  'partnerServers.options.charge': '{amount} is charged for the rest of the billing cycle.',
  'partnerServers.options.credit': '{amount} is credited for the rest of the billing cycle.',
  'partnerServers.suspend.confirm': 'Suspend {domain}?',
  'partnerServers.suspend.detail':
    'Its sites stop answering until you unsuspend it. Nothing is deleted.',
  'partnerServers.suspend.done': '{domain} is suspended.',
  'partnerServers.suspend.next': 'Bring it back with:',
  'partnerServers.unsuspend.confirm': 'Unsuspend {domain}?',
  'partnerServers.unsuspend.detail': 'Its sites answer again.',
  'partnerServers.unsuspend.done': '{domain} is back.',
  'partnerServers.cancel.confirmNow': 'Cancel {domain} now?',
  'partnerServers.cancel.confirmCycle': 'Cancel {domain} at the end of the billing cycle?',
  'partnerServers.cancel.detailNow':
    'The server is suspended right away. Nothing is deleted: unsuspend it to undo.',
  'partnerServers.cancel.detailCycle':
    'The server keeps running until the cycle ends. Nothing is deleted.',
  'partnerServers.cancel.detailReason': 'Reason: {reason}',
  'partnerServers.cancel.defaultReason':
    'Cancellation requested by the partner with the BladeCP CLI.',
  'partnerServers.cancel.ticket': 'Recorded as ticket {ticket}.',
  'partnerServers.cancel.penalty':
    'Early termination fee (estimate): {amount}, with {months} months left on the contract.',
  'partnerServers.cancel.undoNow': 'Undo it with:',
  'partnerServers.cancel.doneNow': '{domain} is cancelled and suspended.',
  'partnerServers.cancel.doneCycle': '{domain} will be cancelled at the end of the billing cycle.',
  'partnerServers.delete.confirm': 'Delete {domain} for good?',
  'partnerServers.delete.detail':
    'The server and everything on it are removed: sites, databases, email and files. This cannot be undone.',
  'partnerServers.delete.deleting': '{domain} is being deleted.',
  'partnerServers.delete.deleted': '{domain} was deleted.',
  'partnerServers.delete.reused': '{domain} was already being deleted; the removal was sent again.',
  'partnerServers.open.opened': 'The panel of {domain} opened in your browser.',
  'partnerServers.open.label': 'Sign-in link to the panel of {domain}',
  'partnerServers.open.note': 'The link works once and lasts 5 minutes.',
  'partnerServers.error.componentsRequired':
    'Plan {plan} is a Stack Container: say which components to install with --component (for example --component php --component mysql). See them with "bladecp components list".',
  'partnerServers.hint.componentsRequired':
    'This plan needs components: add --component <slug> (see "bladecp components list").',
  'partnerServers.hint.catalog':
    'A component, option or value is not in the catalog of plan {plan}: check "bladecp components list" and "bladecp partner options --plan {plan}".',
  'partnerServers.hint.location':
    'Pick a location of plan {plan}: "bladecp partner locations --plan {plan}".',
  'partnerServers.hint.contract': 'Plan {plan} has a contract term: add --contract <months>.',
  'partnerServers.hint.deletePending':
    'The server is {status}: it never reached the infrastructure, and the API cannot delete it in this state. If it stays {status}, contact BladeCP support.',
  'partnerServers.hint.deleteState':
    'The API does not delete a server in the status {status}. Check it with "bladecp servers show".',
  'partnerServers.hint.cancelAlreadyRequested':
    'This server already has a cancellation requested (see "bladecp servers show"); asking again does not change it. To bring it forward, contact BladeCP support.',
};

export const ptBR: Record<keyof typeof en, string> = {
  'partnerServers.help.topic':
    'Criar, alterar, suspender, cancelar e abrir os servidores dos seus clientes',
  'partnerServers.help.list': 'Listar os servidores dos seus clientes, com filtros',
  'partnerServers.help.create': 'Criar um servidor para um cliente',
  'partnerServers.help.plan': 'Mudar o plano de um servidor',
  'partnerServers.help.options': 'Substituir as opções configuráveis de um servidor',
  'partnerServers.help.suspend': 'Suspender um servidor (nada é apagado)',
  'partnerServers.help.unsuspend': 'Reativar um servidor suspenso',
  'partnerServers.help.cancel': 'Cancelar um servidor agora ou no fim do ciclo',
  'partnerServers.help.delete': 'Apagar um servidor e tudo o que há nele',
  'partnerServers.help.open': 'Abrir o painel do cliente com um link de uso único',
  'partnerServers.help.listDesc':
    'Todos os servidores que a sua chave enxerga, inclusive os que você vendeu. Encontre o servidor de um cliente pelo ID do serviço no seu sistema de cobrança com --external-id.',
  'partnerServers.help.createDesc':
    'Cria um servidor para um dos seus clientes, como o seu sistema de cobrança faz quando um serviço é contratado: um plano e uma localização do seu catálogo, o domínio principal e o cliente dono dele. No terminal, pergunta antes; --yes pula a pergunta.',
  'partnerServers.help.createNote':
    'Com --external-id, o servidor guarda o ID do serviço no seu sistema de cobrança, e "bladecp partner servers list --external-id" encontra ele depois.',
  'partnerServers.help.componentNote':
    'Planos Stack Container precisam dos componentes a instalar (por exemplo --component php, ou uma versão de "bladecp components list" depois do @). Os outros produtos não levam componentes.',
  'partnerServers.help.planDesc':
    'Muda o servidor para outro plano do seu catálogo. O servidor passa a ter os recursos do novo plano.',
  'partnerServers.help.serverArg': 'O ID do servidor (os primeiros caracteres bastam)',
  'partnerServers.help.planArg': 'O ID do novo plano (veja "bladecp partner plans")',
  'partnerServers.help.optionsDesc':
    'Define as opções configuráveis do servidor. As opções que você passa substituem o conjunto inteiro: a opção que ficar de fora volta para o padrão do plano.',
  'partnerServers.help.optionsNote':
    'A diferença é cobrada ou creditada pelo resto do ciclo de cobrança. Para tirar uma opção, passe o valor padrão dela.',
  'partnerServers.help.suspendDesc':
    'Suspende o servidor: os sites param de responder até você reativar. Nada é apagado. No terminal, pergunta antes.',
  'partnerServers.help.unsuspendDesc': 'Reativa um servidor suspenso: os sites voltam a responder.',
  'partnerServers.help.cancelDesc':
    'Cancela o servidor no fim do ciclo de cobrança, ou na hora com --now (o servidor é suspenso imediatamente). Nada é apagado, e o cancelamento fica registrado com um motivo.',
  'partnerServers.help.cancelNote':
    'Motivos: too-expensive, no-longer-needed, technical-issues, found-better, temporary ou other (o padrão). O texto do motivo precisa de pelo menos 20 caracteres.',
  'partnerServers.help.deleteDesc':
    'Apaga o servidor e tudo o que há nele: sites, bancos de dados, e-mails e arquivos. Não dá para desfazer. Para parar o servidor e manter os dados, use "bladecp partner servers cancel".',
  'partnerServers.help.openDesc':
    'Cria um link de acesso ao painel do cliente para este servidor e abre no seu navegador. Sem terminal, mostra o link. O link funciona uma vez e dura 5 minutos.',
  'partnerServers.ex.list': 'Todos os servidores que você enxerga',
  'partnerServers.ex.listExternal': 'O servidor do serviço 1042 no seu sistema de cobrança',
  'partnerServers.ex.listStatus': 'Servidores suspensos, 50 por página',
  'partnerServers.ex.create': 'Um servidor no plano 12, localização 3, para um cliente',
  'partnerServers.ex.createOptions': 'Com mais memória e o componente PHP',
  'partnerServers.ex.plan': 'Mudar o servidor para o plano 21',
  'partnerServers.ex.options': '8 GB de memória e backups diários',
  'partnerServers.ex.optionsReset': 'Memória de volta ao padrão do plano',
  'partnerServers.ex.suspend': 'Suspender o servidor',
  'partnerServers.ex.unsuspend': 'Reativar o servidor',
  'partnerServers.ex.cancel': 'Cancelar no fim do ciclo',
  'partnerServers.ex.cancelNow': 'Cancelar agora, com o motivo',
  'partnerServers.ex.delete': 'Apagar o servidor de vez',
  'partnerServers.ex.open': 'Abrir o painel do cliente',
  'partnerServers.ex.openJson': 'O link em JSON, para repassar',
  'partnerServers.option.component':
    'Componente a instalar, com a versão se quiser (repita para mais de um)',
  'partnerServers.option.contract':
    'Prazo do contrato em meses (12, 24, 36 ou 48) para planos vendidos com contrato; registra que o cliente aceitou os termos',
  'partnerServers.option.now':
    'Cancelar na hora (o servidor é suspenso agora) em vez de no fim do ciclo',
  'partnerServers.option.reasonCategory':
    'Por que é cancelado: too-expensive, no-longer-needed, technical-issues, found-better, temporary ou other',
  'partnerServers.option.domainFilter': 'Só o servidor com este domínio principal',
  'partnerServers.option.externalIdFilter':
    'Só o servidor com este ID de serviço do seu sistema de cobrança',
  'partnerServers.option.limit': 'Quantos por página (até 100)',
  'partnerServers.option.plan': 'ID do plano (veja "bladecp partner plans")',
  'partnerServers.option.location': 'ID da localização do plano (veja "bladecp partner locations")',
  'partnerServers.option.domain': 'Domínio principal do novo servidor',
  'partnerServers.option.email': 'E-mail do cliente dono do servidor',
  'partnerServers.option.name': 'Nome do cliente dono do servidor',
  'partnerServers.option.externalId':
    'O ID do serviço no seu sistema de cobrança, para encontrar o servidor depois',
  'partnerServers.option.option':
    'Opção configurável e valor, pelo nome ou pelo ID (veja "bladecp partner options"); numa quantidade, o número. Repita para mais de uma',
  'partnerServers.option.reason':
    'Por que é cancelado, com pelo menos 20 caracteres (fica junto do pedido)',
  'partnerServers.declined': 'Nada foi alterado.',
  'partnerServers.error.optionFormat': 'Escreva a opção como <opção>=<valor>; recebi "{value}".',
  'partnerServers.error.optionUnknown':
    'Não existe a opção "{option}". Veja as opções com "bladecp partner options".',
  'partnerServers.error.optionNotInPlan':
    'O plano {plan} não tem a opção "{option}". Veja as opções com "bladecp partner options --plan {plan}".',
  'partnerServers.error.optionAmbiguous':
    'Mais de uma opção se chama "{option}". Use o ID dela de "bladecp partner options --json".',
  'partnerServers.error.optionTwice': 'A opção {option} foi passada mais de uma vez.',
  'partnerServers.error.quantity':
    '{option} aceita uma quantidade de pelo menos {min}; recebi "{value}".',
  'partnerServers.error.quantityRange':
    '{option} aceita uma quantidade de {min} a {max}; recebi "{value}".',
  'partnerServers.error.valueUnknown':
    '{option} não tem o valor "{value}". Use um destes: {values}.',
  'partnerServers.error.limit': '--limit vai até 100; recebi {value}.',
  'partnerServers.error.component':
    'Escreva o componente como <slug> ou <slug>@<versão>; recebi "{value}".',
  'partnerServers.error.componentTwice': 'O componente {component} foi passado com duas versões.',
  'partnerServers.error.contract':
    'O prazo do contrato é de 12, 24, 36 ou 48 meses; recebi "{value}".',
  'partnerServers.error.domain': '"{value}" não é um domínio válido. Use um nome como example.com.',
  'partnerServers.error.email': '"{value}" não é um endereço de e-mail válido.',
  'partnerServers.error.plan':
    '"{value}" não é um ID de plano. Use o número de "bladecp partner plans".',
  'partnerServers.error.category': 'Motivo "{value}" desconhecido. Use um destes: {categories}.',
  'partnerServers.error.reason': 'O motivo precisa ter de 20 a 2000 caracteres; recebi {count}.',
  'partnerServers.optionLine': '{option}: {value}',
  'partnerServers.optionDefault': '{option}: {value} (padrão do plano)',
  'partnerServers.optionQuantity': '{option}: {quantity}',
  'partnerServers.list.count': '{count} servidores',
  'partnerServers.list.countOne': '1 servidor',
  'partnerServers.list.page': 'página {page}',
  'partnerServers.list.empty': 'Nenhum servidor ainda.',
  'partnerServers.list.emptyFiltered': 'Nenhum servidor com esses filtros.',
  'partnerServers.list.more': 'Mais servidores na próxima página:',
  'partnerServers.list.createHint': 'Crie um para um cliente:',
  'partnerServers.list.hint': 'Detalhes de um servidor: {command}',
  'partnerServers.label.customer': 'Cliente',
  'partnerServers.label.externalId': 'ID do serviço',
  'partnerServers.customer': '{name} ({email})',
  'partnerServers.create.confirm': 'Criar um servidor para {domain}?',
  'partnerServers.create.detailOwner': 'Cliente: {name} ({email})',
  'partnerServers.create.detailPlan': 'Plano {plan} · localização {location}',
  'partnerServers.create.detailComponents': 'Componentes: {components}',
  'partnerServers.create.detailContract': 'Contrato de {months} meses, termos aceitos pelo cliente',
  'partnerServers.create.detailExternal': 'ID do serviço no seu sistema de cobrança: {id}',
  'partnerServers.create.manualNote':
    'Este plano tem entrega manual: a BladeCP prepara o servidor, e o status muda quando ele estiver pronto.',
  'partnerServers.create.next': 'Acompanhe com:',
  'partnerServers.create.nextOpen': 'Abra o painel do cliente:',
  'partnerServers.plan.confirm': 'Mudar {domain} para o plano {plan}?',
  'partnerServers.plan.detail':
    'O servidor passa a ter os recursos do novo plano, e a cobrança acompanha.',
  'partnerServers.plan.done': '{domain} agora está no plano {plan}.',
  'partnerServers.plan.next': 'Opções do novo plano:',
  'partnerServers.options.confirm': 'Substituir as opções de {domain}?',
  'partnerServers.options.replaceNote':
    'Isto substitui todas as opções do servidor: as que ficarem de fora voltam para o padrão do plano.',
  'partnerServers.options.allDefault': 'Todas as opções voltam para o padrão do plano.',
  'partnerServers.options.done': 'Opções de {domain} substituídas.',
  'partnerServers.options.charge': '{amount} é cobrado pelo resto do ciclo de cobrança.',
  'partnerServers.options.credit': '{amount} é creditado pelo resto do ciclo de cobrança.',
  'partnerServers.suspend.confirm': 'Suspender {domain}?',
  'partnerServers.suspend.detail': 'Os sites param de responder até você reativar. Nada é apagado.',
  'partnerServers.suspend.done': '{domain} está suspenso.',
  'partnerServers.suspend.next': 'Reative com:',
  'partnerServers.unsuspend.confirm': 'Reativar {domain}?',
  'partnerServers.unsuspend.detail': 'Os sites voltam a responder.',
  'partnerServers.unsuspend.done': '{domain} foi reativado.',
  'partnerServers.cancel.confirmNow': 'Cancelar {domain} agora?',
  'partnerServers.cancel.confirmCycle': 'Cancelar {domain} no fim do ciclo de cobrança?',
  'partnerServers.cancel.detailNow':
    'O servidor é suspenso na hora. Nada é apagado: reative para desfazer.',
  'partnerServers.cancel.detailCycle':
    'O servidor continua funcionando até o fim do ciclo. Nada é apagado.',
  'partnerServers.cancel.detailReason': 'Motivo: {reason}',
  'partnerServers.cancel.defaultReason': 'Cancelamento pedido pelo parceiro pela BladeCP CLI.',
  'partnerServers.cancel.ticket': 'Registrado no chamado {ticket}.',
  'partnerServers.cancel.penalty':
    'Multa por rescisão antecipada (estimativa): {amount}, faltando {months} meses de contrato.',
  'partnerServers.cancel.undoNow': 'Desfaça com:',
  'partnerServers.cancel.doneNow': '{domain} foi cancelado e está suspenso.',
  'partnerServers.cancel.doneCycle': '{domain} será cancelado no fim do ciclo de cobrança.',
  'partnerServers.delete.confirm': 'Apagar {domain} de vez?',
  'partnerServers.delete.detail':
    'O servidor e tudo o que há nele são removidos: sites, bancos de dados, e-mails e arquivos. Não dá para desfazer.',
  'partnerServers.delete.deleting': '{domain} está sendo apagado.',
  'partnerServers.delete.deleted': '{domain} foi apagado.',
  'partnerServers.delete.reused':
    '{domain} já estava sendo apagado; a remoção foi enviada de novo.',
  'partnerServers.open.opened': 'O painel de {domain} abriu no seu navegador.',
  'partnerServers.open.label': 'Link de acesso ao painel de {domain}',
  'partnerServers.open.note': 'O link funciona uma vez e dura 5 minutos.',
  'partnerServers.error.componentsRequired':
    'O plano {plan} é Stack Container: diga quais componentes instalar com --component (por exemplo --component php --component mysql). Veja os disponíveis com "bladecp components list".',
  'partnerServers.hint.componentsRequired':
    'Este plano precisa de componentes: adicione --component <slug> (veja "bladecp components list").',
  'partnerServers.hint.catalog':
    'Um componente, opção ou valor não está no catálogo do plano {plan}: confira "bladecp components list" e "bladecp partner options --plan {plan}".',
  'partnerServers.hint.location':
    'Escolha um local do plano {plan}: "bladecp partner locations --plan {plan}".',
  'partnerServers.hint.contract':
    'O plano {plan} tem prazo de contrato: adicione --contract <meses>.',
  'partnerServers.hint.deletePending':
    'O servidor está {status}: ele nunca chegou à infraestrutura, e a API não consegue apagá-lo neste estado. Se ele continuar {status}, fale com o suporte da BladeCP.',
  'partnerServers.hint.deleteState':
    'A API não apaga um servidor no status {status}. Confira com "bladecp servers show".',
  'partnerServers.hint.cancelAlreadyRequested':
    'Este servidor já tem um cancelamento pedido (veja em "bladecp servers show"); pedir de novo não muda nada. Para antecipar, fale com o suporte da BladeCP.',
};

export const es: Record<keyof typeof en, string> = {
  'partnerServers.help.topic':
    'Crear, cambiar, suspender, cancelar y abrir los servidores de tus clientes',
  'partnerServers.help.list': 'Listar los servidores de tus clientes, con filtros',
  'partnerServers.help.create': 'Crear un servidor para un cliente',
  'partnerServers.help.plan': 'Cambiar el plan de un servidor',
  'partnerServers.help.options': 'Reemplazar las opciones configurables de un servidor',
  'partnerServers.help.suspend': 'Suspender un servidor (no se elimina nada)',
  'partnerServers.help.unsuspend': 'Reactivar un servidor suspendido',
  'partnerServers.help.cancel': 'Cancelar un servidor ahora o al final del ciclo',
  'partnerServers.help.delete': 'Eliminar un servidor y todo lo que contiene',
  'partnerServers.help.open': 'Abrir el panel del cliente con un enlace de un solo uso',
  'partnerServers.help.listDesc':
    'Todos los servidores que tu clave puede ver, incluidos los que vendiste. Encuentra el servidor de un cliente por el ID del servicio de tu sistema de cobro con --external-id.',
  'partnerServers.help.createDesc':
    'Crea un servidor para uno de tus clientes, como lo hace tu sistema de cobro cuando se contrata un servicio: un plan y una ubicación de tu catálogo, el dominio principal y el cliente dueño. En una terminal pregunta antes; --yes omite la pregunta.',
  'partnerServers.help.createNote':
    'Con --external-id, el servidor guarda el ID del servicio de tu sistema de cobro, y "bladecp partner servers list --external-id" lo encuentra después.',
  'partnerServers.help.componentNote':
    'Los planes Stack Container necesitan los componentes a instalar (por ejemplo --component php, o una versión de "bladecp components list" después de @). Los demás productos no llevan componentes.',
  'partnerServers.help.planDesc':
    'Cambia el servidor a otro plan de tu catálogo. El servidor recibe los recursos del nuevo plan.',
  'partnerServers.help.serverArg': 'El ID del servidor (bastan los primeros caracteres)',
  'partnerServers.help.planArg': 'El ID del nuevo plan (mira "bladecp partner plans")',
  'partnerServers.help.optionsDesc':
    'Define las opciones configurables del servidor. Las opciones que pasas reemplazan el conjunto entero: la opción que quede fuera vuelve al valor por defecto del plan.',
  'partnerServers.help.optionsNote':
    'La diferencia se cobra o se acredita por el resto del ciclo de cobro. Para quitar una opción, pasa su valor por defecto.',
  'partnerServers.help.suspendDesc':
    'Suspende el servidor: sus sitios dejan de responder hasta que lo reactives. No se elimina nada. En una terminal pregunta antes.',
  'partnerServers.help.unsuspendDesc':
    'Reactiva un servidor suspendido: sus sitios vuelven a responder.',
  'partnerServers.help.cancelDesc':
    'Cancela el servidor al final del ciclo de cobro, o en el acto con --now (el servidor se suspende de inmediato). No se elimina nada, y la cancelación queda registrada con un motivo.',
  'partnerServers.help.cancelNote':
    'Motivos: too-expensive, no-longer-needed, technical-issues, found-better, temporary u other (el predeterminado). El texto del motivo necesita al menos 20 caracteres.',
  'partnerServers.help.deleteDesc':
    'Elimina el servidor y todo lo que contiene: sitios, bases de datos, correos y archivos. No se puede deshacer. Para detenerlo y conservar los datos, usa "bladecp partner servers cancel".',
  'partnerServers.help.openDesc':
    'Crea un enlace de acceso al panel del cliente para este servidor y lo abre en tu navegador. Sin terminal, muestra el enlace. El enlace funciona una vez y dura 5 minutos.',
  'partnerServers.ex.list': 'Todos los servidores que puedes ver',
  'partnerServers.ex.listExternal': 'El servidor del servicio 1042 en tu sistema de cobro',
  'partnerServers.ex.listStatus': 'Servidores suspendidos, 50 por página',
  'partnerServers.ex.create': 'Un servidor en el plan 12, ubicación 3, para un cliente',
  'partnerServers.ex.createOptions': 'Con más memoria y el componente PHP',
  'partnerServers.ex.plan': 'Cambiar el servidor al plan 21',
  'partnerServers.ex.options': '8 GB de memoria y copias de seguridad diarias',
  'partnerServers.ex.optionsReset': 'Memoria de vuelta al valor por defecto del plan',
  'partnerServers.ex.suspend': 'Suspender el servidor',
  'partnerServers.ex.unsuspend': 'Reactivar el servidor',
  'partnerServers.ex.cancel': 'Cancelar al final del ciclo',
  'partnerServers.ex.cancelNow': 'Cancelar ahora, con el motivo',
  'partnerServers.ex.delete': 'Eliminar el servidor para siempre',
  'partnerServers.ex.open': 'Abrir el panel del cliente',
  'partnerServers.ex.openJson': 'El enlace en JSON, para reenviarlo',
  'partnerServers.option.component':
    'Componente a instalar, con la versión si quieres (repite para más de uno)',
  'partnerServers.option.contract':
    'Plazo del contrato en meses (12, 24, 36 o 48) para planes vendidos con contrato; registra que el cliente aceptó los términos',
  'partnerServers.option.now':
    'Cancelar en el acto (el servidor se suspende ahora) en vez de al final del ciclo',
  'partnerServers.option.reasonCategory':
    'Por qué se cancela: too-expensive, no-longer-needed, technical-issues, found-better, temporary u other',
  'partnerServers.option.domainFilter': 'Solo el servidor con este dominio principal',
  'partnerServers.option.externalIdFilter':
    'Solo el servidor con este ID de servicio de tu sistema de cobro',
  'partnerServers.option.limit': 'Cuántos por página (hasta 100)',
  'partnerServers.option.plan': 'ID del plan (mira "bladecp partner plans")',
  'partnerServers.option.location':
    'ID de la ubicación del plan (mira "bladecp partner locations")',
  'partnerServers.option.domain': 'Dominio principal del nuevo servidor',
  'partnerServers.option.email': 'Correo del cliente dueño del servidor',
  'partnerServers.option.name': 'Nombre del cliente dueño del servidor',
  'partnerServers.option.externalId':
    'El ID del servicio en tu sistema de cobro, para encontrar el servidor después',
  'partnerServers.option.option':
    'Opción configurable y valor, por nombre o ID (mira "bladecp partner options"); en una cantidad, el número. Repite para más de una',
  'partnerServers.option.reason':
    'Por qué se cancela, con al menos 20 caracteres (queda junto a la solicitud)',
  'partnerServers.declined': 'No se cambió nada.',
  'partnerServers.error.optionFormat':
    'Escribe la opción como <opción>=<valor>; se recibió "{value}".',
  'partnerServers.error.optionUnknown':
    'No existe la opción "{option}". Míralas con "bladecp partner options".',
  'partnerServers.error.optionNotInPlan':
    'El plan {plan} no tiene la opción "{option}". Míralas con "bladecp partner options --plan {plan}".',
  'partnerServers.error.optionAmbiguous':
    'Más de una opción se llama "{option}". Usa su ID de "bladecp partner options --json".',
  'partnerServers.error.optionTwice': 'La opción {option} se pasó más de una vez.',
  'partnerServers.error.quantity':
    '{option} acepta una cantidad de al menos {min}; se recibió "{value}".',
  'partnerServers.error.quantityRange':
    '{option} acepta una cantidad de {min} a {max}; se recibió "{value}".',
  'partnerServers.error.valueUnknown':
    '{option} no tiene el valor "{value}". Usa uno de: {values}.',
  'partnerServers.error.limit': '--limit llega hasta 100; se recibió {value}.',
  'partnerServers.error.component':
    'Escribe el componente como <slug> o <slug>@<versión>; se recibió "{value}".',
  'partnerServers.error.componentTwice': 'El componente {component} se pasó con dos versiones.',
  'partnerServers.error.contract':
    'El plazo del contrato es de 12, 24, 36 o 48 meses; se recibió "{value}".',
  'partnerServers.error.domain':
    '"{value}" no es un dominio válido. Usa un nombre como example.com.',
  'partnerServers.error.email': '"{value}" no es una dirección de correo válida.',
  'partnerServers.error.plan':
    '"{value}" no es un ID de plan. Usa el número de "bladecp partner plans".',
  'partnerServers.error.category': 'Motivo "{value}" desconocido. Usa uno de: {categories}.',
  'partnerServers.error.reason':
    'El motivo necesita de 20 a 2000 caracteres; se recibieron {count}.',
  'partnerServers.optionLine': '{option}: {value}',
  'partnerServers.optionDefault': '{option}: {value} (por defecto del plan)',
  'partnerServers.optionQuantity': '{option}: {quantity}',
  'partnerServers.list.count': '{count} servidores',
  'partnerServers.list.countOne': '1 servidor',
  'partnerServers.list.page': 'página {page}',
  'partnerServers.list.empty': 'Aún no hay servidores.',
  'partnerServers.list.emptyFiltered': 'Ningún servidor coincide con estos filtros.',
  'partnerServers.list.more': 'Más servidores en la siguiente página:',
  'partnerServers.list.createHint': 'Crea uno para un cliente:',
  'partnerServers.list.hint': 'Detalles de un servidor: {command}',
  'partnerServers.label.customer': 'Cliente',
  'partnerServers.label.externalId': 'ID del servicio',
  'partnerServers.customer': '{name} ({email})',
  'partnerServers.create.confirm': '¿Crear un servidor para {domain}?',
  'partnerServers.create.detailOwner': 'Cliente: {name} ({email})',
  'partnerServers.create.detailPlan': 'Plan {plan} · ubicación {location}',
  'partnerServers.create.detailComponents': 'Componentes: {components}',
  'partnerServers.create.detailContract':
    'Contrato de {months} meses, términos aceptados por el cliente',
  'partnerServers.create.detailExternal': 'ID del servicio en tu sistema de cobro: {id}',
  'partnerServers.create.manualNote':
    'Este plan tiene entrega manual: BladeCP prepara el servidor, y su estado cambia cuando esté listo.',
  'partnerServers.create.next': 'Síguelo con:',
  'partnerServers.create.nextOpen': 'Abre el panel del cliente:',
  'partnerServers.plan.confirm': '¿Cambiar {domain} al plan {plan}?',
  'partnerServers.plan.detail':
    'El servidor recibe los recursos del nuevo plan, y el cobro lo acompaña.',
  'partnerServers.plan.done': '{domain} ya está en el plan {plan}.',
  'partnerServers.plan.next': 'Opciones del nuevo plan:',
  'partnerServers.options.confirm': '¿Reemplazar las opciones de {domain}?',
  'partnerServers.options.replaceNote':
    'Esto reemplaza todas las opciones del servidor: las que queden fuera vuelven al valor por defecto del plan.',
  'partnerServers.options.allDefault': 'Todas las opciones vuelven al valor por defecto del plan.',
  'partnerServers.options.done': 'Opciones de {domain} reemplazadas.',
  'partnerServers.options.charge': 'Se cobra {amount} por el resto del ciclo de cobro.',
  'partnerServers.options.credit': 'Se acredita {amount} por el resto del ciclo de cobro.',
  'partnerServers.suspend.confirm': '¿Suspender {domain}?',
  'partnerServers.suspend.detail':
    'Sus sitios dejan de responder hasta que lo reactives. No se elimina nada.',
  'partnerServers.suspend.done': '{domain} está suspendido.',
  'partnerServers.suspend.next': 'Reactívalo con:',
  'partnerServers.unsuspend.confirm': '¿Reactivar {domain}?',
  'partnerServers.unsuspend.detail': 'Sus sitios vuelven a responder.',
  'partnerServers.unsuspend.done': '{domain} se reactivó.',
  'partnerServers.cancel.confirmNow': '¿Cancelar {domain} ahora?',
  'partnerServers.cancel.confirmCycle': '¿Cancelar {domain} al final del ciclo de cobro?',
  'partnerServers.cancel.detailNow':
    'El servidor se suspende en el acto. No se elimina nada: reactívalo para deshacerlo.',
  'partnerServers.cancel.detailCycle':
    'El servidor sigue funcionando hasta el final del ciclo. No se elimina nada.',
  'partnerServers.cancel.detailReason': 'Motivo: {reason}',
  'partnerServers.cancel.defaultReason':
    'Cancelación solicitada por el socio con la CLI de BladeCP.',
  'partnerServers.cancel.ticket': 'Registrado en el ticket {ticket}.',
  'partnerServers.cancel.penalty':
    'Penalización por terminación anticipada (estimación): {amount}, con {months} meses restantes de contrato.',
  'partnerServers.cancel.undoNow': 'Deshazlo con:',
  'partnerServers.cancel.doneNow': '{domain} se canceló y está suspendido.',
  'partnerServers.cancel.doneCycle': '{domain} se cancelará al final del ciclo de cobro.',
  'partnerServers.delete.confirm': '¿Eliminar {domain} para siempre?',
  'partnerServers.delete.detail':
    'Se eliminan el servidor y todo lo que contiene: sitios, bases de datos, correos y archivos. No se puede deshacer.',
  'partnerServers.delete.deleting': '{domain} se está eliminando.',
  'partnerServers.delete.deleted': '{domain} se eliminó.',
  'partnerServers.delete.reused':
    '{domain} ya se estaba eliminando; la eliminación se envió de nuevo.',
  'partnerServers.open.opened': 'El panel de {domain} se abrió en tu navegador.',
  'partnerServers.open.label': 'Enlace de acceso al panel de {domain}',
  'partnerServers.open.note': 'El enlace funciona una vez y dura 5 minutos.',
  'partnerServers.error.componentsRequired':
    'El plan {plan} es Stack Container: indica qué componentes instalar con --component (por ejemplo --component php --component mysql). Consúltalos con "bladecp components list".',
  'partnerServers.hint.componentsRequired':
    'Este plan necesita componentes: agrega --component <slug> (consulta "bladecp components list").',
  'partnerServers.hint.catalog':
    'Un componente, opción o valor no está en el catálogo del plan {plan}: revisa "bladecp components list" y "bladecp partner options --plan {plan}".',
  'partnerServers.hint.location':
    'Elige una ubicación del plan {plan}: "bladecp partner locations --plan {plan}".',
  'partnerServers.hint.contract':
    'El plan {plan} tiene plazo de contrato: agrega --contract <meses>.',
  'partnerServers.hint.deletePending':
    'El servidor está {status}: nunca llegó a la infraestructura, y la API no puede eliminarlo en este estado. Si sigue {status}, contacta al soporte de BladeCP.',
  'partnerServers.hint.deleteState':
    'La API no elimina un servidor en el estado {status}. Revísalo con "bladecp servers show".',
  'partnerServers.hint.cancelAlreadyRequested':
    'Este servidor ya tiene una cancelación solicitada (mírala con "bladecp servers show"); pedirla otra vez no cambia nada. Para adelantarla, contacta al soporte de BladeCP.',
};
