// Messages of the partner webhooks commands. Keys start with "partnerWebhooks.".
// Every key exists in the three languages with the same {placeholders}, and
// the em dash is never used.

export const en = {
  // Help
  'partnerWebhooks.help.topic': 'Manage the webhooks BladeCP sends to your systems',
  'partnerWebhooks.help.list': 'List your webhook endpoints',
  'partnerWebhooks.help.show': 'Show an endpoint: address, events and status',
  'partnerWebhooks.help.create': 'Add an endpoint and get its signing secret',
  'partnerWebhooks.help.update': 'Change the address, events or name of an endpoint',
  'partnerWebhooks.help.pause': 'Stop sending events to an endpoint for now',
  'partnerWebhooks.help.resume': 'Send events to a paused endpoint again',
  'partnerWebhooks.help.delete': 'Delete an endpoint',
  'partnerWebhooks.help.rotate': 'Replace the signing secret of an endpoint',
  'partnerWebhooks.help.deliveries': 'List what BladeCP sent and what your system answered',
  'partnerWebhooks.help.replay': 'Send a delivery again, with the same event ID',
  'partnerWebhooks.help.listDesc':
    'BladeCP sends each event as an HTTPS POST to the endpoints that subscribe to it, signed with the secret of the endpoint in the BladeCP-Signature header.',
  'partnerWebhooks.help.createDesc':
    'Adds an HTTPS address that receives the events you choose. The signing secret shows only once: store it in your system to check the BladeCP-Signature header of each delivery against the exact body.',
  'partnerWebhooks.help.events':
    'Event types: provision.created, provision.status.changed, provision.suspended, provision.unsuspended, provision.terminated, invoice.paid, invoice.failed, subscription.upgraded, subscription.downgraded, vibe.account.activated, vibe.account.plan_changed, vibe.account.suspended, vibe.account.reactivated, vibe.account.terminated.',
  'partnerWebhooks.help.dedupe':
    'Each event has a stable ID. A delivery can arrive more than once, so your system should skip an ID it already processed.',
  'partnerWebhooks.help.updateDesc':
    'Changes only what you give. --event replaces the whole list of events of the endpoint.',
  'partnerWebhooks.help.pauseDesc':
    'BladeCP stops sending events to the endpoint. Events that happen while it is paused are not sent to it later.',
  'partnerWebhooks.help.resumeDesc': 'BladeCP sends the new events to the endpoint again.',
  'partnerWebhooks.help.deleteDesc':
    'BladeCP stops sending events to the endpoint and it leaves your list. This cannot be undone.',
  'partnerWebhooks.help.rotateDesc':
    'Creates a new signing secret and shows it once. The current secret stops working right away, so update your system with the new one.',
  'partnerWebhooks.help.deliveriesDesc':
    'Each delivery with its state, attempts and the HTTP code your system answered, newest first. The contents of the events are not shown.',
  'partnerWebhooks.help.replayDesc':
    'Queues the delivery again with the same event ID, so your system can recognize it and skip it if it was already processed.',
  'partnerWebhooks.help.endpointArg': 'Endpoint ID (the first characters are enough)',
  'partnerWebhooks.help.deliveryArg':
    'Delivery ID (the first characters are enough for a recent one)',
  'partnerWebhooks.ex.list': 'your endpoints',
  'partnerWebhooks.ex.show': 'one endpoint',
  'partnerWebhooks.ex.create': 'send paid invoices and new services to your billing system',
  'partnerWebhooks.ex.update': 'move the endpoint to a new address',
  'partnerWebhooks.ex.pause': 'stop the events while your system is down',
  'partnerWebhooks.ex.resume': 'send the events again',
  'partnerWebhooks.ex.delete': 'delete it without asking',
  'partnerWebhooks.ex.rotate': 'a new signing secret',
  'partnerWebhooks.ex.deliveries': 'the latest deliveries',
  'partnerWebhooks.ex.deliveriesFailed': 'only the failed ones of one endpoint',
  'partnerWebhooks.ex.replay': 'send one delivery again',
  'partnerWebhooks.option.endpoint': 'Only the deliveries of this endpoint',
  'partnerWebhooks.option.url': 'Address that receives the events (https)',
  'partnerWebhooks.option.event': 'Event type to send (repeat it, or separate with commas)',
  'partnerWebhooks.option.eventReplace':
    'Event types to send, replacing the current list (repeat it, or separate with commas)',
  'partnerWebhooks.option.name': 'A name to tell the endpoint apart (for example Production WHMCS)',
  'partnerWebhooks.option.nameUpdate': 'New name of the endpoint ("" removes it)',
  'partnerWebhooks.option.status':
    'Only deliveries in this state: pending, delivering, succeeded, failed or dead',
  'partnerWebhooks.option.limit': 'How many to show per page (up to 100)',
  'partnerWebhooks.option.yesChange': 'Do not ask for confirmation',
  'partnerWebhooks.option.yesPause': 'Pause without asking',
  'partnerWebhooks.option.yesDelete': 'Delete without asking',
  'partnerWebhooks.option.yesRotate': 'Replace the secret without asking',

  // Errors
  'partnerWebhooks.error.url': 'The endpoint address must be a full https address, got "{value}".',
  'partnerWebhooks.error.event':
    '"{value}" is not an event type. Event types look like provision.created.',
  'partnerWebhooks.error.nameLong': 'The name can have up to 255 characters.',
  'partnerWebhooks.error.nothing': 'Nothing to change. Give --url, --event or --name.',
  'partnerWebhooks.error.status':
    'Unknown delivery state "{value}". Use pending, delivering, succeeded, failed or dead.',
  'partnerWebhooks.error.limit': 'Option --limit goes from 1 to 100, got "{value}".',
  'partnerWebhooks.error.page': 'Option --page starts at 1, got "{value}".',

  // Endpoints
  'partnerWebhooks.column.url': 'ADDRESS',
  'partnerWebhooks.column.name': 'NAME',
  'partnerWebhooks.column.events': 'EVENTS',
  'partnerWebhooks.status.active': 'Active',
  'partnerWebhooks.status.paused': 'Paused',
  'partnerWebhooks.list.empty': 'No webhook endpoints yet.',
  'partnerWebhooks.list.countOne': '1 endpoint',
  'partnerWebhooks.list.countMany': '{count} endpoints',
  'partnerWebhooks.next.create': 'Add one:',
  'partnerWebhooks.next.deliveries': 'See what BladeCP sent:',
  'partnerWebhooks.next.show': 'See the endpoint:',
  'partnerWebhooks.next.resume': 'To send events again:',
  'partnerWebhooks.label.url': 'Address',
  'partnerWebhooks.label.name': 'Name',
  'partnerWebhooks.label.events': 'Events',
  'partnerWebhooks.label.created': 'Created',
  'partnerWebhooks.label.updated': 'Updated',

  // Actions
  'partnerWebhooks.created': 'Endpoint created: {url}',
  'partnerWebhooks.createdPlain': 'Endpoint {id} created for {url}.',
  'partnerWebhooks.secret.label': 'Signing secret',
  'partnerWebhooks.secret.note':
    'This secret shows only now. Store it in your system: it checks the BladeCP-Signature header of each delivery. If you lose it, run bladecp partner webhooks rotate-secret {id}.',
  'partnerWebhooks.secret.rotatedNote':
    'This secret shows only now, and the old one no longer works. Store it in your system before the next delivery.',
  'partnerWebhooks.update.question': 'Change the endpoint {url}?',
  'partnerWebhooks.update.url': 'New address: {url}',
  'partnerWebhooks.update.events': 'Events: {events}',
  'partnerWebhooks.update.name': 'Name: {name}',
  'partnerWebhooks.update.noName': 'The name is removed.',
  'partnerWebhooks.updated': 'Endpoint updated: {url}',
  'partnerWebhooks.pause.question': 'Pause the endpoint {url}?',
  'partnerWebhooks.pause.detail':
    'BladeCP stops sending events to it. Events that happen while it is paused are not sent to it later.',
  'partnerWebhooks.paused': 'Endpoint paused: {url}',
  'partnerWebhooks.resume.question': 'Resume the endpoint {url}?',
  'partnerWebhooks.resume.detail': 'BladeCP sends the new events to it again.',
  'partnerWebhooks.resumed': 'Endpoint resumed: {url}',
  'partnerWebhooks.delete.question': 'Delete the endpoint {url}?',
  'partnerWebhooks.delete.detail': 'BladeCP stops sending events to it. This cannot be undone.',
  'partnerWebhooks.deleted': 'Endpoint deleted: {url}',
  'partnerWebhooks.rotate.question': 'Replace the signing secret of {url}?',
  'partnerWebhooks.rotate.detail':
    'The current secret stops working right away. Deliveries are signed with the new one from now on, so update your system with it.',
  'partnerWebhooks.rotated': 'New signing secret for {url}',
  'partnerWebhooks.declined': 'Nothing changed.',

  // Deliveries
  'partnerWebhooks.column.event': 'EVENT',
  'partnerWebhooks.column.attempts': 'ATTEMPTS',
  'partnerWebhooks.column.answer': 'ANSWER',
  'partnerWebhooks.column.when': 'WHEN',
  'partnerWebhooks.column.next': 'NEXT TRY',
  'partnerWebhooks.column.error': 'ERROR',
  'partnerWebhooks.delivery.pending': 'Queued',
  'partnerWebhooks.delivery.delivering': 'Sending',
  'partnerWebhooks.delivery.succeeded': 'Delivered',
  'partnerWebhooks.delivery.failed': 'Failed',
  'partnerWebhooks.delivery.dead': 'Given up',
  'partnerWebhooks.deliveries.empty': 'No deliveries yet.',
  'partnerWebhooks.deliveries.emptyFiltered': 'No deliveries match.',
  'partnerWebhooks.deliveries.countOne': '1 delivery',
  'partnerWebhooks.deliveries.countMany': '{count} deliveries',
  'partnerWebhooks.deliveries.page': 'page {page} of {pages}',
  'partnerWebhooks.next.page': 'Next page:',
  'partnerWebhooks.next.replay': 'Send one again:',
  'partnerWebhooks.replay.question': 'Send the delivery {id} again?',
  'partnerWebhooks.replay.detailEvent':
    'Event {event}, with the same event ID: your system can recognize it and skip it if it was already processed.',
  'partnerWebhooks.replay.detail':
    'It goes with the same event ID: your system can recognize it and skip it if it was already processed.',
  'partnerWebhooks.replayed': 'Delivery queued again as {id} (same event ID {event})',
  'partnerWebhooks.next.follow': 'Follow it:',
  'partnerWebhooks.hint.signingUnavailable':
    'BladeCP cannot create webhook signing secrets right now (a configuration on its side). Nothing was created; contact BladeCP support.',
};

