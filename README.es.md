<p align="center">
  <picture>
    <source media="(max-width: 600px)" srcset="https://raw.githubusercontent.com/bladecp/bladecp-cli/main/assets/hero-compact.es.svg">
    <img src="https://raw.githubusercontent.com/bladecp/bladecp-cli/main/assets/hero.es.svg" alt="BladeCP CLI. Línea de comandos oficial: BladeCP en tu terminal. Inicia sesión, lista tus servidores y migra respaldos de cPanel, con acceso por el navegador, migración reanudable y salida JSON estable para scripts y agentes de IA." width="100%">
  </picture>
</p>

<p align="center">
  <strong>Inicia sesión, lista tus servidores y migra respaldos de cPanel a BladeCP desde la terminal.</strong><br>
  La línea de comandos oficial y de código abierto de la Customer API de BladeCP, hecha para personas, scripts y agentes de IA.
</p>

<p align="center">
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/versi%C3%B3n-0.3.0-4f46e5?style=flat-square&amp;labelColor=1e1b4b" alt="Versión 0.3.0"></a>
  <a href="https://www.npmjs.com/package/@bladecp/cli"><img src="https://img.shields.io/badge/npm-%40bladecp%2Fcli-6366f1?style=flat-square&amp;labelColor=1e1b4b&amp;logo=npm&amp;logoColor=white" alt="Paquete npm @bladecp/cli"></a>
  <a href="#instalacion"><img src="https://img.shields.io/badge/Node.js-20%2B-4f46e5?style=flat-square&amp;labelColor=1e1b4b&amp;logo=nodedotjs&amp;logoColor=white" alt="Node.js 20 o posterior"></a>
  <a href="#primeros-pasos"><img src="https://img.shields.io/badge/idiomas-EN%20%C2%B7%20PT--BR%20%C2%B7%20ES-7c3aed?style=flat-square&amp;labelColor=1e1b4b" alt="Inglés, portugués (Brasil) y español"></a><br>
  <a href="#calidad"><img src="https://img.shields.io/badge/pruebas-1130%20aprobadas-8b5cf6?style=flat-square&amp;labelColor=1e1b4b" alt="1130 pruebas automatizadas aprobadas en la versión 0.3.0"></a>
  <a href="#calidad"><img src="https://img.shields.io/badge/dependencias%20en%20runtime-0-6d28d9?style=flat-square&amp;labelColor=1e1b4b" alt="Sin dependencias en runtime"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licencia-MIT-4338ca?style=flat-square&amp;labelColor=1e1b4b" alt="Licencia MIT"></a>
  <a href="https://github.com/bladecp/bladecp-cli/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/bladecp/bladecp-cli/ci.yml?branch=main&amp;style=flat-square&amp;labelColor=1e1b4b&amp;label=CI%20p%C3%BAblica" alt="Estado de la CI pública"></a>
</p>

<p align="center">
  <code>npm install -g @bladecp/cli</code>
  <br>
  <a href="https://www.npmjs.com/package/@bladecp/cli"><strong>Instalar con npm</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/bladecp/bladecp-cli/releases/tag/v0.3.0">Notas de la versión</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/bladecp/bladecp-cli/releases/download/v0.3.0/SHA256SUMS">Checksum SHA-256</a>
</p>

<p align="center">
  <a href="#funciones">Funciones</a> ·
  <a href="#arquitectura">Arquitectura</a> ·
  <a href="#instalacion">Instalación</a> ·
  <a href="#primeros-pasos">Primeros pasos</a> ·
  <a href="#automatizacion">Automatización</a> ·
  <a href="#documentacion">Documentación</a> ·
  <a href="#seguridad">Seguridad</a> ·
  <a href="#soporte">Soporte</a>
  <br>
  <sub><a href="README.md">English</a> · <a href="README.pt-BR.md">Português (Brasil)</a></sub>
</p>

