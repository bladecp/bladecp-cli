// Messages of the partner vibe commands. Keys start with "partnerVibe.".
// Every key exists in the three languages with the same {placeholders}, and
// the em dash is never used.

export const en = {
  'partnerVibe.help.topic': "Manage your customers' BladeCP Vibe accounts",
  'partnerVibe.help.find': 'Find the Vibe account of one of your services',
  'partnerVibe.help.show': 'Show a Vibe account',
  'partnerVibe.help.create': 'Create the Vibe account of a service',
  'partnerVibe.help.plan': 'Move a Vibe account to another plan',
  'partnerVibe.help.suspend': 'Suspend a Vibe account',
  'partnerVibe.help.reactivate': 'Reactivate a suspended Vibe account',
  'partnerVibe.help.resume': 'Bring a Vibe account back online after inactivity',
  'partnerVibe.help.terminate': 'Terminate a Vibe account for good',
  'partnerVibe.help.open': 'Sign in to Vibe as the account owner, with a one-time link',

  'partnerVibe.help.findDesc':
    'Looks up the Vibe account of one of your services by your own service ID, the one given as --external-id when the account was created (for example the WHMCS service ID). Use it to check whether a service has an account, for example after a create that was interrupted.',
  'partnerVibe.help.findNote':
    'No account is a normal answer (exit 0; with --json, found is false and account is null). An error never means no account: the command fails with its exit code.',
  'partnerVibe.help.externalArg':
    'Your ID for the service (1 to 191 characters), exactly as given when the account was created.',
  'partnerVibe.help.showDesc': 'Shows the status, plan and AI of one of your Vibe accounts.',
  'partnerVibe.help.accountArg': 'The whole ID of the Vibe account (a UUID).',
  'partnerVibe.help.accountNote':
    'Vibe accounts take the whole ID: there is no list to match the first characters against. "bladecp partner vibe find <external-id>" gives the ID from your service ID.',
  'partnerVibe.help.createDesc':
    'Creates the BladeCP Vibe account of one of your services, the same call the BladeCP WHMCS module makes. One account per service: when the service already has one, the API returns it and creates nothing.',
  'partnerVibe.help.createPlanNote':
    '--plan takes the UUID of one of your Vibe plans; "bladecp partner plans" lists them.',
  'partnerVibe.help.createFreeNote':
    "Free plans need --email-verification: you state, as the WHMCS module does, that the owner's email was verified (verified) or that your store does not require it (not-required). The CLI sends that statement with the current time.",
  'partnerVibe.help.createLinkNote':
    'When BladeCP requires a linked identity for new accounts, the API refuses with identity_link_required. The account is then created by the identity link of the WHMCS module, which the customer completes in the browser.',
  'partnerVibe.help.createAskNote':
    'On a terminal it asks first (Enter creates); --yes skips the question. Trying again never creates a second account.',
  'partnerVibe.help.planDesc':
    'Moves a Vibe account to another of your Vibe plans. A move from Pro to Free is refused, and a terminated account cannot change.',
  'partnerVibe.help.planArg': 'The UUID of the new Vibe plan ("bladecp partner plans" lists them).',
  'partnerVibe.help.planNote':
    'On a terminal it asks first (Enter moves); --yes skips the question.',
  'partnerVibe.help.suspendDesc':
    'Suspends a Vibe account: its apps stop serving and the owner cannot use Vibe until you reactivate it.',
  'partnerVibe.help.suspendNote':
    'On a terminal it asks first, and Enter keeps the account as it is; --yes skips the question. An account that is already suspended or terminated does not change.',
  'partnerVibe.help.reactivateDesc':
    'Returns a suspended Vibe account to active, and its apps serve again. BladeCP checks that the plan is still available.',
  'partnerVibe.help.repeatNote':
    'On a terminal it asks first (Enter goes on); --yes skips the question. An account that is already active or terminated does not change.',
  'partnerVibe.help.resumeDesc':
    'For an active Vibe account whose apps were paused for inactivity, records the activity and puts the apps back online. This is not the same as reactivate, which ends a suspension.',
  'partnerVibe.help.resumeNote':
    'Only active accounts: any other answers not found (exit 5). On a terminal it asks first (Enter goes on); --yes skips the question.',
  'partnerVibe.help.terminateDesc':
    'Terminates a Vibe account. This is final: the account can never be reactivated, change plan or sign in again.',
  'partnerVibe.help.terminateNote':
    'On a terminal it asks first, and Enter keeps the account; --yes skips the question. An account that is already terminated does not change.',
  'partnerVibe.help.openDesc':
    'Creates a one-time link that signs in to Vibe as the owner of an active account. On a terminal the CLI opens it in your browser; otherwise it prints the link. It works once and expires in 60 seconds: never save or share it.',
  'partnerVibe.help.openNote':
    'With --json the link is in data.url. Accounts that sign in through partner federation are refused with federation_required: they sign in from the WHMCS module.',

  'partnerVibe.ex.find': 'The account of service 4821',
  'partnerVibe.ex.findJson': 'The same, for scripts (found and account)',
  'partnerVibe.ex.show': 'The status and plan of an account',
  'partnerVibe.ex.create': 'Create the account of a service on a Pro plan',
  'partnerVibe.ex.createFree': 'On a Free plan, with the owner email already verified',
  'partnerVibe.ex.plan': 'Move to another plan, after the question',
  'partnerVibe.ex.suspend': 'Suspend without the question (scripts)',
  'partnerVibe.ex.reactivate': 'Reactivate after the question',
  'partnerVibe.ex.resume': 'Put the apps back online',
  'partnerVibe.ex.terminate': 'Terminate after the question (Enter keeps the account)',
  'partnerVibe.ex.open': 'Open Vibe as the account owner',
  'partnerVibe.ex.openJson': 'Only the link, for a script',

  'partnerVibe.option.externalId': 'Your ID for the service (for example the WHMCS service ID)',
  'partnerVibe.option.plan': 'UUID of the Vibe plan (see "bladecp partner plans")',
  'partnerVibe.option.email': 'Email of the account owner',
  'partnerVibe.option.name': 'Name of the account owner',
  'partnerVibe.option.emailVerification':
    "Free plans: the owner's email was verified, or your store does not require it",
  'partnerVibe.option.noBrowser': 'Print the one-time link instead of opening the browser',

  'partnerVibe.title': 'Vibe account',
  'partnerVibe.titlePlan': 'Vibe {plan} account',
  'partnerVibe.label.status': 'Status',
  'partnerVibe.label.account': 'Account',
  'partnerVibe.label.service': 'Service',
  'partnerVibe.label.plan': 'Plan',
  'partnerVibe.label.ai': 'AI',
  'partnerVibe.label.customer': 'Customer',
  'partnerVibe.label.planId': 'Plan ID',
  'partnerVibe.plan.free': 'Free',
  'partnerVibe.plan.pro': 'Pro',
  'partnerVibe.ai.managed': 'Managed by BladeCP',
  'partnerVibe.ai.partner': 'Your own AI provider',
  'partnerVibe.status.pending': 'Pending',
  'partnerVibe.status.active': 'Active',
  'partnerVibe.status.suspended': 'Suspended',
  'partnerVibe.status.terminated': 'Terminated',
  'partnerVibe.next.open': 'Sign the owner in with:',
  'partnerVibe.next.reactivate': 'Reactivate it with:',
  'partnerVibe.next.show': 'See the account with:',
  'partnerVibe.next.create': 'Create one with:',
  'partnerVibe.note.pending': 'BladeCP is still preparing this account.',
  'partnerVibe.note.terminated':
    'Termination is final: this account cannot be reactivated or changed.',
  'partnerVibe.find.none': 'No Vibe account for service {service}.',
  'partnerVibe.create.note':
    'One account per service: if the service already had one, this is it and nothing new was created.',

  'partnerVibe.confirm.create': 'Create this Vibe account?',
  'partnerVibe.confirm.service': 'Service {service}',
  'partnerVibe.confirm.planLine': 'Plan {plan}',
  'partnerVibe.confirm.owner': 'Owner {name} ({email})',
  'partnerVibe.confirm.move': 'Change the Vibe plan?',
  'partnerVibe.confirm.account': 'Account {account}',
  'partnerVibe.confirm.newPlan': 'New plan {plan}',
  'partnerVibe.confirm.suspend': 'Suspend this Vibe account?',
  'partnerVibe.confirm.suspendDetail':
    'Its apps stop serving and the owner cannot use Vibe until you reactivate it.',
  'partnerVibe.confirm.reactivate': 'Reactivate this Vibe account?',
  'partnerVibe.confirm.reactivateDetail': 'It becomes active and its apps serve again.',
  'partnerVibe.confirm.resume': 'Bring the apps back online?',
  'partnerVibe.confirm.resumeDetail': 'Its apps, paused for inactivity, serve again.',
  'partnerVibe.confirm.terminate': 'Terminate this Vibe account?',
  'partnerVibe.confirm.terminateDetail':
    'This is final: the account can never be reactivated, change plan or sign in again.',
  'partnerVibe.declined': 'Nothing was changed.',
  'partnerVibe.declinedCreate': 'Nothing was created.',

  'partnerVibe.done.plan': 'Plan changed to {plan}.',
  'partnerVibe.done.suspend': 'Vibe account suspended. Its apps stopped serving.',
  'partnerVibe.done.reactivate': 'Vibe account reactivated. Its apps serve again.',
  'partnerVibe.done.resume': 'Vibe account back online. Its apps serve again.',
  'partnerVibe.done.terminate': 'Vibe account terminated. This is final.',
  'partnerVibe.unchanged': 'Nothing changed. Account status: {status}.',

  'partnerVibe.open.opened':
    'Vibe opened in your browser, signed in as the account owner. The link works only once.',
  'partnerVibe.open.label': 'One-time Vibe sign-in link',
  'partnerVibe.open.labelFallback': 'The browser did not open. Open this link yourself:',
  'partnerVibe.open.note':
    'It works once and expires at {time}. Open it now; never save or share it.',

  'partnerVibe.error.accountId': 'Use the whole ID of the Vibe account (a UUID), got "{value}".',
  'partnerVibe.error.planId':
    'Use the UUID of a Vibe plan ("bladecp partner plans" lists them), got "{value}".',
  'partnerVibe.error.externalId': 'The service ID needs 1 to 191 characters, without line breaks.',
  'partnerVibe.error.email': '"{value}" is not a valid email address.',
  'partnerVibe.error.name': 'The owner name needs 1 to 200 characters.',
  'partnerVibe.error.emailVerification':
    'Use --email-verification verified or not-required, got "{value}".',
  'partnerVibe.hint.identityLink':
    'A new Vibe account is born from the identity link: the customer signs in to BladeCP in the browser, in the flow of the WHMCS module. Here, create only returns the account of a service that is already linked.',
};

