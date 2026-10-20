// Messages of the api commands. Keys start with "api.".
// Every key exists in the three languages with the same {placeholders}, and
// the em dash is never used.

export const en = {
  'api.help.call': 'Call any Customer API route with your sign-in',
  'api.help.list': 'List every API route and the command that covers it',
  'api.help.desc':
    'Sends one request to the Customer API with the key you signed in with, and prints the answer as JSON. Reaches every route, including the ones without a command of their own.',
  'api.help.pathArg':
    'The route under /api/v1, starting with /customer/ (a query string is allowed).',
  'api.help.note':
    'The method is GET, or POST when you send a body. DELETE asks first on a terminal; --yes skips the question. The key is sent only to the BladeCP API and never shown.',
  'api.help.listDesc':
    'The routes of the Customer API this version of the CLI knows, with the command that does the same thing. With --json, each route also brings its summary, scopes and parameters.',
  'api.ex.me': 'The account and key in use',
  'api.ex.query': 'Active servers only (quote a path with "?" in the shell)',
  'api.ex.post': 'Add a domain to a server',
  'api.ex.input': 'Send the body from a file ("-" reads it from stdin)',
  'api.ex.listJson': 'Every route, for scripts and AI agents',
  'api.option.method': 'HTTP method: GET, POST, PUT, PATCH or DELETE',
  'api.option.data': 'JSON body of the request',
  'api.option.input': 'File with the JSON body ("-" reads stdin)',
  'api.option.yes': 'Do not ask before a DELETE on a terminal',
  'api.error.path': 'The path must be a Customer API route starting with /customer/, got "{path}".',
  'api.error.method': 'Unknown method "{method}". Use GET, POST, PUT, PATCH or DELETE.',
  'api.error.json': 'The body is not valid JSON ({reason}).',
  'api.error.bodyTwice': 'Use --data or --input, not both.',
  'api.error.bodyNotAllowed': 'A {method} request has no body.',
  'api.error.input': 'Could not read {file}.',
  'api.confirm.delete': 'Send DELETE {path}?',
  'api.confirm.detail': 'The API removes what this route points to.',
  'api.declined': 'Nothing was sent.',
  'api.empty': 'Done. The API answered without content.',
  'api.list.column.method': 'METHOD',
  'api.list.column.path': 'ROUTE',
  'api.list.column.command': 'COMMAND',
  'api.list.summary': '{count} routes · {covered} with a command of their own',
  'api.list.hint': 'Any route answers with "bladecp api <route>".',
};

export const ptBR: Record<keyof typeof en, string> = {
  'api.help.call': 'Chamar qualquer rota da Customer API com o seu login',
  'api.help.list': 'Listar todas as rotas da API e o comando que cobre cada uma',
  'api.help.desc':
    'Envia uma requisição à Customer API com a chave do seu login e mostra a resposta em JSON. Alcança todas as rotas, inclusive as que não têm comando próprio.',
  'api.help.pathArg':
    'A rota sob /api/v1, começando por /customer/ (pode ter parâmetros de consulta).',
  'api.help.note':
    'O método é GET, ou POST quando você envia um corpo. Num terminal, DELETE pergunta antes; --yes pula a pergunta. A chave só vai para a API da BladeCP e nunca aparece.',
  'api.help.listDesc':
    'As rotas da Customer API que esta versão da CLI conhece, com o comando que faz a mesma coisa. Com --json, cada rota traz também o resumo, as permissões e os parâmetros.',
  'api.ex.me': 'A conta e a chave em uso',
  'api.ex.query': 'Só os servidores ativos (use aspas quando a rota tiver "?")',
  'api.ex.post': 'Adicionar um domínio a um servidor',
  'api.ex.input': 'Enviar o corpo de um arquivo ("-" lê da entrada padrão)',
  'api.ex.listJson': 'Todas as rotas, para scripts e agentes de IA',
  'api.option.method': 'Método HTTP: GET, POST, PUT, PATCH ou DELETE',
  'api.option.data': 'Corpo da requisição em JSON',
  'api.option.input': 'Arquivo com o corpo em JSON ("-" lê da entrada padrão)',
  'api.option.yes': 'Não perguntar antes de um DELETE no terminal',
  'api.error.path': 'A rota precisa ser da Customer API e começar por /customer/; recebi "{path}".',
  'api.error.method': 'Método "{method}" desconhecido. Use GET, POST, PUT, PATCH ou DELETE.',
  'api.error.json': 'O corpo não é um JSON válido ({reason}).',
  'api.error.bodyTwice': 'Use --data ou --input, não os dois.',
  'api.error.bodyNotAllowed': 'Uma requisição {method} não tem corpo.',
  'api.error.input': 'Não foi possível ler {file}.',
  'api.confirm.delete': 'Enviar DELETE {path}?',
  'api.confirm.detail': 'A API remove o que esta rota indica.',
  'api.declined': 'Nada foi enviado.',
  'api.empty': 'Pronto. A API respondeu sem conteúdo.',
  'api.list.column.method': 'MÉTODO',
  'api.list.column.path': 'ROTA',
  'api.list.column.command': 'COMANDO',
  'api.list.summary': '{count} rotas · {covered} com comando próprio',
  'api.list.hint': 'Qualquer rota responde com "bladecp api <rota>".',
};