> [!NOTE]
> **Versión `0.3.0`.** `bladecp analyze` muestra qué tiene un respaldo de
> cPanel y qué llega a BladeCP antes de migrar, en tu equipo y sin enviar
> nada, y el analizador también es una biblioteca (`@bladecp/cli/analyzer`).
> Los códigos de salida, el sobre `--json` y los códigos de error son un
> contrato público: esta versión solo agrega.

BladeCP CLI es el cliente oficial de terminal de la Customer API de BladeCP.
Inicia sesión con el navegador, lista tus servidores y los destinos disponibles
para migraciones, y lleva un sitio a BladeCP a partir de un respaldo completo de
cPanel: sube el respaldo por partes, sigue la migración y se detiene en la vista
previa, esperando tu aprobación.

Antes de migrar, `bladecp analyze` lee el respaldo en tu equipo y muestra qué
tiene, qué llega a BladeCP, qué se queda y el plan más chico que necesita. No
se envía nada.

Es un solo paquete npm, sin dependencias en runtime. En la terminal solo pregunta
lo que no puede averiguar por sí misma. En scripts, CI y agentes de IA nunca
pregunta y responde en JSON.

<a id="funciones"></a>

## Hecha para la terminal

| Acceso con el navegador | Migración reanudable | Lista para automatizar |
| --- | --- | --- |
| `bladecp login` abre el Hub, autorizas una vez y la clave se guarda legible solo por ti. Una clave del Hub o `BLADECP_API_KEY` también sirven. | El respaldo sube por partes, tres a la vez, con reintentos. Si se detiene, ejecuta el mismo comando otra vez: solo se envían las partes que faltan. | `--json` imprime exactamente un documento, los códigos de salida son estables y la CLI nunca pregunta nada sin terminal. |

### Comandos

| Comando | Qué hace |
| --- | --- |
| `bladecp login [--token <clave>] [--no-browser]` | Iniciar sesión |
| `bladecp logout` | Quitar el inicio de sesión guardado |
| `bladecp whoami` | Mostrar la cuenta y la clave en uso |
| `bladecp` | En la terminal: bienvenida con lo que te necesita ahora |
| `bladecp servers list [--all]` | Listar tus servidores (`--all` muestra también los eliminados) |
| `bladecp servers show <uuid>` | Mostrar un servidor y su uso de recursos |
| `bladecp destinations list [--currency <código>]` | Planes, disco, precios mensuales y ubicaciones disponibles para migraciones |
| `bladecp analyze <backup.tar.gz> [--prices]` | Ver qué tiene un respaldo de cPanel y qué llega a BladeCP, sin internet |
| `bladecp migrate <backup.tar.gz>` | Subir un respaldo de cPanel y migrar el sitio |
| `bladecp migrations list` | Listar tus migraciones |
| `bladecp migrations status <uuid> [--watch]` | Mostrar o seguir una migración |
| `bladecp migrations review <uuid> --domain <host>` | Confirmar el dominio de una migración |
| `bladecp migrations approve <uuid> [--yes]` | Aprobar después de revisar la vista previa |
| `bladecp migrations cancel <uuid> [--reason <texto>] [--yes]` | Cancelar una migración |
| `bladecp migrations retry <uuid>` | Reintentar una migración que falló |
| `bladecp update [--check] [--yes]` | Ver qué cambió y actualizar la CLI |
| `bladecp config list` / `get <clave>` / `set <clave> <valor>` | Preferencias: `auto-update`, `update-check`, `lang` |

Opciones globales: `--json`, `--api-url <url>` (o `BLADECP_API_URL`,
predeterminada `https://api.bladecp.com`), `--lang en|pt-BR|es`, `--debug` (o
`--verbose`), `--help`, `--version`. Donde un comando recibe un ID, bastan sus
primeros caracteres (al menos 4) cuando solo uno de tus elementos empieza con
ellos. La [referencia de comandos](docs/commands.md), en inglés, trae todas las
opciones.

### De qué se encarga la CLI

- **Menos pasos.** En la terminal, `migrate` solo pregunta a dónde va el sitio,
  una confirmación y, cuando el respaldo lo necesita, el dominio. Cada pregunta
  tiene una opción equivalente.