export const ptBR: Record<keyof typeof en, string> = {
  'partnerWebhooks.help.topic': 'Gerenciar os webhooks que a BladeCP envia aos seus sistemas',
  'partnerWebhooks.help.list': 'Listar seus endpoints de webhook',
  'partnerWebhooks.help.show': 'Mostrar um endpoint: endereço, eventos e status',
  'partnerWebhooks.help.create': 'Adicionar um endpoint e receber o segredo de assinatura dele',
  'partnerWebhooks.help.update': 'Mudar o endereço, os eventos ou o nome de um endpoint',
  'partnerWebhooks.help.pause': 'Parar de enviar eventos a um endpoint por enquanto',
  'partnerWebhooks.help.resume': 'Voltar a enviar eventos a um endpoint pausado',
  'partnerWebhooks.help.delete': 'Excluir um endpoint',
  'partnerWebhooks.help.rotate': 'Trocar o segredo de assinatura de um endpoint',
  'partnerWebhooks.help.deliveries':
    'Listar o que a BladeCP enviou e o que o seu sistema respondeu',
  'partnerWebhooks.help.replay': 'Enviar uma entrega de novo, com o mesmo ID de evento',
  'partnerWebhooks.help.listDesc':
    'A BladeCP envia cada evento como um POST HTTPS aos endpoints inscritos nele, assinado com o segredo do endpoint no cabeçalho BladeCP-Signature.',
  'partnerWebhooks.help.createDesc':
    'Adiciona um endereço HTTPS que recebe os eventos escolhidos. O segredo de assinatura aparece uma única vez: guarde-o no seu sistema para conferir o cabeçalho BladeCP-Signature de cada entrega com o corpo exato.',
  'partnerWebhooks.help.events':
    'Tipos de evento: provision.created, provision.status.changed, provision.suspended, provision.unsuspended, provision.terminated, invoice.paid, invoice.failed, subscription.upgraded, subscription.downgraded, vibe.account.activated, vibe.account.plan_changed, vibe.account.suspended, vibe.account.reactivated, vibe.account.terminated.',
  'partnerWebhooks.help.dedupe':
    'Cada evento tem um ID estável. Uma entrega pode chegar mais de uma vez, então o seu sistema deve ignorar um ID que já processou.',
  'partnerWebhooks.help.updateDesc':
    'Muda só o que você informar. --event substitui a lista inteira de eventos do endpoint.',
  'partnerWebhooks.help.pauseDesc':
    'A BladeCP para de enviar eventos ao endpoint. Os eventos que acontecerem enquanto ele estiver pausado não são enviados depois.',
  'partnerWebhooks.help.resumeDesc': 'A BladeCP volta a enviar os novos eventos ao endpoint.',
  'partnerWebhooks.help.deleteDesc':
    'A BladeCP para de enviar eventos ao endpoint e ele sai da sua lista. Isso não pode ser desfeito.',
  'partnerWebhooks.help.rotateDesc':
    'Cria um novo segredo de assinatura e mostra uma única vez. O segredo atual para de funcionar na hora, então atualize o seu sistema com o novo.',
  'partnerWebhooks.help.deliveriesDesc':
    'Cada entrega com o estado, as tentativas e o código HTTP que o seu sistema respondeu, da mais nova para a mais antiga. O conteúdo dos eventos não aparece.',
  'partnerWebhooks.help.replayDesc':
    'Coloca a entrega na fila de novo com o mesmo ID de evento, para o seu sistema reconhecer e ignorar se já tiver processado.',
  'partnerWebhooks.help.endpointArg': 'ID do endpoint (os primeiros caracteres bastam)',
  'partnerWebhooks.help.deliveryArg':
    'ID da entrega (os primeiros caracteres bastam para uma recente)',
  'partnerWebhooks.ex.list': 'seus endpoints',
  'partnerWebhooks.ex.show': 'um endpoint',
  'partnerWebhooks.ex.create': 'enviar faturas pagas e serviços novos ao seu sistema de cobrança',
  'partnerWebhooks.ex.update': 'levar o endpoint para um novo endereço',
  'partnerWebhooks.ex.pause': 'parar os eventos enquanto o seu sistema está fora do ar',
  'partnerWebhooks.ex.resume': 'voltar a enviar os eventos',
  'partnerWebhooks.ex.delete': 'excluir sem perguntar',
  'partnerWebhooks.ex.rotate': 'um novo segredo de assinatura',
  'partnerWebhooks.ex.deliveries': 'as entregas mais recentes',
  'partnerWebhooks.ex.deliveriesFailed': 'só as que falharam em um endpoint',
  'partnerWebhooks.ex.replay': 'enviar uma entrega de novo',
  'partnerWebhooks.option.endpoint': 'Só as entregas deste endpoint',
  'partnerWebhooks.option.url': 'Endereço que recebe os eventos (https)',
  'partnerWebhooks.option.event': 'Tipo de evento a enviar (repita a opção ou separe com vírgulas)',
  'partnerWebhooks.option.eventReplace':
    'Tipos de evento a enviar, no lugar da lista atual (repita a opção ou separe com vírgulas)',
  'partnerWebhooks.option.name': 'Um nome para identificar o endpoint (por exemplo WHMCS produção)',
  'partnerWebhooks.option.nameUpdate': 'Novo nome do endpoint ("" remove o nome)',
  'partnerWebhooks.option.status':
    'Só as entregas neste estado: pending, delivering, succeeded, failed ou dead',
  'partnerWebhooks.option.limit': 'Quantas mostrar por página (até 100)',
  'partnerWebhooks.option.yesChange': 'Não pedir confirmação',
  'partnerWebhooks.option.yesPause': 'Pausar sem perguntar',
  'partnerWebhooks.option.yesDelete': 'Excluir sem perguntar',
  'partnerWebhooks.option.yesRotate': 'Trocar o segredo sem perguntar',

  'partnerWebhooks.error.url':
    'O endereço do endpoint precisa ser um endereço https completo, recebido "{value}".',
  'partnerWebhooks.error.event':
    '"{value}" não é um tipo de evento. Os tipos de evento são como provision.created.',
  'partnerWebhooks.error.nameLong': 'O nome pode ter até 255 caracteres.',
  'partnerWebhooks.error.nothing': 'Nada para mudar. Informe --url, --event ou --name.',
  'partnerWebhooks.error.status':
    'Estado de entrega desconhecido "{value}". Use pending, delivering, succeeded, failed ou dead.',
  'partnerWebhooks.error.limit': 'A opção --limit vai de 1 a 100, recebido "{value}".',
  'partnerWebhooks.error.page': 'A opção --page começa em 1, recebido "{value}".',

  'partnerWebhooks.column.url': 'ENDEREÇO',
  'partnerWebhooks.column.name': 'NOME',
  'partnerWebhooks.column.events': 'EVENTOS',
  'partnerWebhooks.status.active': 'Ativo',
  'partnerWebhooks.status.paused': 'Pausado',
  'partnerWebhooks.list.empty': 'Nenhum endpoint de webhook ainda.',
  'partnerWebhooks.list.countOne': '1 endpoint',
  'partnerWebhooks.list.countMany': '{count} endpoints',
  'partnerWebhooks.next.create': 'Adicione um:',
  'partnerWebhooks.next.deliveries': 'Veja o que a BladeCP enviou:',
  'partnerWebhooks.next.show': 'Veja o endpoint:',
  'partnerWebhooks.next.resume': 'Para voltar a enviar eventos:',
  'partnerWebhooks.label.url': 'Endereço',
  'partnerWebhooks.label.name': 'Nome',
  'partnerWebhooks.label.events': 'Eventos',
  'partnerWebhooks.label.created': 'Criado em',
  'partnerWebhooks.label.updated': 'Atualizado em',

  'partnerWebhooks.created': 'Endpoint criado: {url}',
  'partnerWebhooks.createdPlain': 'Endpoint {id} criado para {url}.',
  'partnerWebhooks.secret.label': 'Segredo de assinatura',
  'partnerWebhooks.secret.note':
    'Este segredo aparece só agora. Guarde-o no seu sistema: ele confere o cabeçalho BladeCP-Signature de cada entrega. Se perder, rode bladecp partner webhooks rotate-secret {id}.',
  'partnerWebhooks.secret.rotatedNote':
    'Este segredo aparece só agora, e o antigo não vale mais. Guarde-o no seu sistema antes da próxima entrega.',
  'partnerWebhooks.update.question': 'Mudar o endpoint {url}?',
  'partnerWebhooks.update.url': 'Novo endereço: {url}',
  'partnerWebhooks.update.events': 'Eventos: {events}',
  'partnerWebhooks.update.name': 'Nome: {name}',
  'partnerWebhooks.update.noName': 'O nome é removido.',
  'partnerWebhooks.updated': 'Endpoint atualizado: {url}',
  'partnerWebhooks.pause.question': 'Pausar o endpoint {url}?',
  'partnerWebhooks.pause.detail':
    'A BladeCP para de enviar eventos a ele. Os eventos que acontecerem enquanto ele estiver pausado não são enviados depois.',
  'partnerWebhooks.paused': 'Endpoint pausado: {url}',
  'partnerWebhooks.resume.question': 'Retomar o endpoint {url}?',
  'partnerWebhooks.resume.detail': 'A BladeCP volta a enviar os novos eventos a ele.',
  'partnerWebhooks.resumed': 'Endpoint retomado: {url}',
  'partnerWebhooks.delete.question': 'Excluir o endpoint {url}?',
  'partnerWebhooks.delete.detail':
    'A BladeCP para de enviar eventos a ele. Isso não pode ser desfeito.',
  'partnerWebhooks.deleted': 'Endpoint excluído: {url}',
  'partnerWebhooks.rotate.question': 'Trocar o segredo de assinatura de {url}?',
  'partnerWebhooks.rotate.detail':
    'O segredo atual para de funcionar na hora. As entregas passam a ser assinadas com o novo, então atualize o seu sistema com ele.',
  'partnerWebhooks.rotated': 'Novo segredo de assinatura para {url}',
  'partnerWebhooks.declined': 'Nada mudou.',

  'partnerWebhooks.column.event': 'EVENTO',
  'partnerWebhooks.column.attempts': 'TENTATIVAS',
  'partnerWebhooks.column.answer': 'RESPOSTA',
  'partnerWebhooks.column.when': 'QUANDO',
  'partnerWebhooks.column.next': 'PRÓXIMA',
  'partnerWebhooks.column.error': 'ERRO',
  'partnerWebhooks.delivery.pending': 'Na fila',
  'partnerWebhooks.delivery.delivering': 'Enviando',
  'partnerWebhooks.delivery.succeeded': 'Entregue',
  'partnerWebhooks.delivery.failed': 'Falhou',
  'partnerWebhooks.delivery.dead': 'Descartada',
  'partnerWebhooks.deliveries.empty': 'Nenhuma entrega ainda.',
  'partnerWebhooks.deliveries.emptyFiltered': 'Nenhuma entrega encontrada.',
  'partnerWebhooks.deliveries.countOne': '1 entrega',
  'partnerWebhooks.deliveries.countMany': '{count} entregas',
  'partnerWebhooks.deliveries.page': 'página {page} de {pages}',
  'partnerWebhooks.next.page': 'Próxima página:',
  'partnerWebhooks.next.replay': 'Envie uma de novo:',
  'partnerWebhooks.replay.question': 'Enviar a entrega {id} de novo?',
  'partnerWebhooks.replay.detailEvent':
    'Evento {event}, com o mesmo ID de evento: o seu sistema pode reconhecer e ignorar se já tiver processado.',
  'partnerWebhooks.replay.detail':
    'Ela vai com o mesmo ID de evento: o seu sistema pode reconhecer e ignorar se já tiver processado.',
  'partnerWebhooks.replayed': 'Entrega na fila de novo como {id} (mesmo ID de evento {event})',
  'partnerWebhooks.next.follow': 'Acompanhe:',
  'partnerWebhooks.hint.signingUnavailable':
    'A BladeCP não consegue criar segredos de assinatura de webhook agora (uma configuração do lado dela). Nada foi criado; fale com o suporte da BladeCP.',
};

