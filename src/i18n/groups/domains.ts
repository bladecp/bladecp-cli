// Messages of the domains commands. Keys start with "domains.".
// Every key exists in the three languages with the same {placeholders}, and
// the em dash is never used.

export const en = {
  'domains.help.topic': 'See, add and remove the domains of a server',
  'domains.help.list': 'List the domains of a server',
  'domains.help.add': 'Add a domain to a server',
  'domains.help.remove': 'Remove a domain from a server',
  'domains.help.check': 'Check whether a domain can be used on BladeCP',
  'domains.help.listDesc':
    'Shows the main domain of a server, the other domains it also answers for and its preview address.',
  'domains.help.addDesc':
    'Adds a domain to a server, next to its main domain. The site answers at the new address once the DNS of the domain points to BladeCP.',
  'domains.help.removeDesc':
    'Removes one of the additional domains of a server. On a terminal it asks first. The main domain always stays.',
  'domains.help.checkDesc':
    'Tells whether a domain is free to use on BladeCP and, when it is not, why. It reserves nothing: adding the domain to a server is what counts.',
  'domains.help.serverArg': 'The server: its ID, or its first characters (at least 4).',
  'domains.help.hostArg': 'The domain, for example blog.example.com.',
  'domains.option.yesRemove': 'Do not ask before removing on a terminal',
  'domains.ex.list': 'The domains of a server',
  'domains.ex.add': 'Add another domain to it',
  'domains.ex.remove': 'Remove it without the question',
  'domains.ex.check': 'Check a domain before you add it',
  'domains.column.kind': 'TYPE',
  'domains.kind.primary': 'main',
  'domains.kind.additional': 'additional',
  'domains.kind.preview': 'preview',
  'domains.additionalNone': 'No additional domains',
  'domains.additionalOne': '1 additional domain',
  'domains.additionalMany': '{count} additional domains',
  'domains.previewNote':
    'The preview address shows the site even before its domains point to BladeCP.',
  'domains.next.add': 'Add a domain with:',
  'domains.added': '{host} was added to the server.',
  'domains.addedNext':
    'The site answers there once the DNS of the domain points to BladeCP. See every domain with:',
  'domains.removeAsk': 'Remove {host}?',
  'domains.removeDetail':
    'The site of {server} stops answering at this address. You can add it again later.',
  'domains.removed': '{host} was removed from the server.',
  'domains.removedNext': 'See the domains that stay with:',
  'domains.declined': 'Nothing was changed.',
  'domains.available': '{host} is free to use.',
  'domains.availableNext': 'Add it to one of your servers with:',
  'domains.unavailable': '{host} cannot be used.',
  'domains.reason.hostTaken':
    'It is already on a BladeCP server. If the server is yours, you see it with:',
  'domains.reason.zoneOther':
    'It belongs to another BladeCP account. If the domain is yours, talk to support:',
  'domains.reason.unknown': 'BladeCP did not say why.',
  'domains.error.host': '"{host}" is not a domain. Write it like blog.example.com.',
  'domains.error.primary': '{host} is the main domain of this server and always stays with it.',
  'domains.hint.list': 'See the domains of the server with bladecp domains list {server}.',
  'domains.hint.inUse':
    'The domain is already on this server or on another one. See why with bladecp domains check {host}.',
  'domains.hint.zone':
    'The domain belongs to another BladeCP account. If it is yours, talk to support: {support}',
  'domains.hint.limit':
    'The server has reached its limit of additional domains. Remove one first, or move to a larger plan.',
};

export const ptBR: Record<keyof typeof en, string> = {
  'domains.help.topic': 'Ver, adicionar e remover os domínios de um servidor',
  'domains.help.list': 'Listar os domínios de um servidor',
  'domains.help.add': 'Adicionar um domínio a um servidor',
  'domains.help.remove': 'Remover um domínio de um servidor',
  'domains.help.check': 'Ver se um domínio pode ser usado na BladeCP',
  'domains.help.listDesc':
    'Mostra o domínio principal de um servidor, os outros domínios que ele também atende e o endereço de prévia.',
  'domains.help.addDesc':
    'Adiciona um domínio a um servidor, ao lado do domínio principal. O site responde no novo endereço quando o DNS do domínio aponta para a BladeCP.',
  'domains.help.removeDesc':
    'Remove um dos domínios adicionais de um servidor. No terminal, pergunta antes. O domínio principal sempre fica.',
  'domains.help.checkDesc':
    'Diz se um domínio está livre para usar na BladeCP e, quando não está, por quê. Não reserva nada: o que vale é adicionar o domínio a um servidor.',
  'domains.help.serverArg': 'O servidor: o ID dele, ou os primeiros caracteres (pelo menos 4).',
  'domains.help.hostArg': 'O domínio, por exemplo blog.example.com.',
  'domains.option.yesRemove': 'Não perguntar antes de remover no terminal',
  'domains.ex.list': 'Os domínios de um servidor',
  'domains.ex.add': 'Adicionar mais um domínio a ele',
  'domains.ex.remove': 'Remover sem a pergunta',
  'domains.ex.check': 'Conferir um domínio antes de adicioná-lo',
  'domains.column.kind': 'TIPO',
  'domains.kind.primary': 'principal',
  'domains.kind.additional': 'adicional',
  'domains.kind.preview': 'prévia',
  'domains.additionalNone': 'Nenhum domínio adicional',
  'domains.additionalOne': '1 domínio adicional',
  'domains.additionalMany': '{count} domínios adicionais',
  'domains.previewNote':
    'O endereço de prévia mostra o site mesmo antes de os domínios apontarem para a BladeCP.',
  'domains.next.add': 'Adicione um domínio com:',
  'domains.added': '{host} foi adicionado ao servidor.',
  'domains.addedNext':
    'O site responde nele quando o DNS do domínio apontar para a BladeCP. Veja todos os domínios com:',
  'domains.removeAsk': 'Remover {host}?',
  'domains.removeDetail':
    'O site de {server} deixa de responder neste endereço. Você pode adicioná-lo de novo depois.',
  'domains.removed': '{host} foi removido do servidor.',
  'domains.removedNext': 'Veja os domínios que ficaram com:',
  'domains.declined': 'Nada foi alterado.',
  'domains.available': '{host} está livre para usar.',
  'domains.availableNext': 'Adicione-o a um dos seus servidores com:',
  'domains.unavailable': '{host} não pode ser usado.',
  'domains.reason.hostTaken':
    'Ele já está em um servidor da BladeCP. Se o servidor é seu, você o vê com:',
  'domains.reason.zoneOther':
    'Ele pertence a outra conta da BladeCP. Se o domínio é seu, fale com o suporte:',
  'domains.reason.unknown': 'A BladeCP não disse o motivo.',
  'domains.error.host': '"{host}" não é um domínio. Escreva como blog.example.com.',
  'domains.error.primary': '{host} é o domínio principal deste servidor e sempre fica com ele.',
  'domains.hint.list': 'Veja os domínios do servidor com bladecp domains list {server}.',
  'domains.hint.inUse':
    'O domínio já está neste servidor ou em outro. Veja o motivo com bladecp domains check {host}.',
  'domains.hint.zone':
    'O domínio pertence a outra conta da BladeCP. Se ele é seu, fale com o suporte: {support}',
  'domains.hint.limit':
    'O servidor chegou ao limite de domínios adicionais. Remova um antes, ou passe para um plano maior.',
};

