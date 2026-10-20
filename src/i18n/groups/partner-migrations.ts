// Messages of the partner migrations commands. Keys start with "partnerMigrations.".
// Every key exists in the three languages with the same {placeholders}, and
// the em dash is never used.

export const en = {
  'partnerMigrations.help.topic':
    'Run Fast Deploy for your clients: WHMCS requests, billing queue and account confirmation',
  'partnerMigrations.help.list': 'List the Fast Deploy requests of a WHMCS installation',
  'partnerMigrations.help.show': 'Show a request: phase, components, preview and billing',
  'partnerMigrations.help.review': 'Confirm the domain of the site found in the backup',
  'partnerMigrations.help.approve': 'Approve the preview so BladeCP finishes the migration',
  'partnerMigrations.help.cancel': 'Cancel a request that is not approved yet',
  'partnerMigrations.help.retry': 'Try a failed migration again, when that is safe',
  'partnerMigrations.help.queue': 'List the requests waiting for the billing WHMCS',
  'partnerMigrations.help.link': 'Link a request to its client and service in the billing WHMCS',
  'partnerMigrations.help.claim': 'Get the address where the account holder confirms the account',
  'partnerMigrations.help.listDesc':
    'The Fast Deploy requests made by one WHMCS installation, newest first, with the phase of each migration. --client keeps only the requests of one client.',
  'partnerMigrations.help.scopeNote':
    'A request is named by the WHMCS installation and the client that made it: --installation is the BladeCP installation ID of that WHMCS, and --client the client ID in it. The BladeCP WHMCS module sends the same values.',
  'partnerMigrations.help.showDesc':
    'The phase of the migration, its components, the preview address, the billing link and the payment, and what to do next. With --watch, it follows the request until it needs someone or ends.',
  'partnerMigrations.help.requestArg':
    'The request ID, or its first characters (at least 4) when only one request of the client starts with them.',
  'partnerMigrations.help.reviewDesc':
    'After BladeCP reads the backup, the migration waits for the domain of the site. This sends it, and the migration continues.',
  'partnerMigrations.help.approveDesc':
    'When the preview is ready, the approval tells BladeCP to move the site to its final place. Asks first on a terminal.',
  'partnerMigrations.help.approveNote':
    'Outside a free trial, the approval waits for the payment of the client in WHMCS.',
  'partnerMigrations.help.cancelDesc':
    'Stops the migration for good. The old site is not touched. Asks first on a terminal, and Enter keeps the request.',
  'partnerMigrations.help.retryDesc':
    'Starts a new attempt of a failed migration from the same backup, when BladeCP says it is safe. When it is not, the command says why.',
  'partnerMigrations.help.queueDesc':
    'The cPanel Migrator requests that wait for the billing WHMCS to create the client and the service, oldest first. The BladeCP WHMCS module reads this queue on its own; use the list to follow it or to link a request by hand.',
  'partnerMigrations.help.linkDesc':
    'Links a request of the billing queue to the client and the service you created in the billing WHMCS. BladeCP finds or creates the account by the email, and the migration continues. The BladeCP WHMCS module does this on its own; use the command to link by hand.',
  'partnerMigrations.help.queueArg':
    'The request ID, or its first characters (at least 4) when only one request of the billing queue starts with them.',
  'partnerMigrations.help.linkNote':
    'A link cannot be changed: the same client and service again give the same link, another pair is refused. Asks first on a terminal.',
  'partnerMigrations.help.claimDesc':
    'For a migration the account holder started in cPanel: an address of your client area where they sign in and confirm the account, so the billing WHMCS can link it.',
  'partnerMigrations.help.claimNote':
    'Each run makes a new address, valid for 24 hours; the earlier ones keep working until they expire. The address grants nothing by itself: the account holder still signs in to your client area.',
  'partnerMigrations.ex.list': 'The requests of client 42',
  'partnerMigrations.ex.listAll': 'Every request of the installation, for scripts',
  'partnerMigrations.ex.show': 'Phase, preview and billing of a request',
  'partnerMigrations.ex.watch': 'Follow it until it needs someone or ends',
  'partnerMigrations.ex.review': 'Confirm the domain of the site',
  'partnerMigrations.ex.approve': 'Approve the preview',
  'partnerMigrations.ex.cancel': 'Cancel without asking',
  'partnerMigrations.ex.retry': 'Try a failed migration again',
  'partnerMigrations.ex.queue': 'What waits for the billing WHMCS',
  'partnerMigrations.ex.queueJson': 'The whole queue, for scripts',
  'partnerMigrations.ex.link': 'Link a request to client 42 and service 4242',
  'partnerMigrations.ex.claim': 'The address to send to the account holder',
  'partnerMigrations.exit.ok': 'preview ready or migration complete',
  'partnerMigrations.exit.failed': 'the migration failed or was cancelled',
  'partnerMigrations.exit.action': 'waits for someone (the domain, the backup or the billing link)',
  'partnerMigrations.option.installation':
    'The WHMCS installation that made the request (its BladeCP installation ID, a UUID)',
  'partnerMigrations.option.client':
    'The client of that installation the request belongs to (its client ID in WHMCS)',
  'partnerMigrations.option.clientFilter': 'Only the requests of this client (its ID in WHMCS)',
  'partnerMigrations.option.company': 'Company of the client, when there is one',
  'partnerMigrations.option.limit': 'How many to show per page (1 to 100, 50 by default)',
  'partnerMigrations.option.all': 'Read every page, not only the first one',
  'partnerMigrations.option.watch': 'Keep following the request until it needs someone or ends',
  'partnerMigrations.option.billingInstallation':
    'The billing WHMCS that links the request (its BladeCP installation ID)',
  'partnerMigrations.option.billingClient': 'The client ID in the billing WHMCS',
  'partnerMigrations.option.service': 'The service ID in the billing WHMCS',
  'partnerMigrations.option.ownerEmail':
    'Email of the client (BladeCP finds or creates the account by it)',
  'partnerMigrations.option.ownerName':
    'Name of the client: the first word is the first name, the rest the last name',
  'partnerMigrations.error.installation':
    '--installation needs the BladeCP installation ID of the WHMCS (a UUID), got "{value}".',
  'partnerMigrations.error.client': 'The client ID has at most 191 characters, got "{value}".',
  'partnerMigrations.error.limit': '--limit takes a number from 1 to {max}.',
  'partnerMigrations.error.wholeId':
    'Too many requests to find "{value}" by its first characters. Use the whole request ID.',
  'partnerMigrations.error.reason': 'The reason has at most {max} characters.',
  'partnerMigrations.error.email': '"{value}" is not a valid email address.',
  'partnerMigrations.error.name':
    'The first name and the last name have at most {max} characters each.',
  'partnerMigrations.error.company': 'The company name has at most {max} characters.',
  'partnerMigrations.error.nativeId': '{option} needs a numeric ID of WHMCS, got "{value}".',
  'partnerMigrations.refused.notFound':
    'Check the request ID, and that --installation and --client are the installation and the client that made it.',
  'partnerMigrations.refused.payment':
    'The client has not paid in WHMCS yet. Outside a free trial, the approval waits for the payment.',
  'partnerMigrations.refused.approval':
    'Only a request ready for review can be approved. See where it is with bladecp partner migrations show.',
  'partnerMigrations.refused.cancel': 'A migration can only be cancelled before it is approved.',
  'partnerMigrations.refused.linkConflict':
    'This request is already linked to another client or service, or another installation is confirming it.',
  'partnerMigrations.refused.notLinkable':
    'Only a request waiting in the billing queue can be linked. See the queue with bladecp partner migrations billing-queue.',
  'partnerMigrations.refused.claimNotRequired':
    'This request does not wait for the account holder to confirm the account.',
  'partnerMigrations.refused.claimNotAllowed':
    'Only a migration the account holder started in cPanel is confirmed in the client area.',
  'partnerMigrations.refused.claimUnavailable':
    'The billing WHMCS did not send the address of its client area for this request.',
  'partnerMigrations.phase.billing': 'Waiting for the billing WHMCS',
  'partnerMigrations.phase.claim': 'Waiting for the account holder to confirm',
  'partnerMigrations.state.awaiting_payment': 'Waiting for payment',
  'partnerMigrations.state.ready': 'Ready',
  'partnerMigrations.state.paid': 'Paid',
  'partnerMigrations.state.payment_due': 'Payment due',
  'partnerMigrations.state.trial_active': 'Trial running',
  'partnerMigrations.state.suspension_pending': 'Suspension requested',
  'partnerMigrations.state.suspended': 'Suspended',
  'partnerMigrations.state.termination_pending': 'Termination requested',
  'partnerMigrations.state.terminated': 'Terminated',
  'partnerMigrations.state.regularized': 'Regularized',
  'partnerMigrations.link.pending': 'Waiting for the billing WHMCS',
  'partnerMigrations.link.claim': 'Waiting for the account holder to confirm the account',
  'partnerMigrations.link.linked': 'Linked',
  'partnerMigrations.mode.before': 'Payment before the migration',
  'partnerMigrations.mode.after': 'Payment after the migration',
  'partnerMigrations.mode.trialDays': 'Trial of {days} days',
  'partnerMigrations.mode.trial': 'Trial',
  'partnerMigrations.mode.beforeShort': 'Payment first',
  'partnerMigrations.mode.afterShort': 'Payment later',
  'partnerMigrations.retryReason.attempt_used':
    'A new attempt is not available: this request already had its new attempt. Start a new migration request.',
  'partnerMigrations.retryReason.backup_unavailable':
    'A new attempt is not available: the backup of this request is no longer stored. Start a new migration request with the backup.',
  'partnerMigrations.retryReason.discovery_review_expired':
    'A new attempt is not available: the domain was not confirmed in time and the backup expired. Start a new migration request.',
  'partnerMigrations.next.claim':
    'The account holder must confirm the account in your client area. Get the address to send:',
  'partnerMigrations.next.billing':
    'The billing WHMCS has not linked this request to a client and a service yet. It is in the billing queue:',
  'partnerMigrations.next.upload':
    'BladeCP is waiting for the backup of the site, sent by the tool that made the request.',
  'partnerMigrations.next.payment': 'The approval waits for the payment of the client in WHMCS.',
  'partnerMigrations.label.request': 'Request',
  'partnerMigrations.label.client': 'Client',
  'partnerMigrations.label.installation': 'Installation',
  'partnerMigrations.label.plan': 'Plan',
  'partnerMigrations.label.link': 'Billing link',
  'partnerMigrations.label.mode': 'Mode',
  'partnerMigrations.label.payment': 'Status',
  'partnerMigrations.label.service': 'WHMCS service',
  'partnerMigrations.label.due': 'Due',
  'partnerMigrations.planValue': '{plan} (location {location})',
  'partnerMigrations.section.billing': 'Billing',
  'partnerMigrations.pointDomain':
    'Pointing the domain is optional: the old site stays online until the client points it.',
  'partnerMigrations.checkEnded':
    'The automatic check of the domain has ended. This does not affect the migration.',
  'partnerMigrations.column.client': 'CLIENT',
  'partnerMigrations.column.account': 'ACCOUNT',
  'partnerMigrations.column.server': 'SERVER',
  'partnerMigrations.column.mode': 'BILLING',
  'partnerMigrations.list.emptyInstallation': 'This installation has no Fast Deploy request yet.',
  'partnerMigrations.list.empty': 'This client has no Fast Deploy request yet.',
  'partnerMigrations.list.countOne': '{count} request',
  'partnerMigrations.list.countMany': '{count} requests',
  'partnerMigrations.list.actionOne': '{count} waits for someone',
  'partnerMigrations.list.action': '{count} wait for someone',
  'partnerMigrations.list.more': 'There are more requests. Add --all to read every page.',
  'partnerMigrations.list.hint': 'Details of one request:',
  'partnerMigrations.approve.detail':
    'BladeCP moves the site to its final place. The old site stays online until the client points the domain.',
  'partnerMigrations.retry.done': 'A new attempt started.',
  'partnerMigrations.queue.empty': 'No request is waiting for the billing WHMCS.',
  'partnerMigrations.queue.countOne': '{count} request waiting for the billing WHMCS',
  'partnerMigrations.queue.countMany': '{count} requests waiting for the billing WHMCS',
  'partnerMigrations.queue.hint':
    'The BladeCP WHMCS module links them on its own. To link one by hand:',
  'partnerMigrations.link.confirm': 'Link the migration of {domain} to service {service}?',
  'partnerMigrations.link.confirmNoDomain': 'Link this request to service {service}?',
  'partnerMigrations.link.detailOwner': 'Client {client} · {email}',
  'partnerMigrations.link.detail':
    'BladeCP finds or creates the account by the email and the migration continues. The link cannot be changed later.',
  'partnerMigrations.link.done': 'Request linked to service {service}. The migration continues.',
  'partnerMigrations.claim.label': 'Address where the account holder confirms the account',
  'partnerMigrations.claim.note':
    'Send it to the account holder: they sign in to your client area and confirm the account. It works until {date}; running the command again makes a new address.',
  'partnerMigrations.claim.noteNoDate':
    'Send it to the account holder: they sign in to your client area and confirm the account. It works for 24 hours; running the command again makes a new address.',
};