export const ptBR: Record<keyof typeof en, string> = {
  'partnerVibe.help.topic': 'Gerenciar as contas BladeCP Vibe dos seus clientes',
  'partnerVibe.help.find': 'Encontrar a conta Vibe de um serviço seu',
  'partnerVibe.help.show': 'Mostrar uma conta Vibe',
  'partnerVibe.help.create': 'Criar a conta Vibe de um serviço',
  'partnerVibe.help.plan': 'Mudar o plano de uma conta Vibe',
  'partnerVibe.help.suspend': 'Suspender uma conta Vibe',
  'partnerVibe.help.reactivate': 'Reativar uma conta Vibe suspensa',
  'partnerVibe.help.resume': 'Colocar uma conta Vibe no ar de novo após inatividade',
  'partnerVibe.help.terminate': 'Encerrar uma conta Vibe de vez',
  'partnerVibe.help.open': 'Entrar no Vibe como dono da conta, com um link de uso único',

  'partnerVibe.help.findDesc':
    'Procura a conta Vibe de um serviço seu pelo ID que você usa para ele, o mesmo passado em --external-id quando a conta foi criada (por exemplo o ID do serviço no WHMCS). Use para saber se um serviço já tem conta, por exemplo depois de uma criação interrompida.',
  'partnerVibe.help.findNote':
    'Não ter conta é uma resposta normal (saída 0; com --json, found é false e account é null). Um erro nunca significa que não há conta: o comando falha com o código de saída dele.',
  'partnerVibe.help.externalArg':
    'O ID que você usa para o serviço (de 1 a 191 caracteres), exatamente como foi passado na criação da conta.',
  'partnerVibe.help.showDesc': 'Mostra o status, o plano e a IA de uma conta Vibe sua.',
  'partnerVibe.help.accountArg': 'O ID inteiro da conta Vibe (um UUID).',
  'partnerVibe.help.accountNote':
    'Contas Vibe pedem o ID inteiro: não há lista para comparar os primeiros caracteres. "bladecp partner vibe find <external-id>" dá o ID a partir do ID do serviço.',
  'partnerVibe.help.createDesc':
    'Cria a conta BladeCP Vibe de um serviço seu, a mesma chamada que o módulo WHMCS da BladeCP faz. Uma conta por serviço: quando o serviço já tem uma, a API devolve essa conta e não cria nada.',
  'partnerVibe.help.createPlanNote':
    '--plan recebe o UUID de um dos seus planos Vibe; "bladecp partner plans" lista todos.',
  'partnerVibe.help.createFreeNote':
    'Planos Free pedem --email-verification: você declara, como o módulo WHMCS faz, que o e-mail do dono foi verificado (verified) ou que a sua loja não exige verificação (not-required). A CLI envia essa declaração com a hora atual.',
  'partnerVibe.help.createLinkNote':
    'Quando a BladeCP exige identidade vinculada para contas novas, a API recusa com identity_link_required. A conta é criada, então, pelo vínculo de identidade do módulo WHMCS, que o cliente conclui no navegador.',
  'partnerVibe.help.createAskNote':
    'No terminal, pergunta antes (Enter cria); --yes pula a pergunta. Tentar de novo nunca cria uma segunda conta.',
  'partnerVibe.help.planDesc':
    'Muda uma conta Vibe para outro dos seus planos Vibe. A troca de Pro para Free é recusada, e uma conta encerrada não muda.',
  'partnerVibe.help.planArg':
    'O UUID do novo plano Vibe ("bladecp partner plans" lista os planos).',
  'partnerVibe.help.planNote': 'No terminal, pergunta antes (Enter muda); --yes pula a pergunta.',
  'partnerVibe.help.suspendDesc':
    'Suspende uma conta Vibe: os apps dela saem do ar e o dono não usa o Vibe até você reativar a conta.',
  'partnerVibe.help.suspendNote':
    'No terminal, pergunta antes, e Enter mantém a conta como está; --yes pula a pergunta. Uma conta já suspensa ou encerrada não muda.',
  'partnerVibe.help.reactivateDesc':
    'Devolve uma conta Vibe suspensa ao status ativo, e os apps dela voltam ao ar. A BladeCP confere se o plano ainda está disponível.',
  'partnerVibe.help.repeatNote':
    'No terminal, pergunta antes (Enter continua); --yes pula a pergunta. Uma conta já ativa ou encerrada não muda.',
  'partnerVibe.help.resumeDesc':
    'Para uma conta Vibe ativa cujos apps foram pausados por inatividade, registra a atividade e coloca os apps no ar de novo. Não é o mesmo que reativar, que encerra uma suspensão.',
  'partnerVibe.help.resumeNote':
    'Só contas ativas: as outras respondem não encontrado (saída 5). No terminal, pergunta antes (Enter continua); --yes pula a pergunta.',
  'partnerVibe.help.terminateDesc':
    'Encerra uma conta Vibe. É definitivo: a conta nunca mais pode ser reativada, mudar de plano nem entrar no Vibe.',
  'partnerVibe.help.terminateNote':
    'No terminal, pergunta antes, e Enter mantém a conta; --yes pula a pergunta. Uma conta já encerrada não muda.',
  'partnerVibe.help.openDesc':
    'Cria um link de uso único que entra no Vibe como dono de uma conta ativa. No terminal, a CLI abre o link no seu navegador; fora dele, mostra o link. Ele funciona uma vez e expira em 60 segundos: nunca salve nem compartilhe.',
  'partnerVibe.help.openNote':
    'Com --json, o link vem em data.url. Contas que entram pela federação do parceiro são recusadas com federation_required: elas entram pelo módulo WHMCS.',

  'partnerVibe.ex.find': 'A conta do serviço 4821',
  'partnerVibe.ex.findJson': 'O mesmo, para scripts (found e account)',
  'partnerVibe.ex.show': 'O status e o plano de uma conta',
  'partnerVibe.ex.create': 'Criar a conta de um serviço num plano Pro',
  'partnerVibe.ex.createFree': 'Num plano Free, com o e-mail do dono já verificado',
  'partnerVibe.ex.plan': 'Mudar de plano, depois da pergunta',
  'partnerVibe.ex.suspend': 'Suspender sem a pergunta (scripts)',
  'partnerVibe.ex.reactivate': 'Reativar depois da pergunta',
  'partnerVibe.ex.resume': 'Colocar os apps no ar de novo',
  'partnerVibe.ex.terminate': 'Encerrar depois da pergunta (Enter mantém a conta)',
  'partnerVibe.ex.open': 'Abrir o Vibe como dono da conta',
  'partnerVibe.ex.openJson': 'Só o link, para um script',

  'partnerVibe.option.externalId':
    'O ID que você usa para o serviço (por exemplo o ID do serviço no WHMCS)',
  'partnerVibe.option.plan': 'UUID do plano Vibe (veja "bladecp partner plans")',
  'partnerVibe.option.email': 'E-mail do dono da conta',
  'partnerVibe.option.name': 'Nome do dono da conta',
  'partnerVibe.option.emailVerification':
    'Planos Free: o e-mail do dono foi verificado, ou a sua loja não exige verificação',
  'partnerVibe.option.noBrowser': 'Mostrar o link de uso único em vez de abrir o navegador',

  'partnerVibe.title': 'Conta Vibe',
  'partnerVibe.titlePlan': 'Conta Vibe {plan}',
  'partnerVibe.label.status': 'Status',
  'partnerVibe.label.account': 'Conta',
  'partnerVibe.label.service': 'Serviço',
  'partnerVibe.label.plan': 'Plano',
  'partnerVibe.label.ai': 'IA',
  'partnerVibe.label.customer': 'Cliente',
  'partnerVibe.label.planId': 'ID do plano',
  'partnerVibe.plan.free': 'Free',
  'partnerVibe.plan.pro': 'Pro',
  'partnerVibe.ai.managed': 'Gerenciada pela BladeCP',
  'partnerVibe.ai.partner': 'Do seu provedor de IA',
  'partnerVibe.status.pending': 'Pendente',
  'partnerVibe.status.active': 'Ativa',
  'partnerVibe.status.suspended': 'Suspensa',
  'partnerVibe.status.terminated': 'Encerrada',
  'partnerVibe.next.open': 'Entre como dono com:',
  'partnerVibe.next.reactivate': 'Reative com:',
  'partnerVibe.next.show': 'Veja a conta com:',
  'partnerVibe.next.create': 'Crie uma com:',
  'partnerVibe.note.pending': 'A BladeCP ainda está preparando esta conta.',
  'partnerVibe.note.terminated':
    'O encerramento é definitivo: esta conta não pode ser reativada nem alterada.',
  'partnerVibe.find.none': 'Nenhuma conta Vibe para o serviço {service}.',
  'partnerVibe.create.note':
    'Uma conta por serviço: se o serviço já tinha uma, é esta, e nada novo foi criado.',

  'partnerVibe.confirm.create': 'Criar esta conta Vibe?',
  'partnerVibe.confirm.service': 'Serviço {service}',
  'partnerVibe.confirm.planLine': 'Plano {plan}',
  'partnerVibe.confirm.owner': 'Dono {name} ({email})',
  'partnerVibe.confirm.move': 'Mudar o plano Vibe?',
  'partnerVibe.confirm.account': 'Conta {account}',
  'partnerVibe.confirm.newPlan': 'Novo plano {plan}',
  'partnerVibe.confirm.suspend': 'Suspender esta conta Vibe?',
  'partnerVibe.confirm.suspendDetail':
    'Os apps dela saem do ar e o dono não usa o Vibe até você reativar a conta.',
  'partnerVibe.confirm.reactivate': 'Reativar esta conta Vibe?',
  'partnerVibe.confirm.reactivateDetail': 'Ela volta a ficar ativa e os apps voltam ao ar.',
  'partnerVibe.confirm.resume': 'Colocar os apps no ar de novo?',
  'partnerVibe.confirm.resumeDetail': 'Os apps, pausados por inatividade, voltam ao ar.',
  'partnerVibe.confirm.terminate': 'Encerrar esta conta Vibe?',
  'partnerVibe.confirm.terminateDetail':
    'É definitivo: a conta nunca mais pode ser reativada, mudar de plano nem entrar no Vibe.',
  'partnerVibe.declined': 'Nada foi alterado.',
  'partnerVibe.declinedCreate': 'Nada foi criado.',

  'partnerVibe.done.plan': 'Plano alterado para {plan}.',
  'partnerVibe.done.suspend': 'Conta Vibe suspensa. Os apps dela saíram do ar.',
  'partnerVibe.done.reactivate': 'Conta Vibe reativada. Os apps dela voltaram ao ar.',
  'partnerVibe.done.resume': 'Conta Vibe de volta ao ar. Os apps dela funcionam de novo.',
  'partnerVibe.done.terminate': 'Conta Vibe encerrada. É definitivo.',
  'partnerVibe.unchanged': 'Nada mudou. Status da conta: {status}.',

  'partnerVibe.open.opened':
    'Vibe aberto no seu navegador, com o login do dono da conta. O link funciona uma vez só.',
  'partnerVibe.open.label': 'Link de login no Vibe (uso único)',
  'partnerVibe.open.labelFallback': 'O navegador não abriu. Abra este link você mesmo:',
  'partnerVibe.open.note':
    'Funciona uma vez e expira às {time}. Abra agora; nunca salve nem compartilhe.',

  'partnerVibe.error.accountId': 'Use o ID inteiro da conta Vibe (um UUID); recebi "{value}".',
  'partnerVibe.error.planId':
    'Use o UUID de um plano Vibe ("bladecp partner plans" lista os planos); recebi "{value}".',
  'partnerVibe.error.externalId':
    'O ID do serviço precisa ter de 1 a 191 caracteres, sem quebra de linha.',
  'partnerVibe.error.email': '"{value}" não é um endereço de e-mail válido.',
  'partnerVibe.error.name': 'O nome do dono precisa ter de 1 a 200 caracteres.',
  'partnerVibe.error.emailVerification':
    'Use --email-verification verified ou not-required; recebi "{value}".',
  'partnerVibe.hint.identityLink':
    'Uma conta nova do Vibe nasce pelo vínculo de identidade: o cliente entra na BladeCP pelo navegador, no fluxo do módulo WHMCS. Aqui, o create só devolve a conta de um serviço que já está vinculado.',
};