export const es: Record<keyof typeof en, string> = {
  'partnerWebhooks.help.topic': 'Gestionar los webhooks que BladeCP envía a tus sistemas',
  'partnerWebhooks.help.list': 'Listar tus endpoints de webhook',
  'partnerWebhooks.help.show': 'Mostrar un endpoint: dirección, eventos y estado',
  'partnerWebhooks.help.create': 'Añadir un endpoint y recibir su secreto de firma',
  'partnerWebhooks.help.update': 'Cambiar la dirección, los eventos o el nombre de un endpoint',
  'partnerWebhooks.help.pause': 'Dejar de enviar eventos a un endpoint por ahora',
  'partnerWebhooks.help.resume': 'Volver a enviar eventos a un endpoint pausado',
  'partnerWebhooks.help.delete': 'Eliminar un endpoint',
  'partnerWebhooks.help.rotate': 'Cambiar el secreto de firma de un endpoint',
  'partnerWebhooks.help.deliveries': 'Listar lo que BladeCP envió y lo que respondió tu sistema',
  'partnerWebhooks.help.replay': 'Enviar una entrega otra vez, con el mismo ID de evento',
  'partnerWebhooks.help.listDesc':
    'BladeCP envía cada evento como un POST HTTPS a los endpoints suscritos, firmado con el secreto del endpoint en el encabezado BladeCP-Signature.',
  'partnerWebhooks.help.createDesc':
    'Añade una dirección HTTPS que recibe los eventos que elijas. El secreto de firma se muestra una sola vez: guárdalo en tu sistema para comprobar el encabezado BladeCP-Signature de cada entrega con el cuerpo exacto.',
  'partnerWebhooks.help.events':
    'Tipos de evento: provision.created, provision.status.changed, provision.suspended, provision.unsuspended, provision.terminated, invoice.paid, invoice.failed, subscription.upgraded, subscription.downgraded, vibe.account.activated, vibe.account.plan_changed, vibe.account.suspended, vibe.account.reactivated, vibe.account.terminated.',
  'partnerWebhooks.help.dedupe':
    'Cada evento tiene un ID estable. Una entrega puede llegar más de una vez, así que tu sistema debe ignorar un ID que ya procesó.',
  'partnerWebhooks.help.updateDesc':
    'Cambia solo lo que indiques. --event reemplaza la lista completa de eventos del endpoint.',
  'partnerWebhooks.help.pauseDesc':
    'BladeCP deja de enviar eventos al endpoint. Los eventos que ocurran mientras está pausado no se le envían después.',
  'partnerWebhooks.help.resumeDesc': 'BladeCP vuelve a enviar los nuevos eventos al endpoint.',
  'partnerWebhooks.help.deleteDesc':
    'BladeCP deja de enviar eventos al endpoint y sale de tu lista. No se puede deshacer.',
  'partnerWebhooks.help.rotateDesc':
    'Crea un nuevo secreto de firma y lo muestra una vez. El secreto actual deja de funcionar al instante, así que actualiza tu sistema con el nuevo.',
  'partnerWebhooks.help.deliveriesDesc':
    'Cada entrega con su estado, intentos y el código HTTP que respondió tu sistema, de la más reciente a la más antigua. El contenido de los eventos no se muestra.',
  'partnerWebhooks.help.replayDesc':
    'Vuelve a poner la entrega en la cola con el mismo ID de evento, para que tu sistema la reconozca y la ignore si ya la procesó.',
  'partnerWebhooks.help.endpointArg': 'ID del endpoint (bastan los primeros caracteres)',
  'partnerWebhooks.help.deliveryArg':
    'ID de la entrega (bastan los primeros caracteres de una reciente)',
  'partnerWebhooks.ex.list': 'tus endpoints',
  'partnerWebhooks.ex.show': 'un endpoint',
  'partnerWebhooks.ex.create': 'enviar facturas pagadas y servicios nuevos a tu sistema de cobro',
  'partnerWebhooks.ex.update': 'llevar el endpoint a una nueva dirección',
  'partnerWebhooks.ex.pause': 'detener los eventos mientras tu sistema está caído',
  'partnerWebhooks.ex.resume': 'volver a enviar los eventos',
  'partnerWebhooks.ex.delete': 'eliminarlo sin preguntar',
  'partnerWebhooks.ex.rotate': 'un nuevo secreto de firma',
  'partnerWebhooks.ex.deliveries': 'las entregas más recientes',
  'partnerWebhooks.ex.deliveriesFailed': 'solo las fallidas de un endpoint',
  'partnerWebhooks.ex.replay': 'enviar una entrega otra vez',
  'partnerWebhooks.option.endpoint': 'Solo las entregas de este endpoint',
  'partnerWebhooks.option.url': 'Dirección que recibe los eventos (https)',
  'partnerWebhooks.option.event': 'Tipo de evento a enviar (repite la opción o separa con comas)',
  'partnerWebhooks.option.eventReplace':
    'Tipos de evento a enviar, en lugar de la lista actual (repite la opción o separa con comas)',
  'partnerWebhooks.option.name':
    'Un nombre para identificar el endpoint (por ejemplo WHMCS producción)',
  'partnerWebhooks.option.nameUpdate': 'Nuevo nombre del endpoint ("" lo quita)',
  'partnerWebhooks.option.status':
    'Solo las entregas en este estado: pending, delivering, succeeded, failed o dead',
  'partnerWebhooks.option.limit': 'Cuántas mostrar por página (hasta 100)',
  'partnerWebhooks.option.yesChange': 'No pedir confirmación',
  'partnerWebhooks.option.yesPause': 'Pausar sin preguntar',
  'partnerWebhooks.option.yesDelete': 'Eliminar sin preguntar',
  'partnerWebhooks.option.yesRotate': 'Cambiar el secreto sin preguntar',

  'partnerWebhooks.error.url':
    'La dirección del endpoint debe ser una dirección https completa, se recibió "{value}".',
  'partnerWebhooks.error.event':
    '"{value}" no es un tipo de evento. Los tipos de evento son como provision.created.',
  'partnerWebhooks.error.nameLong': 'El nombre puede tener hasta 255 caracteres.',
  'partnerWebhooks.error.nothing': 'Nada que cambiar. Indica --url, --event o --name.',
  'partnerWebhooks.error.status':
    'Estado de entrega desconocido "{value}". Usa pending, delivering, succeeded, failed o dead.',
  'partnerWebhooks.error.limit': 'La opción --limit va de 1 a 100, se recibió "{value}".',
  'partnerWebhooks.error.page': 'La opción --page empieza en 1, se recibió "{value}".',

  'partnerWebhooks.column.url': 'DIRECCIÓN',
  'partnerWebhooks.column.name': 'NOMBRE',
  'partnerWebhooks.column.events': 'EVENTOS',
  'partnerWebhooks.status.active': 'Activo',
  'partnerWebhooks.status.paused': 'Pausado',
  'partnerWebhooks.list.empty': 'Aún no hay endpoints de webhook.',
  'partnerWebhooks.list.countOne': '1 endpoint',
  'partnerWebhooks.list.countMany': '{count} endpoints',
  'partnerWebhooks.next.create': 'Añade uno:',
  'partnerWebhooks.next.deliveries': 'Mira lo que BladeCP envió:',
  'partnerWebhooks.next.show': 'Mira el endpoint:',
  'partnerWebhooks.next.resume': 'Para volver a enviar eventos:',
  'partnerWebhooks.label.url': 'Dirección',
  'partnerWebhooks.label.name': 'Nombre',
  'partnerWebhooks.label.events': 'Eventos',
  'partnerWebhooks.label.created': 'Creado',
  'partnerWebhooks.label.updated': 'Actualizado',

  'partnerWebhooks.created': 'Endpoint creado: {url}',
  'partnerWebhooks.createdPlain': 'Endpoint {id} creado para {url}.',
  'partnerWebhooks.secret.label': 'Secreto de firma',
  'partnerWebhooks.secret.note':
    'Este secreto se muestra solo ahora. Guárdalo en tu sistema: comprueba el encabezado BladeCP-Signature de cada entrega. Si lo pierdes, ejecuta bladecp partner webhooks rotate-secret {id}.',
  'partnerWebhooks.secret.rotatedNote':
    'Este secreto se muestra solo ahora, y el anterior ya no funciona. Guárdalo en tu sistema antes de la próxima entrega.',
  'partnerWebhooks.update.question': '¿Cambiar el endpoint {url}?',
  'partnerWebhooks.update.url': 'Nueva dirección: {url}',
  'partnerWebhooks.update.events': 'Eventos: {events}',
  'partnerWebhooks.update.name': 'Nombre: {name}',
  'partnerWebhooks.update.noName': 'Se quita el nombre.',
  'partnerWebhooks.updated': 'Endpoint actualizado: {url}',
  'partnerWebhooks.pause.question': '¿Pausar el endpoint {url}?',
  'partnerWebhooks.pause.detail':
    'BladeCP deja de enviarle eventos. Los eventos que ocurran mientras está pausado no se le envían después.',
  'partnerWebhooks.paused': 'Endpoint pausado: {url}',
  'partnerWebhooks.resume.question': '¿Reanudar el endpoint {url}?',
  'partnerWebhooks.resume.detail': 'BladeCP vuelve a enviarle los nuevos eventos.',
  'partnerWebhooks.resumed': 'Endpoint reanudado: {url}',
  'partnerWebhooks.delete.question': '¿Eliminar el endpoint {url}?',
  'partnerWebhooks.delete.detail': 'BladeCP deja de enviarle eventos. No se puede deshacer.',
  'partnerWebhooks.deleted': 'Endpoint eliminado: {url}',
  'partnerWebhooks.rotate.question': '¿Cambiar el secreto de firma de {url}?',
  'partnerWebhooks.rotate.detail':
    'El secreto actual deja de funcionar al instante. Las entregas se firman con el nuevo desde ahora, así que actualiza tu sistema con él.',
  'partnerWebhooks.rotated': 'Nuevo secreto de firma para {url}',
  'partnerWebhooks.declined': 'No cambió nada.',

  'partnerWebhooks.column.event': 'EVENTO',
  'partnerWebhooks.column.attempts': 'INTENTOS',
  'partnerWebhooks.column.answer': 'RESPUESTA',
  'partnerWebhooks.column.when': 'CUÁNDO',
  'partnerWebhooks.column.next': 'PRÓXIMO',
  'partnerWebhooks.column.error': 'ERROR',
  'partnerWebhooks.delivery.pending': 'En cola',
  'partnerWebhooks.delivery.delivering': 'Enviando',
  'partnerWebhooks.delivery.succeeded': 'Entregada',
  'partnerWebhooks.delivery.failed': 'Fallida',
  'partnerWebhooks.delivery.dead': 'Descartada',
  'partnerWebhooks.deliveries.empty': 'Aún no hay entregas.',
  'partnerWebhooks.deliveries.emptyFiltered': 'Ninguna entrega coincide.',
  'partnerWebhooks.deliveries.countOne': '1 entrega',
  'partnerWebhooks.deliveries.countMany': '{count} entregas',
  'partnerWebhooks.deliveries.page': 'página {page} de {pages}',
  'partnerWebhooks.next.page': 'Página siguiente:',
  'partnerWebhooks.next.replay': 'Envía una otra vez:',
  'partnerWebhooks.replay.question': '¿Enviar la entrega {id} otra vez?',
  'partnerWebhooks.replay.detailEvent':
    'Evento {event}, con el mismo ID de evento: tu sistema puede reconocerlo e ignorarlo si ya lo procesó.',
  'partnerWebhooks.replay.detail':
    'Va con el mismo ID de evento: tu sistema puede reconocerla e ignorarla si ya la procesó.',
  'partnerWebhooks.replayed': 'Entrega en cola otra vez como {id} (mismo ID de evento {event})',
  'partnerWebhooks.next.follow': 'Síguela:',
  'partnerWebhooks.hint.signingUnavailable':
    'BladeCP no puede crear secretos de firma de webhook ahora (una configuración de su lado). No se creó nada; contacta al soporte de BladeCP.',
};
