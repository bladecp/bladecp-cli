// Messages of the components commands. Keys start with "components.".
// Every key exists in the three languages with the same {placeholders}, and
// the em dash is never used.

export const en = {
  'components.help.topic': 'See the components a server can run',
  'components.help.list': 'List the components of the BladeCP catalog',
  'components.help.listDesc':
    'Components are what a server can run besides the site, such as a database, a cache or the WordPress tools. Which ones a server accepts depends on its product.',
  'components.ex.list': 'Every component of the catalog',
  'components.ex.json': 'With every version, for scripts',
  'components.column.component': 'COMPONENT',
  'components.column.name': 'NAME',
  'components.column.type': 'TYPE',
  'components.column.version': 'VERSION',
  'components.column.plan': 'PLAN',
  'components.plan.included': 'included',
  'components.plan.notIncluded': 'not in your plan',
  'components.countOne': '1 component',
  'components.countMany': '{count} components',
  'components.empty': 'The component catalog is empty.',
  'components.note': 'Which components a server accepts depends on its product.',
  'components.category.databases': 'Databases',
  'components.category.cache': 'Cache',
  'components.category.webservers': 'Web servers',
  'components.category.languages': 'Languages',
};

export const ptBR: Record<keyof typeof en, string> = {
  'components.help.topic': 'Ver os componentes que um servidor pode rodar',
  'components.help.list': 'Listar os componentes do catálogo da BladeCP',
  'components.help.listDesc':
    'Componentes são o que um servidor pode rodar além do site, como um banco de dados, um cache ou as ferramentas do WordPress. Os que um servidor aceita dependem do produto dele.',
  'components.ex.list': 'Todos os componentes do catálogo',
  'components.ex.json': 'Com todas as versões, para scripts',
  'components.column.component': 'COMPONENTE',
  'components.column.name': 'NOME',
  'components.column.type': 'TIPO',
  'components.column.version': 'VERSÃO',
  'components.column.plan': 'PLANO',
  'components.plan.included': 'incluído',
  'components.plan.notIncluded': 'fora do seu plano',
  'components.countOne': '1 componente',
  'components.countMany': '{count} componentes',
  'components.empty': 'O catálogo de componentes está vazio.',
  'components.note': 'Os componentes que um servidor aceita dependem do produto dele.',
  'components.category.databases': 'Bancos de dados',
  'components.category.cache': 'Cache',
  'components.category.webservers': 'Servidores web',
  'components.category.languages': 'Linguagens',
};

export const es: Record<keyof typeof en, string> = {
  'components.help.topic': 'Ver los componentes que puede ejecutar un servidor',
  'components.help.list': 'Listar los componentes del catálogo de BladeCP',
  'components.help.listDesc':
    'Los componentes son lo que un servidor puede ejecutar además del sitio, como una base de datos, una caché o las herramientas de WordPress. Los que acepta un servidor dependen de su producto.',
  'components.ex.list': 'Todos los componentes del catálogo',
  'components.ex.json': 'Con todas las versiones, para scripts',
  'components.column.component': 'COMPONENTE',
  'components.column.name': 'NOMBRE',
  'components.column.type': 'TIPO',
  'components.column.version': 'VERSIÓN',
  'components.column.plan': 'PLAN',
  'components.plan.included': 'incluido',
  'components.plan.notIncluded': 'fuera de tu plan',
  'components.countOne': '1 componente',
  'components.countMany': '{count} componentes',
  'components.empty': 'El catálogo de componentes está vacío.',
  'components.note': 'Los componentes que acepta un servidor dependen de su producto.',
  'components.category.databases': 'Bases de datos',
  'components.category.cache': 'Caché',
  'components.category.webservers': 'Servidores web',
  'components.category.languages': 'Lenguajes',
};