export const es: Record<keyof typeof en, string> = {
  'api.help.call': 'Llamar a cualquier ruta de la Customer API con tu sesión',
  'api.help.list': 'Listar todas las rutas de la API y el comando que cubre cada una',
  'api.help.desc':
    'Envía una solicitud a la Customer API con la clave de tu sesión y muestra la respuesta en JSON. Alcanza todas las rutas, incluidas las que no tienen comando propio.',
  'api.help.pathArg':
    'La ruta bajo /api/v1, que empieza por /customer/ (puede llevar parámetros de consulta).',
  'api.help.note':
    'El método es GET, o POST cuando envías un cuerpo. En una terminal, DELETE pregunta antes; --yes omite la pregunta. La clave solo va a la API de BladeCP y nunca se muestra.',
  'api.help.listDesc':
    'Las rutas de la Customer API que esta versión de la CLI conoce, con el comando que hace lo mismo. Con --json, cada ruta trae también el resumen, los permisos y los parámetros.',
  'api.ex.me': 'La cuenta y la clave en uso',
  'api.ex.query': 'Solo los servidores activos (usa comillas cuando la ruta tenga "?")',
  'api.ex.post': 'Agregar un dominio a un servidor',
  'api.ex.input': 'Enviar el cuerpo desde un archivo ("-" lo lee de la entrada estándar)',
  'api.ex.listJson': 'Todas las rutas, para scripts y agentes de IA',
  'api.option.method': 'Método HTTP: GET, POST, PUT, PATCH o DELETE',
  'api.option.data': 'Cuerpo de la solicitud en JSON',
  'api.option.input': 'Archivo con el cuerpo en JSON ("-" lee la entrada estándar)',
  'api.option.yes': 'No preguntar antes de un DELETE en la terminal',
  'api.error.path':
    'La ruta debe ser de la Customer API y empezar por /customer/; se recibió "{path}".',
  'api.error.method': 'Método "{method}" desconocido. Usa GET, POST, PUT, PATCH o DELETE.',
  'api.error.json': 'El cuerpo no es un JSON válido ({reason}).',
  'api.error.bodyTwice': 'Usa --data o --input, no los dos.',
  'api.error.bodyNotAllowed': 'Una solicitud {method} no lleva cuerpo.',
  'api.error.input': 'No se pudo leer {file}.',
  'api.confirm.delete': '¿Enviar DELETE {path}?',
  'api.confirm.detail': 'La API elimina lo que indica esta ruta.',
  'api.declined': 'No se envió nada.',
  'api.empty': 'Listo. La API respondió sin contenido.',
  'api.list.column.method': 'MÉTODO',
  'api.list.column.path': 'RUTA',
  'api.list.column.command': 'COMANDO',
  'api.list.summary': '{count} rutas · {covered} con comando propio',
  'api.list.hint': 'Cualquier ruta responde con "bladecp api <ruta>".',
};