- **El destino nunca se adivina.** Sin terminal, nunca elige a dónde va el sitio:
  indica `--plan` y `--location`, o `--yes` cuando tu cuenta tiene exactamente un
  destino.
- **Nunca pregunta dos veces.** Una vez confirmado el dominio de una migración, la
  CLI sigue esperando a que BladeCP continúe, sin volver a preguntar.
- **Completada al aprobar.** La migración concluye cuando apruebas la vista
  previa. Apuntar el dominio es opcional; la CLI muestra los nameservers de
  BladeCP y, cuando la API la devuelve, la dirección para un registro A.
- **Avisa cuando algo tarda.** Una fase que pasa de su tiempo normal aparece en
  la pantalla (y en `--json` como `slowPhase`), con cómo seguirla después y,
  cuando tarda mucho, cómo contactar al soporte.
- **Cabe en tu ventana.** Tablas, ayuda y progreso se adaptan a 40, 80 o 120
  columnas; el porcentaje de la subida siempre queda visible.
- **Se mantiene al día.** Una vez al día la CLI pregunta a npm cuál es la versión
  más reciente y muestra una línea discreta al final de un comando interactivo.
  `bladecp update` muestra qué cambió y actualiza con el gestor de paquetes que
  la instaló. No se envía nada más.
- **Tres idiomas.** Mensajes en inglés, portugués de Brasil y español, según
  `LC_ALL`, `LC_MESSAGES` o `LANG`, `bladecp config set lang`, o elegidos con
  `--lang`.

## Arquitectura

La CLI separa lo que pasa en tu computadora, lo que guarda allí y lo que va a
BladeCP. La clave solo se envía a la dirección de la API en uso, por HTTPS, y las
partes del respaldo van directo al almacenamiento con URLs prefirmadas.

<p align="center">
  <picture>
    <source media="(max-width: 600px)" srcset="https://raw.githubusercontent.com/bladecp/bladecp-cli/main/assets/architecture-compact.es.svg">
    <img src="https://raw.githubusercontent.com/bladecp/bladecp-cli/main/assets/architecture.es.svg" alt="Arquitectura de BladeCP CLI. En tu computadora o en CI, la terminal, los scripts y los agentes de IA ejecutan los comandos, el navegador responde el inicio de sesión en 127.0.0.1 y el respaldo de cPanel se lee por partes. La CLI guarda la sesión en un config.json privado, muestra la salida escapada y con la clave oculta, y su cliente de API llama a la Customer API en api.bladecp.com por HTTPS. El envío reanudable manda las partes del respaldo directo al almacenamiento con URLs prefirmadas y registra el progreso localmente, y la CLI sigue la migración hasta la vista previa y la aprobación." width="100%">
  </picture>
</p>

<p align="center"><sub>Vista lógica de la CLI. <a href="assets/architecture.es.svg">Abrir el diagrama en tamaño completo</a>.</sub></p>

### Del respaldo al sitio aprobado

1. **Revisión local.** `bladecp migrate` revisa el archivo: un archivo regular,
   no vacío, de hasta 50 GB, que empieza con la firma gzip de un respaldo
   `.tar.gz`.
2. **Destino.** La migración se crea en el plan y la ubicación que elegiste, de
   `bladecp destinations list`.
3. **Envío reanudable.** El cliente de la API pide a la Customer API las URLs
   prefirmadas, y cada parte va directo al almacenamiento, tres a la vez. Una
   parte que falla se reintenta con una espera creciente. El progreso se guarda
   localmente, nunca la clave.
4. **Seguimiento.** BladeCP confirma el respaldo y la CLI sigue cada etapa. Si
   hay que confirmar el dominio, pregunta una vez; Enter acepta el dominio
   encontrado en el respaldo.
5. **Vista previa y aprobación.** Cuando el sitio está listo, la CLI muestra la
   dirección de la vista previa y el comando para aprobarla, y termina con código
   de salida `0`. Después de tu aprobación, la migración queda completada.