export const ptBR: Record<keyof typeof en, string> = {
  'partnerMigrations.help.topic':
    'Fazer o Fast Deploy dos seus clientes: solicitações do WHMCS, fila de cobrança e confirmação de conta',
  'partnerMigrations.help.list': 'Listar as solicitações de Fast Deploy de uma instalação do WHMCS',
  'partnerMigrations.help.show': 'Mostrar uma solicitação: etapa, componentes, prévia e cobrança',
  'partnerMigrations.help.review': 'Confirmar o domínio do site encontrado no backup',
  'partnerMigrations.help.approve': 'Aprovar a prévia para a BladeCP concluir a migração',
  'partnerMigrations.help.cancel': 'Cancelar uma solicitação ainda não aprovada',
  'partnerMigrations.help.retry': 'Tentar de novo uma migração que falhou, quando é seguro',
  'partnerMigrations.help.queue': 'Listar as solicitações que aguardam o WHMCS de cobrança',
  'partnerMigrations.help.link':
    'Vincular uma solicitação ao cliente e ao serviço no WHMCS de cobrança',
  'partnerMigrations.help.claim': 'Obter o endereço onde o titular confirma a conta',
  'partnerMigrations.help.listDesc':
    'As solicitações de Fast Deploy feitas por uma instalação do WHMCS, das mais novas para as mais antigas, com a etapa de cada migração. --client mostra só as solicitações de um cliente.',
  'partnerMigrations.help.scopeNote':
    'Uma solicitação é identificada pela instalação do WHMCS e pelo cliente que a fizeram: --installation é o ID dessa instalação na BladeCP, e --client o ID do cliente nela. O módulo WHMCS da BladeCP envia os mesmos valores.',
  'partnerMigrations.help.showDesc':
    'A etapa da migração, os componentes, o endereço da prévia, o vínculo de cobrança e o pagamento, e o que fazer em seguida. Com --watch, acompanha a solicitação até ela precisar de alguém ou terminar.',
  'partnerMigrations.help.requestArg':
    'O ID da solicitação, ou os primeiros caracteres dele (no mínimo 4) quando só uma solicitação do cliente começa com eles.',
  'partnerMigrations.help.reviewDesc':
    'Depois que a BladeCP lê o backup, a migração aguarda o domínio do site. Este comando o envia, e a migração continua.',
  'partnerMigrations.help.approveDesc':
    'Quando a prévia está pronta, a aprovação diz à BladeCP para levar o site ao lugar definitivo. No terminal, pergunta antes.',
  'partnerMigrations.help.approveNote':
    'Fora de um período de teste grátis, a aprovação aguarda o pagamento do cliente no WHMCS.',
  'partnerMigrations.help.cancelDesc':
    'Para a migração de vez. O site antigo não é tocado. No terminal, pergunta antes, e Enter mantém a solicitação.',
  'partnerMigrations.help.retryDesc':
    'Começa uma nova tentativa de uma migração que falhou, com o mesmo backup, quando a BladeCP diz que é seguro. Quando não é, o comando diz o motivo.',
  'partnerMigrations.help.queueDesc':
    'As solicitações do cPanel Migrator que aguardam o WHMCS de cobrança criar o cliente e o serviço, das mais antigas para as mais novas. O módulo WHMCS da BladeCP lê esta fila sozinho; use a lista para acompanhar ou para vincular uma solicitação manualmente.',
  'partnerMigrations.help.linkDesc':
    'Vincula uma solicitação da fila de cobrança ao cliente e ao serviço que você criou no WHMCS de cobrança. A BladeCP encontra ou cria a conta pelo e-mail, e a migração continua. O módulo WHMCS da BladeCP faz isso sozinho; use o comando para vincular manualmente.',
  'partnerMigrations.help.queueArg':
    'O ID da solicitação, ou os primeiros caracteres dele (no mínimo 4) quando só uma solicitação da fila de cobrança começa com eles.',
  'partnerMigrations.help.linkNote':
    'O vínculo não pode ser trocado: o mesmo cliente e serviço de novo dão o mesmo vínculo, outro par é recusado. No terminal, pergunta antes.',
  'partnerMigrations.help.claimDesc':
    'Para uma migração que o titular da conta começou no cPanel: um endereço da sua área do cliente onde ele entra e confirma a conta, para o WHMCS de cobrança poder vinculá-la.',
  'partnerMigrations.help.claimNote':
    'Cada execução gera um endereço novo, válido por 24 horas; os anteriores continuam valendo até expirar. O endereço não dá acesso a nada sozinho: o titular ainda entra na sua área do cliente.',
  'partnerMigrations.ex.list': 'As solicitações do cliente 42',
  'partnerMigrations.ex.listAll': 'Todas as solicitações da instalação, para scripts',
  'partnerMigrations.ex.show': 'Etapa, prévia e cobrança de uma solicitação',
  'partnerMigrations.ex.watch': 'Acompanhar até precisar de alguém ou terminar',
  'partnerMigrations.ex.review': 'Confirmar o domínio do site',
  'partnerMigrations.ex.approve': 'Aprovar a prévia',
  'partnerMigrations.ex.cancel': 'Cancelar sem perguntar',
  'partnerMigrations.ex.retry': 'Tentar de novo uma migração que falhou',
  'partnerMigrations.ex.queue': 'O que aguarda o WHMCS de cobrança',
  'partnerMigrations.ex.queueJson': 'A fila inteira, para scripts',
  'partnerMigrations.ex.link': 'Vincular uma solicitação ao cliente 42 e ao serviço 4242',
  'partnerMigrations.ex.claim': 'O endereço para enviar ao titular da conta',
  'partnerMigrations.exit.ok': 'prévia pronta ou migração concluída',
  'partnerMigrations.exit.failed': 'a migração falhou ou foi cancelada',
  'partnerMigrations.exit.action': 'aguarda alguém (o domínio, o backup ou o vínculo de cobrança)',
  'partnerMigrations.option.installation':
    'A instalação do WHMCS que fez a solicitação (o ID dela na BladeCP, um UUID)',
  'partnerMigrations.option.client':
    'O cliente dessa instalação a quem a solicitação pertence (o ID dele no WHMCS)',
  'partnerMigrations.option.clientFilter': 'Só as solicitações deste cliente (o ID dele no WHMCS)',
  'partnerMigrations.option.company': 'Empresa do cliente, quando houver',
  'partnerMigrations.option.limit': 'Quantas mostrar por página (de 1 a 100, 50 por padrão)',
  'partnerMigrations.option.all': 'Ler todas as páginas, não só a primeira',
  'partnerMigrations.option.watch':
    'Acompanhar a solicitação até ela precisar de alguém ou terminar',
  'partnerMigrations.option.billingInstallation':
    'O WHMCS de cobrança que vincula a solicitação (o ID da instalação na BladeCP)',
  'partnerMigrations.option.billingClient': 'O ID do cliente no WHMCS de cobrança',
  'partnerMigrations.option.service': 'O ID do serviço no WHMCS de cobrança',
  'partnerMigrations.option.ownerEmail':
    'E-mail do cliente (a BladeCP encontra ou cria a conta por ele)',
  'partnerMigrations.option.ownerName':
    'Nome do cliente: a primeira palavra é o nome, o resto é o sobrenome',
  'partnerMigrations.error.installation':
    '--installation precisa do ID da instalação do WHMCS na BladeCP (um UUID), recebeu "{value}".',
  'partnerMigrations.error.client':
    'O ID do cliente tem no máximo 191 caracteres, recebeu "{value}".',
  'partnerMigrations.error.limit': '--limit aceita um número de 1 a {max}.',
  'partnerMigrations.error.wholeId':
    'Há solicitações demais para achar "{value}" pelos primeiros caracteres. Use o ID inteiro da solicitação.',
  'partnerMigrations.error.reason': 'O motivo tem no máximo {max} caracteres.',
  'partnerMigrations.error.email': '"{value}" não é um endereço de e-mail válido.',
  'partnerMigrations.error.name': 'O nome e o sobrenome têm no máximo {max} caracteres cada.',
  'partnerMigrations.error.company': 'O nome da empresa tem no máximo {max} caracteres.',
  'partnerMigrations.error.nativeId':
    '{option} precisa de um ID numérico do WHMCS, recebeu "{value}".',
  'partnerMigrations.refused.notFound':
    'Confira o ID da solicitação, e se --installation e --client são a instalação e o cliente que a fizeram.',
  'partnerMigrations.refused.payment':
    'O cliente ainda não pagou no WHMCS. Fora de um período de teste grátis, a aprovação aguarda o pagamento.',
  'partnerMigrations.refused.approval':
    'Só uma solicitação pronta para revisão pode ser aprovada. Veja em que ponto ela está com bladecp partner migrations show.',
  'partnerMigrations.refused.cancel': 'Uma migração só pode ser cancelada antes de ser aprovada.',
  'partnerMigrations.refused.linkConflict':
    'Esta solicitação já está vinculada a outro cliente ou serviço, ou outra instalação está confirmando a conta.',
  'partnerMigrations.refused.notLinkable':
    'Só uma solicitação que aguarda na fila de cobrança pode ser vinculada. Veja a fila com bladecp partner migrations billing-queue.',
  'partnerMigrations.refused.claimNotRequired':
    'Esta solicitação não aguarda o titular confirmar a conta.',
  'partnerMigrations.refused.claimNotAllowed':
    'Só uma migração que o titular da conta começou no cPanel é confirmada na área do cliente.',
  'partnerMigrations.refused.claimUnavailable':
    'O WHMCS de cobrança não enviou o endereço da área do cliente para esta solicitação.',
  'partnerMigrations.phase.billing': 'Aguardando o WHMCS de cobrança',
  'partnerMigrations.phase.claim': 'Aguardando o titular confirmar a conta',
  'partnerMigrations.state.awaiting_payment': 'Aguardando pagamento',
  'partnerMigrations.state.ready': 'Pronta',
  'partnerMigrations.state.paid': 'Paga',
  'partnerMigrations.state.payment_due': 'Pagamento em aberto',
  'partnerMigrations.state.trial_active': 'Teste em andamento',
  'partnerMigrations.state.suspension_pending': 'Suspensão solicitada',
  'partnerMigrations.state.suspended': 'Suspensa',
  'partnerMigrations.state.termination_pending': 'Encerramento solicitado',
  'partnerMigrations.state.terminated': 'Encerrada',
  'partnerMigrations.state.regularized': 'Regularizada',
  'partnerMigrations.link.pending': 'Aguardando o WHMCS de cobrança',
  'partnerMigrations.link.claim': 'Aguardando o titular confirmar a conta',
  'partnerMigrations.link.linked': 'Vinculada',
  'partnerMigrations.mode.before': 'Pagamento antes da migração',
  'partnerMigrations.mode.after': 'Pagamento depois da migração',
  'partnerMigrations.mode.trialDays': 'Teste de {days} dias',
  'partnerMigrations.mode.trial': 'Teste',
  'partnerMigrations.mode.beforeShort': 'Pagamento antes',
  'partnerMigrations.mode.afterShort': 'Pagamento depois',
  'partnerMigrations.retryReason.attempt_used':
    'Nova tentativa indisponível: esta solicitação já teve a nova tentativa. Comece uma nova solicitação de migração.',
  'partnerMigrations.retryReason.backup_unavailable':
    'Nova tentativa indisponível: o backup desta solicitação não está mais guardado. Comece uma nova solicitação de migração com o backup.',
  'partnerMigrations.retryReason.discovery_review_expired':
    'Nova tentativa indisponível: o domínio não foi confirmado a tempo e o backup expirou. Comece uma nova solicitação de migração.',
  'partnerMigrations.next.claim':
    'O titular precisa confirmar a conta na sua área do cliente. Obtenha o endereço para enviar:',
  'partnerMigrations.next.billing':
    'O WHMCS de cobrança ainda não vinculou esta solicitação a um cliente e a um serviço. Ela está na fila de cobrança:',
  'partnerMigrations.next.upload':
    'A BladeCP aguarda o backup do site, enviado pela ferramenta que fez a solicitação.',
  'partnerMigrations.next.payment': 'A aprovação aguarda o pagamento do cliente no WHMCS.',
  'partnerMigrations.label.request': 'Solicitação',
  'partnerMigrations.label.client': 'Cliente',
  'partnerMigrations.label.installation': 'Instalação',
  'partnerMigrations.label.plan': 'Plano',
  'partnerMigrations.label.link': 'Vínculo de cobrança',
  'partnerMigrations.label.mode': 'Modalidade',
  'partnerMigrations.label.payment': 'Situação',
  'partnerMigrations.label.service': 'Serviço no WHMCS',
  'partnerMigrations.label.due': 'Vencimento',
  'partnerMigrations.planValue': '{plan} (local {location})',
  'partnerMigrations.section.billing': 'Cobrança',
  'partnerMigrations.pointDomain':
    'Apontar o domínio é opcional: o site antigo continua no ar até o cliente apontar.',
  'partnerMigrations.checkEnded':
    'A verificação automática do domínio foi encerrada. Isso não afeta a migração.',
  'partnerMigrations.column.client': 'CLIENTE',
  'partnerMigrations.column.account': 'CONTA',
  'partnerMigrations.column.server': 'SERVIDOR',
  'partnerMigrations.column.mode': 'COBRANÇA',
  'partnerMigrations.list.emptyInstallation':
    'Esta instalação ainda não tem solicitações de Fast Deploy.',
  'partnerMigrations.list.empty': 'Este cliente ainda não tem solicitações de Fast Deploy.',
  'partnerMigrations.list.countOne': '{count} solicitação',
  'partnerMigrations.list.countMany': '{count} solicitações',
  'partnerMigrations.list.actionOne': '{count} aguarda alguém',
  'partnerMigrations.list.action': '{count} aguardam alguém',
  'partnerMigrations.list.more': 'Há mais solicitações. Adicione --all para ler todas as páginas.',
  'partnerMigrations.list.hint': 'Detalhes de uma solicitação:',
  'partnerMigrations.approve.detail':
    'A BladeCP leva o site para o lugar definitivo. O site antigo continua no ar até o cliente apontar o domínio.',
  'partnerMigrations.retry.done': 'Uma nova tentativa começou.',
  'partnerMigrations.queue.empty': 'Nenhuma solicitação aguarda o WHMCS de cobrança.',
  'partnerMigrations.queue.countOne': '{count} solicitação aguardando o WHMCS de cobrança',
  'partnerMigrations.queue.countMany': '{count} solicitações aguardando o WHMCS de cobrança',
  'partnerMigrations.queue.hint':
    'O módulo WHMCS da BladeCP vincula sozinho. Para vincular uma manualmente:',
  'partnerMigrations.link.confirm': 'Vincular a migração de {domain} ao serviço {service}?',
  'partnerMigrations.link.confirmNoDomain': 'Vincular esta solicitação ao serviço {service}?',
  'partnerMigrations.link.detailOwner': 'Cliente {client} · {email}',
  'partnerMigrations.link.detail':
    'A BladeCP encontra ou cria a conta pelo e-mail e a migração continua. O vínculo não pode ser trocado depois.',
  'partnerMigrations.link.done': 'Solicitação vinculada ao serviço {service}. A migração continua.',
  'partnerMigrations.claim.label': 'Endereço onde o titular confirma a conta',
  'partnerMigrations.claim.note':
    'Envie ao titular da conta: ele entra na sua área do cliente e confirma a conta. Vale até {date}; rodar o comando de novo gera um endereço novo.',
  'partnerMigrations.claim.noteNoDate':
    'Envie ao titular da conta: ele entra na sua área do cliente e confirma a conta. Vale por 24 horas; rodar o comando de novo gera um endereço novo.',
};