export const es: Record<keyof typeof en, string> = {
  'domains.help.topic': 'Ver, agregar y quitar los dominios de un servidor',
  'domains.help.list': 'Listar los dominios de un servidor',
  'domains.help.add': 'Agregar un dominio a un servidor',
  'domains.help.remove': 'Quitar un dominio de un servidor',
  'domains.help.check': 'Comprobar si un dominio se puede usar en BladeCP',
  'domains.help.listDesc':
    'Muestra el dominio principal de un servidor, los otros dominios que también atiende y su dirección de vista previa.',
  'domains.help.addDesc':
    'Agrega un dominio a un servidor, junto a su dominio principal. El sitio responde en la nueva dirección cuando el DNS del dominio apunta a BladeCP.',
  'domains.help.removeDesc':
    'Quita uno de los dominios adicionales de un servidor. En una terminal pregunta antes. El dominio principal siempre se queda.',
  'domains.help.checkDesc':
    'Dice si un dominio está libre para usar en BladeCP y, cuando no lo está, por qué. No reserva nada: lo que cuenta es agregar el dominio a un servidor.',
  'domains.help.serverArg': 'El servidor: su ID, o sus primeros caracteres (al menos 4).',
  'domains.help.hostArg': 'El dominio, por ejemplo blog.example.com.',
  'domains.option.yesRemove': 'No preguntar antes de quitar en la terminal',
  'domains.ex.list': 'Los dominios de un servidor',
  'domains.ex.add': 'Agregarle otro dominio',
  'domains.ex.remove': 'Quitarlo sin la pregunta',
  'domains.ex.check': 'Comprobar un dominio antes de agregarlo',
  'domains.column.kind': 'TIPO',
  'domains.kind.primary': 'principal',
  'domains.kind.additional': 'adicional',
  'domains.kind.preview': 'vista previa',
  'domains.additionalNone': 'Ningún dominio adicional',
  'domains.additionalOne': '1 dominio adicional',
  'domains.additionalMany': '{count} dominios adicionales',
  'domains.previewNote':
    'La dirección de vista previa muestra el sitio incluso antes de que sus dominios apunten a BladeCP.',
  'domains.next.add': 'Agrega un dominio con:',
  'domains.added': '{host} se agregó al servidor.',
  'domains.addedNext':
    'El sitio responde ahí cuando el DNS del dominio apunte a BladeCP. Ve todos los dominios con:',
  'domains.removeAsk': '¿Quitar {host}?',
  'domains.removeDetail':
    'El sitio de {server} deja de responder en esta dirección. Puedes agregarlo de nuevo después.',
  'domains.removed': '{host} se quitó del servidor.',
  'domains.removedNext': 'Ve los dominios que quedan con:',
  'domains.declined': 'No se cambió nada.',
  'domains.available': '{host} está libre para usar.',
  'domains.availableNext': 'Agrégalo a uno de tus servidores con:',
  'domains.unavailable': '{host} no se puede usar.',
  'domains.reason.hostTaken':
    'Ya está en un servidor de BladeCP. Si el servidor es tuyo, lo ves con:',
  'domains.reason.zoneOther':
    'Pertenece a otra cuenta de BladeCP. Si el dominio es tuyo, habla con soporte:',
  'domains.reason.unknown': 'BladeCP no dijo por qué.',
  'domains.error.host': '"{host}" no es un dominio. Escríbelo como blog.example.com.',
  'domains.error.primary':
    '{host} es el dominio principal de este servidor y siempre se queda con él.',
  'domains.hint.list': 'Ve los dominios del servidor con bladecp domains list {server}.',
  'domains.hint.inUse':
    'El dominio ya está en este servidor o en otro. Ve por qué con bladecp domains check {host}.',
  'domains.hint.zone':
    'El dominio pertenece a otra cuenta de BladeCP. Si es tuyo, habla con soporte: {support}',
  'domains.hint.limit':
    'El servidor llegó al límite de dominios adicionales. Quita uno antes, o pasa a un plan más grande.',
};