| Capa | Responsabilidad |
| --- | --- |
| **Comandos** | Argumentos, preguntas solo en la terminal, idioma |
| **Salida** | Texto o el sobre `--json`; texto externo escapado, clave oculta |
| **Sesión** | Navegador (PKCE S256, respuesta en `127.0.0.1`), `--token` o `BLADECP_API_KEY`, guardada en un `config.json` privado |
| **Cliente de la API** | HTTPS con la clave Bearer, `429` con `Retry-After`, reintentos |
| **Envío** | Partes del plan de envío de BladeCP, transmitidas con tamaño explícito, reanudadas desde el progreso local |
| **Estado local** | La carpeta de la CLI: la sesión guardada y el progreso de los envíos interrumpidos |

<a id="instalacion"></a>

## Instalación rápida

Necesitas Node.js 20 o posterior, en macOS, Linux o Windows, y acceso HTTPS de
salida a `api.bladecp.com` (y a `hub.bladecp.com` en el navegador, para iniciar
sesión).

```sh
npm install -g @bladecp/cli
bladecp --version
```

O ejecútala sin instalar:

```sh
npx @bladecp/cli login
```

### Verificar una descarga de la versión

Cada [versión en GitHub](https://github.com/bladecp/bladecp-cli/releases) trae el
tarball del paquete npm, su checksum y las notas de la versión. El tarball es el
mismo archivo publicado en npm.

| Archivo | Para qué sirve |
| --- | --- |
| [**bladecp-cli-0.3.0.tgz**](https://github.com/bladecp/bladecp-cli/releases/download/v0.3.0/bladecp-cli-0.3.0.tgz) | El paquete npm: `dist/`, READMEs, changelog, licencia y `package.json` |
| [**SHA256SUMS**](https://github.com/bladecp/bladecp-cli/releases/download/v0.3.0/SHA256SUMS) | Checksum para verificar el tarball |
| [**RELEASE_NOTES.md**](https://github.com/bladecp/bladecp-cli/releases/download/v0.3.0/RELEASE_NOTES.md) | Notas de esta versión |

```sh
shasum -a 256 -c SHA256SUMS          # en Linux: sha256sum -c SHA256SUMS
npm install -g ./bladecp-cli-0.3.0.tgz
```

### Actualizar y desinstalar

```sh
bladecp update                       # qué cambió, luego actualiza con npm, pnpm, yarn o bun
bladecp config set auto-update on    # opcional: actualizar sola antes de un comando
bladecp logout                       # quita la clave guardada de esta computadora
npm uninstall -g @bladecp/cli
```

La comprobación diaria solo pregunta al registro de npm el número de la versión
más reciente. Desactívala con `BLADECP_NO_UPDATE_CHECK=1`, `NO_UPDATE_NOTIFIER` o
`bladecp config set update-check off`.

`bladecp logout` no revoca la clave: revócala en
[Claves de API](https://hub.bladecp.com/account/api-keys). La
[guía de instalación](docs/installation.md), en inglés, trae los detalles.

## Primeros pasos

```sh
bladecp login                        # abre el navegador, un clic para autorizar
bladecp whoami                       # la cuenta y la clave en uso
bladecp servers list                 # tus servidores
bladecp destinations list            # planes y ubicaciones para migraciones
bladecp analyze cpmove-user.tar.gz   # qué se migra y el plan mínimo, sin internet
bladecp migrate cpmove-user.tar.gz   # sube, sigue la migración y muestra la vista previa
bladecp migrations approve <uuid>    # después de revisar la vista previa
```

### Inicio de sesión

| Forma | Cuándo usarla |
| --- | --- |
| `bladecp login` | En tu computadora. Abre el Hub en el navegador; autorizas BladeCP CLI y la terminal recibe una clave válida por 30 días. |
| `bladecp login --no-browser` | El navegador no se abrió. Se muestra la dirección para que la abras en la misma computadora. |
| `bladecp login --token <clave>` | Ya tienes una clave de API del Hub ([Claves de API](https://hub.bladecp.com/account/api-keys)). Usa `--token -` para leerla de la entrada estándar y que no quede en el historial del shell. |
| `BLADECP_API_KEY=<clave>` | Scripts, CI y servidores remotos. No se guarda nada; cada comando usa la variable. |

La clave se guarda en `~/.config/bladecp/config.json` (macOS y Linux) o
`%APPDATA%\bladecp\config.json` (Windows), legible solo por ti. La CLI nunca la
muestra. Consulta [autenticación](docs/authentication.md), en inglés.

### Analizar un respaldo antes de migrar

`bladecp analyze` lee un respaldo completo de cPanel en tu equipo, una vez y
como flujo, y muestra:

- **qué tiene el respaldo:** la cuenta, los sitios (principal, dominios
  adicionales y subdominios, con WordPress y la versión de PHP de cada uno),
  las bases de datos con motor y versión, los dominios y buzones de correo,
  las zonas DNS, las tareas cron, los archivos y el tamaño;
- **qué llega a BladeCP y qué se queda:** llegan los sitios y sus archivos,
  todas las bases de datos MySQL y MariaDB, los buzones por IMAP y POP3 con el
  MX conservado, la zona DNS completa, las tareas cron y la versión de PHP de
  cada sitio; los certificados SSL se emiten de nuevo cuando el dominio apunte
  a BladeCP, y la contraseña de cPanel se queda (a BladeCP se entra con tu
  correo);
- **avisos y rechazos:** cuando la migración rechazaría el respaldo tal como
  está (un archivo dañado o cortado, un sitio que no es WordPress, WordPress
  Multisite activo, un valor de `wp-config.php` que no acepta), dice por qué y
  qué hacer;
- **el plan mínimo:** disco y bases de datos, y el comando `bladecp migrate`
  listo.

| Opción | Efecto |
| --- | --- |
| `--prices` | Muestra también el plan más barato de tu cuenta que cabe, con el precio de ahora y el `--plan` y el `--location` para usar. Requiere iniciar sesión; envía solo la moneda |
| `--currency <código>` | Precios en una moneda, junto con `--prices` |
| `--json` | El informe en el esquema `bladecp.analyze.v1` |

El análisis no requiere iniciar sesión ni internet: nada del respaldo sale de
tu equipo, y contraseñas, claves y el texto de `wp-config.php` nunca aparecen
en la pantalla ni en el informe. El código de salida `0` significa que el
respaldo se migra (quizá con avisos), y el `6`, que no se migra tal como está.

El mismo analizador es una biblioteca sin dependencias, para Node y
navegadores:

```js
import { analyzeFile } from '@bladecp/cli/analyzer/node';

const report = await analyzeFile('cpmove-user.tar.gz');
console.log(report.verdict, report.blockers, report.requirements);
```

`@bladecp/cli/analyzer/web` lee un `File` o `Blob` (en un Web Worker, por
ejemplo) con `DecompressionStream`.

### Migrar un respaldo de cPanel

Usa el respaldo completo generado por cPanel, por ejemplo `cpmove-user.tar.gz`,
de hasta 50 GB.

| Opción | Efecto |
| --- | --- |
| `--plan <id> --location <id>` | Destino, de `bladecp destinations list` |
| `--domain <host>` | Dominio que usará el sitio migrado |
| `--yes` | Sin confirmación; acepta el dominio encontrado en el respaldo y, cuando tu cuenta tiene exactamente un destino, ese destino. Nunca aprueba la migración |
| `--no-wait` | Termina cuando el respaldo se recibe |

**¿Se interrumpió la subida?** Ejecuta el mismo comando otra vez. La CLI recuerda
la migración de ese archivo y envía solo las partes que faltan. Si el respaldo ya
se recibió, simplemente sigue la migración.

En la terminal, cuando la vista previa está lista, `o` la abre y `a` aprueba; `d`
decide después. Ctrl+C mientras se sigue la migración solo deja de seguirla; la
migración continúa. Revísala después con `bladecp migrations status <uuid> --watch`.

<a id="automatizacion"></a>

## Automatización y JSON

Con `--json`, cada comando imprime exactamente un documento JSON en la salida
estándar, sin colores, progreso ni preguntas:

```json
{ "ok": true, "data": { "migrationUuid": "…", "phase": "awaiting_approval", "previewUrl": "https://…", "nextAction": { "type": "approve", "command": "bladecp migrations approve …" } } }
```

Los errores usan el mismo sobre. `code` es estable; `message` sigue el idioma
elegido:

```json
{ "ok": false, "error": { "code": "not_found", "message": "…", "exitCode": 5, "status": 404 } }
```

Una migración sin preguntas:

```sh
BLADECP_API_KEY=… bladecp migrate site.tar.gz --plan 12 --location 3 --domain example.com --json
```

`migrations status --watch --json` imprime una línea JSON por cada cambio,
errores incluidos, y termina con código de salida `0` cuando la migración está
completada. Los comandos de lectura devuelven los objetos de la API sin cambios
en `data`; la CLI solo agrega campos como `domainPointing` y `slowPhase`.
`--help --json` devuelve la ayuda como un documento. La
[guía de automatización](docs/automation.md), en inglés, describe cada campo y
trae un ejemplo con GitHub Actions.

`bladecp analyze --json` siempre responde `{ "ok": true, "data": <informe> }`,
también cuando el respaldo no se migra (código de salida `6`): decide por
`verdict` (`supported`, `supported_with_warnings` o `blocked`), `blockers` y
`warnings`, cuyos valores de `code` están en `reference.json`.

| Código | Significado |
| --- | --- |
| 0 | Éxito (en `migrate`, el sitio está listo para revisión) |
| 1 | Error inesperado |
| 2 | Uso o entrada no válida (opción, archivo, destino faltante sin terminal) |
| 3 | Sin sesión, clave no aceptada o falla al iniciar sesión |
| 4 | Sin permiso |
| 5 | No encontrado |
| 6 | Rechazado por la API (por ejemplo, una acción no disponible en la etapa actual), o un respaldo que no se migra tal como está (`analyze`) |
| 7 | Límite de solicitudes |
| 8 | Error de red o del servidor, o falla en la subida |
| 9 | Migración fallida o cancelada |
| 10 | Esperando una acción tuya (por ejemplo, confirmar el dominio) |
| 11 | Actualización necesaria (la API ya no acepta esta versión: ejecuta `bladecp update`) |
| 130 | Interrumpido |

| Variable | Para qué sirve |
| --- | --- |
| `BLADECP_API_KEY` | Clave de API que se usa en lugar del inicio de sesión guardado |
| `BLADECP_API_URL` | Dirección de la API (igual que `--api-url`) |
| `BLADECP_HUB_URL` | Dirección del Hub para el inicio de sesión y los enlaces (por defecto: el Hub de la API) |
| `BLADECP_CONFIG_DIR` | Carpeta del inicio de sesión guardado, las preferencias y el progreso de las subidas (`~` se expande) |
| `BLADECP_NO_UPDATE_CHECK` | `1` nunca busca una versión nueva (`NO_UPDATE_NOTIFIER` también sirve) |
| `BLADECP_MOTION` | `off` muestra la B sin animación, `reduced` solo su último cuadro |
| `NO_COLOR` | Desactiva los colores (cualquier valor no vacío) |
| `FORCE_COLOR` | Fuerza los colores (`1`, `2` o `3`), también en pipes, o los desactiva (`0`) |
| `CI` | Nunca pregunta y nunca anima |

[`reference.json`](reference.json) lista cada comando, opción, alias, código de
salida y código de error, con los mensajes en los tres idiomas, para
herramientas que no deben interpretar el texto de ayuda.

<a id="documentacion"></a>

## Documentación

Las guías están en inglés.

| Guía | Qué encontrarás |
| --- | --- |
| [Instalación](docs/installation.md) | Requisitos, npm, checksum, actualización, desinstalación y compilación desde el código |
| [Autenticación](docs/authentication.md) | Inicio de sesión con el navegador, claves, dónde se guarda la clave y errores de acceso |
| [Comandos](docs/commands.md) | Cada comando, opción, código de salida y variable de entorno |
| [Automatización y JSON](docs/automation.md) | Uso sin terminal, el sobre JSON, reintentos y CI |
| [Solución de problemas](docs/troubleshooting.md) | Instalación, inicio de sesión, migración y red |
| [Proceso de versión](docs/release-process.md) | Cómo se preparan y verifican las versiones públicas |
| [Gobernanza del repositorio](docs/repository-governance.md) | Issues, pull requests, historial y versiones |
| [Changelog](CHANGELOG.md) | Cambios de cada versión pública |
| [Política de seguridad](SECURITY.md) | Reporte privado de vulnerabilidades |
| [Cómo contribuir](CONTRIBUTING.md) | Cómo proponer y validar un cambio |

La guía para desarrolladores en
[developers.bladecp.com/es/cli](https://developers.bladecp.com/es/cli) muestra la
CLI junto con la Customer API, en español.

## Seguridad

- **La clave queda protegida.** Solo se envía a la dirección de la API en uso,
  por HTTPS; HTTP sin cifrar solo en `localhost`. Nunca aparece en la salida, en
  los errores ni en los archivos de progreso de subida, y la sesión guardada es
  legible solo por ti.
- **Acceso seguro con el navegador.** Un código de un solo uso con PKCE (S256) y
  un `state` aleatorio, recibidos en `127.0.0.1`. Una respuesta que esta terminal
  no inició se ignora.
- **Una terminal que no se puede secuestrar.** Los textos recibidos de la API, de
  la red o de nombres de archivo se muestran con los caracteres de control
  escapados, así que no pueden alterar tu pantalla, enlaces, título o
  portapapeles.
- **Nada más en qué confiar.** Sin dependencias en runtime: `fetch`,
  `util.parseArgs`, `http(s)` y `readline` nativos. Cada versión publica el
  tarball verificado y su checksum SHA-256.
- **El cierre de sesión es local.** `bladecp logout` quita la clave de la
  computadora; la Customer API no tiene una ruta para revocar la clave en uso,
  así que revoca una clave que ya no uses en
  [Claves de API](https://hub.bladecp.com/account/api-keys).
- **Sin telemetría.** La comprobación diaria de versión pregunta al registro de
  npm un número de versión, nada más, y se puede desactivar.

Para reportar una vulnerabilidad en privado, sigue [SECURITY.md](SECURITY.md).
Nunca incluyas una clave de API en un issue público.

<a id="calidad"></a>

## Calidad y validación

La versión `0.3.0` fue validada por los mantenedores con **1130 pruebas
automatizadas** en 19 archivos, ejecutadas con Vitest contra una Customer
API simulada (`test/helpers/mock-api.ts`) y un registro npm simulado, nunca
reales. Cubren todos los comandos, la migración y sus etapas, el inicio de
sesión con el navegador y el retorno local, la sesión guardada, los tres
catálogos de mensajes, el envío por partes, las actualizaciones, secuencias
hostiles de terminal, los snapshots de `--json`, `reference.json`, la ocultación
de la clave en todos los comandos, una foto de cada pantalla en 40, 80 y 120
columnas en los tres idiomas, con y sin color, y un candado que mantiene todo lo
visual en un único kit. La insignia de pruebas representa esa ejecución.

Antes de una versión, el paquete se arma a partir del árbol público curado, el
árbol y el tarball pasan por un escaneo de credenciales y referencias no
públicas, y el propio tarball se instala en un prefijo descartable para ejecutar
`bladecp --version` y `bladecp --help`.

La [CI pública](https://github.com/bladecp/bladecp-cli/actions/workflows/ci.yml)
ejecuta lint, verificación de tipos, pruebas, compilación, la verificación de
`reference.json` y la compuerta del árbol público
(`scripts/check-public-tree.sh --package`) en Node.js 24, y la compilación y las
pruebas en Node.js 20.

<a id="desarrollo"></a>

## Desarrollo y contribución

El desarrollo usa Node.js 24 (consulta `.nvmrc`) y la versión de pnpm indicada en
el campo `packageManager` de `package.json`.

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
  bin.ts, cli.ts   Entrada, lectura de argumentos, despacho e informe de errores
  commands/        account, servers, migrate, migrations, follow, home, update, config
  ui/              El kit visual: salida, terminal, piezas, preguntas y la B en 3D
  update/          Comprobación diaria de versión, forma de instalación y novedades
  auth/            Credenciales, PKCE y el retorno en 127.0.0.1
  upload/          Plan de partes, PUT en stream, estado local y envío
  i18n/            Inglés (base), portugués (Brasil) y español
test/              Suite de Vitest con una Customer API simulada
scripts/           Auxiliares de compilación y la compuerta del árbol público
docs/              Guías
assets/            Arte del README
reference.json     Referencia para máquinas
```

Las contribuciones son bienvenidas. Lee [CONTRIBUTING.md](CONTRIBUTING.md) antes
de abrir un issue o un pull request: cada mensaje existe en los tres idiomas,
cada pantalla se arma con el kit visual de `src/ui/`, el texto externo nunca
llega sin escapar a la terminal, la clave nunca llega a la
salida, y un cambio de comando o mensaje vuelve a generar `reference.json`. Las
contribuciones aprobadas siguen el flujo de mantenimiento del proyecto antes de
aparecer en una versión pública posterior.

<a id="preguntas"></a>

## Preguntas frecuentes

<details>
<summary><strong>¿Necesito algo además de Node.js?</strong></summary>

No. El paquete no tiene dependencias en runtime. Basta Node.js 20 o posterior, en
macOS, Linux o Windows.

</details>

<details>
<summary><strong>¿Puedo iniciar sesión en un servidor remoto por SSH?</strong></summary>

Sí, con una clave. El acceso con el navegador responde en `127.0.0.1` de la
computadora que ejecuta la CLI; en un servidor remoto, crea una clave en
[Claves de API](https://hub.bladecp.com/account/api-keys) y usa
`bladecp login --token -` o `BLADECP_API_KEY`.

</details>

<details>
<summary><strong>La subida se detuvo. ¿Empiezo de nuevo?</strong></summary>

No. Ejecuta el mismo `bladecp migrate` con el mismo archivo. La CLI envía solo
las partes que faltan, o sigue la migración si el respaldo ya se recibió.

</details>

<details>
<summary><strong>¿Apuntar el dominio retrasa la migración?</strong></summary>

No. La migración concluye cuando apruebas la vista previa. Apuntar el dominio es
opcional y puede esperar lo que quieras; mientras tanto, el sitio antiguo sigue
en línea.

</details>

<details>
<summary><strong>¿Es seguro usarla en scripts y agentes de IA?</strong></summary>

Sí. Con `--json` no hay preguntas ni colores, y sale exactamente un documento
JSON. Sin terminal la CLI nunca elige el destino, y los códigos de salida y de
error son estables.

</details>

<details>
<summary><strong>"Tu clave de API no fue aceptada" o "venció". ¿Y ahora?</strong></summary>

Ejecuta `bladecp login` de nuevo, o crea una clave nueva en
[Claves de API](https://hub.bladecp.com/account/api-keys). La
[guía de solución de problemas](docs/troubleshooting.md), en inglés, cubre los
códigos de error más comunes.

</details>

## Soporte

| Asunto | Canal |
| --- | --- |
| Error reproducible o pedido de producto | [GitHub Issues](https://github.com/bladecp/bladecp-cli/issues) |
| Soporte técnico y de producto | [dev@bladecp.com](mailto:dev@bladecp.com) |
| Vulnerabilidad | [Política de seguridad](SECURITY.md) |
| Guías | [developers.bladecp.com/es/cli](https://developers.bladecp.com/es/cli) |

En reportes públicos, incluye la versión de la CLI, la versión de Node.js, el
sistema operativo, el comando y el `code` del error. Nunca incluyas una clave de
API.

## Licencia

BladeCP CLI se distribuye bajo la [Licencia MIT](LICENSE). La licencia de la CLI
no reemplaza los términos de los servicios de BladeCP.

<p align="center"><strong>BladeCP. Tus sitios a un comando de distancia.</strong></p>