export const es: Record<keyof typeof en, string> = {
  'partnerMigrations.help.topic':
    'Hacer el Fast Deploy de tus clientes: solicitudes de WHMCS, cola de facturación y confirmación de cuenta',
  'partnerMigrations.help.list':
    'Listar las solicitudes de Fast Deploy de una instalación de WHMCS',
  'partnerMigrations.help.show':
    'Mostrar una solicitud: etapa, componentes, vista previa y facturación',
  'partnerMigrations.help.review': 'Confirmar el dominio del sitio encontrado en el respaldo',
  'partnerMigrations.help.approve': 'Aprobar la vista previa para que BladeCP termine la migración',
  'partnerMigrations.help.cancel': 'Cancelar una solicitud que aún no está aprobada',
  'partnerMigrations.help.retry': 'Reintentar una migración que falló, cuando es seguro',
  'partnerMigrations.help.queue': 'Listar las solicitudes que esperan al WHMCS de facturación',
  'partnerMigrations.help.link':
    'Vincular una solicitud a su cliente y servicio en el WHMCS de facturación',
  'partnerMigrations.help.claim': 'Obtener la dirección donde el titular confirma la cuenta',
  'partnerMigrations.help.listDesc':
    'Las solicitudes de Fast Deploy hechas por una instalación de WHMCS, de la más nueva a la más antigua, con la etapa de cada migración. --client muestra solo las solicitudes de un cliente.',
  'partnerMigrations.help.scopeNote':
    'Una solicitud se identifica por la instalación de WHMCS y el cliente que la hicieron: --installation es el ID de esa instalación en BladeCP, y --client el ID del cliente en ella. El módulo WHMCS de BladeCP envía los mismos valores.',
  'partnerMigrations.help.showDesc':
    'La etapa de la migración, sus componentes, la dirección de la vista previa, el vínculo de facturación y el pago, y qué hacer después. Con --watch, sigue la solicitud hasta que necesite a alguien o termine.',
  'partnerMigrations.help.requestArg':
    'El ID de la solicitud, o sus primeros caracteres (al menos 4) cuando solo una solicitud del cliente empieza con ellos.',
  'partnerMigrations.help.reviewDesc':
    'Después de que BladeCP lee el respaldo, la migración espera el dominio del sitio. Este comando lo envía, y la migración continúa.',
  'partnerMigrations.help.approveDesc':
    'Cuando la vista previa está lista, la aprobación le indica a BladeCP que lleve el sitio a su lugar definitivo. En la terminal, pregunta antes.',
  'partnerMigrations.help.approveNote':
    'Fuera de un período de prueba gratis, la aprobación espera el pago del cliente en WHMCS.',
  'partnerMigrations.help.cancelDesc':
    'Detiene la migración para siempre. El sitio antiguo no se toca. En la terminal, pregunta antes, y Enter mantiene la solicitud.',
  'partnerMigrations.help.retryDesc':
    'Comienza un nuevo intento de una migración que falló, con el mismo respaldo, cuando BladeCP dice que es seguro. Cuando no lo es, el comando dice por qué.',
  'partnerMigrations.help.queueDesc':
    'Las solicitudes del cPanel Migrator que esperan que el WHMCS de facturación cree el cliente y el servicio, de la más antigua a la más nueva. El módulo WHMCS de BladeCP lee esta cola solo; usa la lista para seguirla o para vincular una solicitud a mano.',
  'partnerMigrations.help.linkDesc':
    'Vincula una solicitud de la cola de facturación al cliente y al servicio que creaste en el WHMCS de facturación. BladeCP encuentra o crea la cuenta con el correo, y la migración continúa. El módulo WHMCS de BladeCP lo hace solo; usa el comando para vincular a mano.',
  'partnerMigrations.help.queueArg':
    'El ID de la solicitud, o sus primeros caracteres (al menos 4) cuando solo una solicitud de la cola de facturación empieza con ellos.',
  'partnerMigrations.help.linkNote':
    'El vínculo no se puede cambiar: el mismo cliente y servicio de nuevo dan el mismo vínculo, otro par se rechaza. En la terminal, pregunta antes.',
  'partnerMigrations.help.claimDesc':
    'Para una migración que el titular de la cuenta empezó en cPanel: una dirección de tu área de clientes donde inicia sesión y confirma la cuenta, para que el WHMCS de facturación pueda vincularla.',
  'partnerMigrations.help.claimNote':
    'Cada ejecución genera una dirección nueva, válida por 24 horas; las anteriores siguen sirviendo hasta que expiran. La dirección no da acceso a nada por sí sola: el titular igual inicia sesión en tu área de clientes.',
  'partnerMigrations.ex.list': 'Las solicitudes del cliente 42',
  'partnerMigrations.ex.listAll': 'Todas las solicitudes de la instalación, para scripts',
  'partnerMigrations.ex.show': 'Etapa, vista previa y facturación de una solicitud',
  'partnerMigrations.ex.watch': 'Seguirla hasta que necesite a alguien o termine',
  'partnerMigrations.ex.review': 'Confirmar el dominio del sitio',
  'partnerMigrations.ex.approve': 'Aprobar la vista previa',
  'partnerMigrations.ex.cancel': 'Cancelar sin preguntar',
  'partnerMigrations.ex.retry': 'Reintentar una migración que falló',
  'partnerMigrations.ex.queue': 'Lo que espera al WHMCS de facturación',
  'partnerMigrations.ex.queueJson': 'La cola entera, para scripts',
  'partnerMigrations.ex.link': 'Vincular una solicitud al cliente 42 y al servicio 4242',
  'partnerMigrations.ex.claim': 'La dirección para enviar al titular de la cuenta',
  'partnerMigrations.exit.ok': 'vista previa lista o migración completa',
  'partnerMigrations.exit.failed': 'la migración falló o fue cancelada',
  'partnerMigrations.exit.action':
    'espera a alguien (el dominio, el respaldo o el vínculo de facturación)',
  'partnerMigrations.option.installation':
    'La instalación de WHMCS que hizo la solicitud (su ID en BladeCP, un UUID)',
  'partnerMigrations.option.client':
    'El cliente de esa instalación al que pertenece la solicitud (su ID en WHMCS)',
  'partnerMigrations.option.clientFilter': 'Solo las solicitudes de este cliente (su ID en WHMCS)',
  'partnerMigrations.option.company': 'Empresa del cliente, si la hay',
  'partnerMigrations.option.limit': 'Cuántas mostrar por página (de 1 a 100, 50 por defecto)',
  'partnerMigrations.option.all': 'Leer todas las páginas, no solo la primera',
  'partnerMigrations.option.watch': 'Seguir la solicitud hasta que necesite a alguien o termine',
  'partnerMigrations.option.billingInstallation':
    'El WHMCS de facturación que vincula la solicitud (el ID de la instalación en BladeCP)',
  'partnerMigrations.option.billingClient': 'El ID del cliente en el WHMCS de facturación',
  'partnerMigrations.option.service': 'El ID del servicio en el WHMCS de facturación',
  'partnerMigrations.option.ownerEmail':
    'Correo del cliente (BladeCP encuentra o crea la cuenta con él)',
  'partnerMigrations.option.ownerName':
    'Nombre del cliente: la primera palabra es el nombre, el resto el apellido',
  'partnerMigrations.error.installation':
    '--installation necesita el ID de la instalación de WHMCS en BladeCP (un UUID), se recibió "{value}".',
  'partnerMigrations.error.client':
    'El ID del cliente tiene como máximo 191 caracteres, se recibió "{value}".',
  'partnerMigrations.error.limit': '--limit acepta un número de 1 a {max}.',
  'partnerMigrations.error.wholeId':
    'Hay demasiadas solicitudes para encontrar "{value}" por sus primeros caracteres. Usa el ID completo de la solicitud.',
  'partnerMigrations.error.reason': 'El motivo tiene como máximo {max} caracteres.',
  'partnerMigrations.error.email': '"{value}" no es una dirección de correo válida.',
  'partnerMigrations.error.name':
    'El nombre y el apellido tienen como máximo {max} caracteres cada uno.',
  'partnerMigrations.error.company': 'El nombre de la empresa tiene como máximo {max} caracteres.',
  'partnerMigrations.error.nativeId':
    '{option} necesita un ID numérico de WHMCS, se recibió "{value}".',
  'partnerMigrations.refused.notFound':
    'Revisa el ID de la solicitud, y que --installation y --client sean la instalación y el cliente que la hicieron.',
  'partnerMigrations.refused.payment':
    'El cliente aún no pagó en WHMCS. Fuera de un período de prueba gratis, la aprobación espera el pago.',
  'partnerMigrations.refused.approval':
    'Solo se puede aprobar una solicitud lista para revisión. Mira en qué punto está con bladecp partner migrations show.',
  'partnerMigrations.refused.cancel': 'Una migración solo se puede cancelar antes de aprobarla.',
  'partnerMigrations.refused.linkConflict':
    'Esta solicitud ya está vinculada a otro cliente o servicio, u otra instalación está confirmando la cuenta.',
  'partnerMigrations.refused.notLinkable':
    'Solo se puede vincular una solicitud que espera en la cola de facturación. Mira la cola con bladecp partner migrations billing-queue.',
  'partnerMigrations.refused.claimNotRequired':
    'Esta solicitud no espera que el titular confirme la cuenta.',
  'partnerMigrations.refused.claimNotAllowed':
    'Solo una migración que el titular de la cuenta empezó en cPanel se confirma en el área de clientes.',
  'partnerMigrations.refused.claimUnavailable':
    'El WHMCS de facturación no envió la dirección de su área de clientes para esta solicitud.',
  'partnerMigrations.phase.billing': 'Esperando al WHMCS de facturación',
  'partnerMigrations.phase.claim': 'Esperando que el titular confirme la cuenta',
  'partnerMigrations.state.awaiting_payment': 'Esperando el pago',
  'partnerMigrations.state.ready': 'Lista',
  'partnerMigrations.state.paid': 'Pagada',
  'partnerMigrations.state.payment_due': 'Pago pendiente',
  'partnerMigrations.state.trial_active': 'Prueba en curso',
  'partnerMigrations.state.suspension_pending': 'Suspensión solicitada',
  'partnerMigrations.state.suspended': 'Suspendida',
  'partnerMigrations.state.termination_pending': 'Terminación solicitada',
  'partnerMigrations.state.terminated': 'Terminada',
  'partnerMigrations.state.regularized': 'Regularizada',
  'partnerMigrations.link.pending': 'Esperando al WHMCS de facturación',
  'partnerMigrations.link.claim': 'Esperando que el titular confirme la cuenta',
  'partnerMigrations.link.linked': 'Vinculada',
  'partnerMigrations.mode.before': 'Pago antes de la migración',
  'partnerMigrations.mode.after': 'Pago después de la migración',
  'partnerMigrations.mode.trialDays': 'Prueba de {days} días',
  'partnerMigrations.mode.trial': 'Prueba',
  'partnerMigrations.mode.beforeShort': 'Pago antes',
  'partnerMigrations.mode.afterShort': 'Pago después',
  'partnerMigrations.retryReason.attempt_used':
    'No hay nuevo intento disponible: esta solicitud ya tuvo su nuevo intento. Empieza una nueva solicitud de migración.',
  'partnerMigrations.retryReason.backup_unavailable':
    'No hay nuevo intento disponible: el respaldo de esta solicitud ya no está guardado. Empieza una nueva solicitud de migración con el respaldo.',
  'partnerMigrations.retryReason.discovery_review_expired':
    'No hay nuevo intento disponible: el dominio no se confirmó a tiempo y el respaldo expiró. Empieza una nueva solicitud de migración.',
  'partnerMigrations.next.claim':
    'El titular debe confirmar la cuenta en tu área de clientes. Obtén la dirección para enviar:',
  'partnerMigrations.next.billing':
    'El WHMCS de facturación aún no vinculó esta solicitud a un cliente y un servicio. Está en la cola de facturación:',
  'partnerMigrations.next.upload':
    'BladeCP espera el respaldo del sitio, enviado por la herramienta que hizo la solicitud.',
  'partnerMigrations.next.payment': 'La aprobación espera el pago del cliente en WHMCS.',
  'partnerMigrations.label.request': 'Solicitud',
  'partnerMigrations.label.client': 'Cliente',
  'partnerMigrations.label.installation': 'Instalación',
  'partnerMigrations.label.plan': 'Plan',
  'partnerMigrations.label.link': 'Vínculo de facturación',
  'partnerMigrations.label.mode': 'Modalidad',
  'partnerMigrations.label.payment': 'Estado',
  'partnerMigrations.label.service': 'Servicio en WHMCS',
  'partnerMigrations.label.due': 'Vencimiento',
  'partnerMigrations.planValue': '{plan} (ubicación {location})',
  'partnerMigrations.section.billing': 'Facturación',
  'partnerMigrations.pointDomain':
    'Apuntar el dominio es opcional: el sitio antiguo sigue en línea hasta que el cliente lo apunte.',
  'partnerMigrations.checkEnded':
    'La verificación automática del dominio terminó. Esto no afecta la migración.',
  'partnerMigrations.column.client': 'CLIENTE',
  'partnerMigrations.column.account': 'CUENTA',
  'partnerMigrations.column.server': 'SERVIDOR',
  'partnerMigrations.column.mode': 'FACTURACIÓN',
  'partnerMigrations.list.emptyInstallation':
    'Esta instalación aún no tiene solicitudes de Fast Deploy.',
  'partnerMigrations.list.empty': 'Este cliente aún no tiene solicitudes de Fast Deploy.',
  'partnerMigrations.list.countOne': '{count} solicitud',
  'partnerMigrations.list.countMany': '{count} solicitudes',
  'partnerMigrations.list.actionOne': '{count} espera a alguien',
  'partnerMigrations.list.action': '{count} esperan a alguien',
  'partnerMigrations.list.more': 'Hay más solicitudes. Agrega --all para leer todas las páginas.',
  'partnerMigrations.list.hint': 'Detalles de una solicitud:',
  'partnerMigrations.approve.detail':
    'BladeCP lleva el sitio a su lugar definitivo. El sitio antiguo sigue en línea hasta que el cliente apunte el dominio.',
  'partnerMigrations.retry.done': 'Comenzó un nuevo intento.',
  'partnerMigrations.queue.empty': 'Ninguna solicitud espera al WHMCS de facturación.',
  'partnerMigrations.queue.countOne': '{count} solicitud esperando al WHMCS de facturación',
  'partnerMigrations.queue.countMany': '{count} solicitudes esperando al WHMCS de facturación',
  'partnerMigrations.queue.hint':
    'El módulo WHMCS de BladeCP las vincula solo. Para vincular una a mano:',
  'partnerMigrations.link.confirm': '¿Vincular la migración de {domain} al servicio {service}?',
  'partnerMigrations.link.confirmNoDomain': '¿Vincular esta solicitud al servicio {service}?',
  'partnerMigrations.link.detailOwner': 'Cliente {client} · {email}',
  'partnerMigrations.link.detail':
    'BladeCP encuentra o crea la cuenta con el correo y la migración continúa. El vínculo no se puede cambiar después.',
  'partnerMigrations.link.done':
    'Solicitud vinculada al servicio {service}. La migración continúa.',
  'partnerMigrations.claim.label': 'Dirección donde el titular confirma la cuenta',
  'partnerMigrations.claim.note':
    'Envíala al titular de la cuenta: inicia sesión en tu área de clientes y confirma la cuenta. Sirve hasta {date}; ejecutar el comando de nuevo genera una dirección nueva.',
  'partnerMigrations.claim.noteNoDate':
    'Envíala al titular de la cuenta: inicia sesión en tu área de clientes y confirma la cuenta. Sirve por 24 horas; ejecutar el comando de nuevo genera una dirección nueva.',
};