export const es: Record<keyof typeof en, string> = {
  'partnerVibe.help.topic': 'Gestionar las cuentas BladeCP Vibe de tus clientes',
  'partnerVibe.help.find': 'Buscar la cuenta Vibe de uno de tus servicios',
  'partnerVibe.help.show': 'Mostrar una cuenta Vibe',
  'partnerVibe.help.create': 'Crear la cuenta Vibe de un servicio',
  'partnerVibe.help.plan': 'Cambiar el plan de una cuenta Vibe',
  'partnerVibe.help.suspend': 'Suspender una cuenta Vibe',
  'partnerVibe.help.reactivate': 'Reactivar una cuenta Vibe suspendida',
  'partnerVibe.help.resume': 'Volver a poner en línea una cuenta Vibe tras la inactividad',
  'partnerVibe.help.terminate': 'Cerrar una cuenta Vibe de forma definitiva',
  'partnerVibe.help.open': 'Entrar en Vibe como titular de la cuenta, con un enlace de un solo uso',

  'partnerVibe.help.findDesc':
    'Busca la cuenta Vibe de uno de tus servicios por el ID que usas para él, el mismo que pasaste en --external-id al crear la cuenta (por ejemplo el ID del servicio en WHMCS). Úsalo para saber si un servicio ya tiene cuenta, por ejemplo tras una creación interrumpida.',
  'partnerVibe.help.findNote':
    'No tener cuenta es una respuesta normal (salida 0; con --json, found es false y account es null). Un error nunca significa que no hay cuenta: el comando falla con su código de salida.',
  'partnerVibe.help.externalArg':
    'El ID que usas para el servicio (de 1 a 191 caracteres), exactamente como se pasó al crear la cuenta.',
  'partnerVibe.help.showDesc': 'Muestra el estado, el plan y la IA de una de tus cuentas Vibe.',
  'partnerVibe.help.accountArg': 'El ID completo de la cuenta Vibe (un UUID).',
  'partnerVibe.help.accountNote':
    'Las cuentas Vibe piden el ID completo: no hay lista con la que comparar los primeros caracteres. "bladecp partner vibe find <external-id>" da el ID a partir del ID del servicio.',
  'partnerVibe.help.createDesc':
    'Crea la cuenta BladeCP Vibe de uno de tus servicios, la misma llamada que hace el módulo WHMCS de BladeCP. Una cuenta por servicio: cuando el servicio ya tiene una, la API la devuelve y no crea nada.',
  'partnerVibe.help.createPlanNote':
    '--plan recibe el UUID de uno de tus planes Vibe; "bladecp partner plans" los lista.',
  'partnerVibe.help.createFreeNote':
    'Los planes Free piden --email-verification: declaras, como hace el módulo WHMCS, que el correo del titular se verificó (verified) o que tu tienda no exige verificación (not-required). La CLI envía esa declaración con la hora actual.',
  'partnerVibe.help.createLinkNote':
    'Cuando BladeCP exige una identidad vinculada para cuentas nuevas, la API rechaza con identity_link_required. Entonces la cuenta se crea con la vinculación de identidad del módulo WHMCS, que el cliente completa en el navegador.',
  'partnerVibe.help.createAskNote':
    'En una terminal, pregunta antes (Enter crea); --yes omite la pregunta. Intentarlo de nuevo nunca crea una segunda cuenta.',
  'partnerVibe.help.planDesc':
    'Cambia una cuenta Vibe a otro de tus planes Vibe. El cambio de Pro a Free se rechaza, y una cuenta cerrada no cambia.',
  'partnerVibe.help.planArg': 'El UUID del nuevo plan Vibe ("bladecp partner plans" los lista).',
  'partnerVibe.help.planNote':
    'En una terminal, pregunta antes (Enter cambia); --yes omite la pregunta.',
  'partnerVibe.help.suspendDesc':
    'Suspende una cuenta Vibe: sus apps dejan de funcionar y el titular no usa Vibe hasta que reactives la cuenta.',
  'partnerVibe.help.suspendNote':
    'En una terminal, pregunta antes, y Enter deja la cuenta como está; --yes omite la pregunta. Una cuenta ya suspendida o cerrada no cambia.',
  'partnerVibe.help.reactivateDesc':
    'Devuelve una cuenta Vibe suspendida al estado activo, y sus apps vuelven a funcionar. BladeCP comprueba que el plan siga disponible.',
  'partnerVibe.help.repeatNote':
    'En una terminal, pregunta antes (Enter continúa); --yes omite la pregunta. Una cuenta ya activa o cerrada no cambia.',
  'partnerVibe.help.resumeDesc':
    'Para una cuenta Vibe activa cuyas apps se pausaron por inactividad, registra la actividad y vuelve a poner las apps en línea. No es lo mismo que reactivar, que termina una suspensión.',
  'partnerVibe.help.resumeNote':
    'Solo cuentas activas: las demás responden no encontrado (salida 5). En una terminal, pregunta antes (Enter continúa); --yes omite la pregunta.',
  'partnerVibe.help.terminateDesc':
    'Cierra una cuenta Vibe. Es definitivo: la cuenta nunca más puede reactivarse, cambiar de plan ni entrar en Vibe.',
  'partnerVibe.help.terminateNote':
    'En una terminal, pregunta antes, y Enter conserva la cuenta; --yes omite la pregunta. Una cuenta ya cerrada no cambia.',
  'partnerVibe.help.openDesc':
    'Crea un enlace de un solo uso que entra en Vibe como titular de una cuenta activa. En una terminal, la CLI lo abre en tu navegador; fuera de ella, muestra el enlace. Funciona una vez y vence en 60 segundos: nunca lo guardes ni lo compartas.',
  'partnerVibe.help.openNote':
    'Con --json, el enlace viene en data.url. Las cuentas que entran por la federación del socio se rechazan con federation_required: entran desde el módulo WHMCS.',

  'partnerVibe.ex.find': 'La cuenta del servicio 4821',
  'partnerVibe.ex.findJson': 'Lo mismo, para scripts (found y account)',
  'partnerVibe.ex.show': 'El estado y el plan de una cuenta',
  'partnerVibe.ex.create': 'Crear la cuenta de un servicio en un plan Pro',
  'partnerVibe.ex.createFree': 'En un plan Free, con el correo del titular ya verificado',
  'partnerVibe.ex.plan': 'Cambiar de plan, después de la pregunta',
  'partnerVibe.ex.suspend': 'Suspender sin la pregunta (scripts)',
  'partnerVibe.ex.reactivate': 'Reactivar después de la pregunta',
  'partnerVibe.ex.resume': 'Volver a poner las apps en línea',
  'partnerVibe.ex.terminate': 'Cerrar después de la pregunta (Enter conserva la cuenta)',
  'partnerVibe.ex.open': 'Abrir Vibe como titular de la cuenta',
  'partnerVibe.ex.openJson': 'Solo el enlace, para un script',

  'partnerVibe.option.externalId':
    'El ID que usas para el servicio (por ejemplo el ID del servicio en WHMCS)',
  'partnerVibe.option.plan': 'UUID del plan Vibe (consulta "bladecp partner plans")',
  'partnerVibe.option.email': 'Correo del titular de la cuenta',
  'partnerVibe.option.name': 'Nombre del titular de la cuenta',
  'partnerVibe.option.emailVerification':
    'Planes Free: el correo del titular se verificó, o tu tienda no exige verificación',
  'partnerVibe.option.noBrowser': 'Mostrar el enlace de un solo uso en lugar de abrir el navegador',

  'partnerVibe.title': 'Cuenta Vibe',
  'partnerVibe.titlePlan': 'Cuenta Vibe {plan}',
  'partnerVibe.label.status': 'Estado',
  'partnerVibe.label.account': 'Cuenta',
  'partnerVibe.label.service': 'Servicio',
  'partnerVibe.label.plan': 'Plan',
  'partnerVibe.label.ai': 'IA',
  'partnerVibe.label.customer': 'Cliente',
  'partnerVibe.label.planId': 'ID del plan',
  'partnerVibe.plan.free': 'Free',
  'partnerVibe.plan.pro': 'Pro',
  'partnerVibe.ai.managed': 'Gestionada por BladeCP',
  'partnerVibe.ai.partner': 'De tu proveedor de IA',
  'partnerVibe.status.pending': 'Pendiente',
  'partnerVibe.status.active': 'Activa',
  'partnerVibe.status.suspended': 'Suspendida',
  'partnerVibe.status.terminated': 'Cerrada',
  'partnerVibe.next.open': 'Entra como titular con:',
  'partnerVibe.next.reactivate': 'Reactívala con:',
  'partnerVibe.next.show': 'Consulta la cuenta con:',
  'partnerVibe.next.create': 'Crea una con:',
  'partnerVibe.note.pending': 'BladeCP aún está preparando esta cuenta.',
  'partnerVibe.note.terminated':
    'El cierre es definitivo: esta cuenta no puede reactivarse ni cambiarse.',
  'partnerVibe.find.none': 'Ninguna cuenta Vibe para el servicio {service}.',
  'partnerVibe.create.note':
    'Una cuenta por servicio: si el servicio ya tenía una, es esta, y no se creó nada nuevo.',

  'partnerVibe.confirm.create': '¿Crear esta cuenta Vibe?',
  'partnerVibe.confirm.service': 'Servicio {service}',
  'partnerVibe.confirm.planLine': 'Plan {plan}',
  'partnerVibe.confirm.owner': 'Titular {name} ({email})',
  'partnerVibe.confirm.move': '¿Cambiar el plan Vibe?',
  'partnerVibe.confirm.account': 'Cuenta {account}',
  'partnerVibe.confirm.newPlan': 'Nuevo plan {plan}',
  'partnerVibe.confirm.suspend': '¿Suspender esta cuenta Vibe?',
  'partnerVibe.confirm.suspendDetail':
    'Sus apps dejan de funcionar y el titular no usa Vibe hasta que reactives la cuenta.',
  'partnerVibe.confirm.reactivate': '¿Reactivar esta cuenta Vibe?',
  'partnerVibe.confirm.reactivateDetail': 'Vuelve a estar activa y sus apps vuelven a funcionar.',
  'partnerVibe.confirm.resume': '¿Poner las apps en línea de nuevo?',
  'partnerVibe.confirm.resumeDetail': 'Sus apps, pausadas por inactividad, vuelven a funcionar.',
  'partnerVibe.confirm.terminate': '¿Cerrar esta cuenta Vibe?',
  'partnerVibe.confirm.terminateDetail':
    'Es definitivo: la cuenta nunca más puede reactivarse, cambiar de plan ni entrar en Vibe.',
  'partnerVibe.declined': 'No se cambió nada.',
  'partnerVibe.declinedCreate': 'No se creó nada.',

  'partnerVibe.done.plan': 'Plan cambiado a {plan}.',
  'partnerVibe.done.suspend': 'Cuenta Vibe suspendida. Sus apps dejaron de funcionar.',
  'partnerVibe.done.reactivate': 'Cuenta Vibe reactivada. Sus apps vuelven a funcionar.',
  'partnerVibe.done.resume': 'Cuenta Vibe de nuevo en línea. Sus apps vuelven a funcionar.',
  'partnerVibe.done.terminate': 'Cuenta Vibe cerrada. Es definitivo.',
  'partnerVibe.unchanged': 'No cambió nada. Estado de la cuenta: {status}.',

  'partnerVibe.open.opened':
    'Vibe abierto en tu navegador, con la sesión del titular de la cuenta. El enlace funciona una sola vez.',
  'partnerVibe.open.label': 'Enlace de acceso a Vibe (un solo uso)',
  'partnerVibe.open.labelFallback': 'El navegador no se abrió. Abre este enlace tú mismo:',
  'partnerVibe.open.note':
    'Funciona una vez y vence a las {time}. Ábrelo ahora; nunca lo guardes ni lo compartas.',

  'partnerVibe.error.accountId':
    'Usa el ID completo de la cuenta Vibe (un UUID); se recibió "{value}".',
  'partnerVibe.error.planId':
    'Usa el UUID de un plan Vibe ("bladecp partner plans" los lista); se recibió "{value}".',
  'partnerVibe.error.externalId':
    'El ID del servicio necesita de 1 a 191 caracteres, sin saltos de línea.',
  'partnerVibe.error.email': '"{value}" no es una dirección de correo válida.',
  'partnerVibe.error.name': 'El nombre del titular necesita de 1 a 200 caracteres.',
  'partnerVibe.error.emailVerification':
    'Usa --email-verification verified o not-required; se recibió "{value}".',
  'partnerVibe.hint.identityLink':
    'Una cuenta nueva de Vibe nace de la vinculación de identidad: el cliente inicia sesión en BladeCP en el navegador, en el flujo del módulo WHMCS. Aquí, create solo devuelve la cuenta de un servicio ya vinculado.',
};
