// Messages of the partner marketplace commands. Keys start with "partnerMarket.".
// Every key exists in the three languages with the same {placeholders}, and
// the em dash is never used.

export const en = {
  // Help
  'partnerMarket.help.topic':
    'Follow your marketplace sales, earnings, statements and base server invoices',
  'partnerMarket.help.summary':
    'Show earnings by currency and how much of your base server they cover',
  'partnerMarket.help.orders': 'List the sales BladeCP made of your plans',
  'partnerMarket.help.commissions':
    'List each paid invoice: the sale, the BladeCP commission and what you receive',
  'partnerMarket.help.statements':
    'List the monthly statements: your earnings netted against your base server',
  'partnerMarket.help.statement': 'Show one statement and its commission lines',
  'partnerMarket.help.invoices': 'List the open invoices of your base server',
  'partnerMarket.help.summaryDesc':
    'BladeCP sells your listed plans on its marketplace, invoices the customer, keeps a commission per product and passes you the net in a monthly statement. This shows your earnings by currency and how much of your base server rent they already cover.',
  'partnerMarket.help.stages':
    'A paid sale starts as pending, is confirmed the next day and is cleared when the holding time of its payment method ends (longer for card payments). Cleared earnings go into the monthly statement.',
  'partnerMarket.help.ordersDesc':
    'Each subscription BladeCP sold of your plans, newest first: the customer, the plan, the price the customer pays and what you receive after the BladeCP commission.',
  'partnerMarket.help.commissionsDesc':
    'The commission ledger: one line per paid invoice of a marketplace sale (first sale, renewal or plan change), with the amount charged, the BladeCP commission and what you receive.',
  'partnerMarket.help.statementsDesc':
    'BladeCP closes one statement a month per currency: your cleared earnings minus the rent of your base server. A positive balance is paid to you; a negative one is charged to you.',
  'partnerMarket.help.statementDesc':
    'The totals of one statement, how it was settled and every commission line in it.',
  'partnerMarket.help.statementArg':
    'Statement number, as "bladecp partner marketplace statements" shows it',
  'partnerMarket.help.invoicesDesc':
    'The open invoices of your base server (the server you rent from BladeCP to resell). The monthly statement takes them off your marketplace earnings.',
  'partnerMarket.ex.summary': 'earnings and base server coverage',
  'partnerMarket.ex.json': 'the same, as JSON (amounts in cents)',
  'partnerMarket.ex.orders': 'the latest sales',
  'partnerMarket.ex.ordersPage': 'the second page, 50 at a time',
  'partnerMarket.ex.commissions': 'lines still waiting to be cleared',
  'partnerMarket.ex.statements': 'every monthly statement',
  'partnerMarket.ex.statement': 'statement 12 with its lines',
  'partnerMarket.ex.invoices': 'what is open on your base server',
  'partnerMarket.option.orderStatus': 'Only sales with this status (active or churned)',
  'partnerMarket.option.lineStatus':
    'Only lines with this status: pending, confirmed, cleared, reversed or rejected',
  'partnerMarket.option.limit': 'How many to show per page (up to 100)',

  // Errors
  'partnerMarket.error.statementId':
    'The statement is a number, as "bladecp partner marketplace statements" shows it. Got "{value}".',
  'partnerMarket.error.limit': 'Option --limit goes from 1 to 100, got "{value}".',
  'partnerMarket.error.page': 'Option --page starts at 1, got "{value}".',

  // Shared pieces
  'partnerMarket.page': 'page {page} of {pages}',
  'partnerMarket.next.page': 'Next page:',
  'partnerMarket.next.orders': 'See the sales:',
  'partnerMarket.next.statements': 'See the monthly statements:',
  'partnerMarket.next.statement': 'See one statement:',
  'partnerMarket.settle.toYou': '{amount} to you',
  'partnerMarket.settle.toBladecp': '{amount} to BladeCP',

  // Summary
  'partnerMarket.summary.title': 'Marketplace',
  'partnerMarket.summary.listings': 'Plans listed',
  'partnerMarket.summary.sold': 'Subscriptions sold',
  'partnerMarket.summary.earnings': 'Earnings in {currency}',
  'partnerMarket.summary.pending': 'Pending',
  'partnerMarket.summary.confirmed': 'Confirmed',
  'partnerMarket.summary.cleared': 'Cleared',
  'partnerMarket.summary.total': 'Total to date',
  'partnerMarket.summary.coverage': 'Base server',
  'partnerMarket.summary.rent': 'Monthly rent',
  'partnerMarket.summary.covered': 'Covered by sales',
  'partnerMarket.summary.remaining': 'Still to cover',
  'partnerMarket.summary.coveredAll':
    'Your marketplace earnings already cover your base server rent.',
  'partnerMarket.summary.salesOne': 'About 1 more sale covers your base server rent.',
  'partnerMarket.summary.salesMany': 'About {count} more sales cover your base server rent.',
  'partnerMarket.summary.empty':
    'No marketplace earnings yet. When BladeCP sells one of your listed plans, it shows up here.',

  // Columns
  'partnerMarket.column.sold': 'SOLD',
  'partnerMarket.column.customer': 'CUSTOMER',
  'partnerMarket.column.plan': 'PLAN',
  'partnerMarket.column.price': 'PRICE',
  'partnerMarket.column.receive': 'YOU RECEIVE',
  'partnerMarket.column.date': 'DATE',
  'partnerMarket.column.product': 'PRODUCT',
  'partnerMarket.column.type': 'TYPE',
  'partnerMarket.column.sale': 'SALE',
  'partnerMarket.column.commission': 'COMMISSION',
  'partnerMarket.column.period': 'PERIOD',
  'partnerMarket.column.earnings': 'EARNINGS',
  'partnerMarket.column.baseServer': 'BASE SERVER',
  'partnerMarket.column.settlement': 'BALANCE',
  'partnerMarket.column.invoice': 'INVOICE',
  'partnerMarket.column.due': 'DUE',
  'partnerMarket.column.total': 'TOTAL',

  // Orders
  'partnerMarket.orders.empty':
    'No sales yet. When BladeCP sells one of your listed plans, it shows up here.',
  'partnerMarket.orders.emptyStatus': 'No sales with status "{status}".',
  'partnerMarket.orders.countOne': '1 sale',
  'partnerMarket.orders.countMany': '{count} sales',
  'partnerMarket.order.active': 'Active',
  'partnerMarket.order.churned': 'Ended',

  // Commission lines
  'partnerMarket.commissions.empty': 'No commission lines yet.',
  'partnerMarket.commissions.emptyStatus': 'No commission lines with status "{status}".',
  'partnerMarket.commissions.countOne': '1 line',
  'partnerMarket.commissions.countMany': '{count} lines',
  'partnerMarket.source.firstSale': 'First sale',
  'partnerMarket.source.renewal': 'Renewal',
  'partnerMarket.source.proration': 'Plan change',
  'partnerMarket.line.pending': 'Pending',
  'partnerMarket.line.confirmed': 'Confirmed',
  'partnerMarket.line.cleared': 'Cleared',
  'partnerMarket.line.reversed': 'Reversed',
  'partnerMarket.line.rejected': 'Rejected',

  // Statements
  'partnerMarket.statements.empty':
    'No statements yet. BladeCP closes one statement a month per currency, netted against your base server rent.',
  'partnerMarket.statements.countOne': '1 statement',
  'partnerMarket.statements.countMany': '{count} statements',
  'partnerMarket.statement.open': 'Open',
  'partnerMarket.statement.closed': 'Closed',
  'partnerMarket.statement.requested': 'Payment requested',
  'partnerMarket.statement.approved': 'Approved',
  'partnerMarket.statement.paid': 'Paid',
  'partnerMarket.statement.rejected': 'Rejected',
  'partnerMarket.statement.failed': 'Payment failed',
  'partnerMarket.statement.title': 'Statement {id}',
  'partnerMarket.statement.noLines': 'No commission lines in this statement.',
  'partnerMarket.statement.payment': 'Payment',
  'partnerMarket.label.period': 'Period',
  'partnerMarket.label.currency': 'Currency',
  'partnerMarket.label.sales': 'Sales',
  'partnerMarket.label.commission': 'BladeCP commission',
  'partnerMarket.label.net': 'Net',
  'partnerMarket.label.withholding': 'Tax withheld',
  'partnerMarket.label.earnings': 'Your earnings',
  'partnerMarket.label.carryForward': 'Adjustment from earlier statements',
  'partnerMarket.label.baseServer': 'Base server rent',
  'partnerMarket.label.balance': 'Balance',
  'partnerMarket.label.method': 'Settled by',
  'partnerMarket.label.closed': 'Closed',
  'partnerMarket.label.paid': 'Paid',
  'partnerMarket.method.credit': 'Credit on your base server invoice',
  'partnerMarket.method.pix': 'PIX',
  'partnerMarket.method.manual': 'Manual transfer',
  'partnerMarket.method.foreignRail': 'International transfer',

  // Base server invoices
  'partnerMarket.invoices.empty': 'No open invoices for your base server.',
  'partnerMarket.invoices.summaryOne': '1 open invoice · {total}',
  'partnerMarket.invoices.summaryMany': '{count} open invoices · {total} in total',
  'partnerMarket.invoices.server': 'Base server: {label}',
  'partnerMarket.invoices.notMarked':
    'No server on your account is marked as the base server, so this lists every open invoice in {currency}.',
  'partnerMarket.invoice.pending': 'Open',
  'partnerMarket.invoice.unpaid': 'Unpaid',
  'partnerMarket.invoice.overdue': 'Overdue',
  'partnerMarket.invoice.paid': 'Paid',
  'partnerMarket.invoice.cancelled': 'Cancelled',
};

export const ptBR: Record<keyof typeof en, string> = {
  'partnerMarket.help.topic':
    'Acompanhar suas vendas no marketplace, ganhos, extratos e faturas do servidor-base',
  'partnerMarket.help.summary':
    'Mostrar os ganhos por moeda e quanto do servidor-base eles já cobrem',
  'partnerMarket.help.orders': 'Listar as vendas que a BladeCP fez dos seus planos',
  'partnerMarket.help.commissions':
    'Listar cada fatura paga: a venda, a comissão da BladeCP e o que você recebe',
  'partnerMarket.help.statements':
    'Listar os extratos mensais: seus ganhos compensados com o servidor-base',
  'partnerMarket.help.statement': 'Mostrar um extrato e as linhas de comissão dele',
  'partnerMarket.help.invoices': 'Listar as faturas em aberto do seu servidor-base',
  'partnerMarket.help.summaryDesc':
    'A BladeCP vende seus planos listados no marketplace dela, fatura o cliente, retém uma comissão por produto e repassa o líquido a você em um extrato mensal. Aqui aparecem seus ganhos por moeda e quanto do aluguel do servidor-base eles já cobrem.',
  'partnerMarket.help.stages':
    'Uma venda paga começa pendente, é confirmada no dia seguinte e é liberada quando termina o prazo de retenção da forma de pagamento (mais longo no cartão). Os ganhos liberados entram no extrato mensal.',
  'partnerMarket.help.ordersDesc':
    'Cada assinatura que a BladeCP vendeu dos seus planos, da mais nova para a mais antiga: o cliente, o plano, o preço que o cliente paga e o que você recebe depois da comissão da BladeCP.',
  'partnerMarket.help.commissionsDesc':
    'O livro de comissões: uma linha por fatura paga de uma venda do marketplace (primeira venda, renovação ou troca de plano), com o valor cobrado, a comissão da BladeCP e o que você recebe.',
  'partnerMarket.help.statementsDesc':
    'A BladeCP fecha um extrato por mês em cada moeda: seus ganhos liberados menos o aluguel do servidor-base. Saldo positivo é pago a você; negativo é cobrado de você.',
  'partnerMarket.help.statementDesc':
    'Os totais de um extrato, como ele foi acertado e todas as linhas de comissão dele.',
  'partnerMarket.help.statementArg':
    'Número do extrato, como aparece em "bladecp partner marketplace statements"',
  'partnerMarket.help.invoicesDesc':
    'As faturas em aberto do seu servidor-base (o servidor que você aluga da BladeCP para revender). O extrato mensal desconta essas faturas dos seus ganhos no marketplace.',
  'partnerMarket.ex.summary': 'ganhos e cobertura do servidor-base',
  'partnerMarket.ex.json': 'o mesmo, em JSON (valores em centavos)',
  'partnerMarket.ex.orders': 'as vendas mais recentes',
  'partnerMarket.ex.ordersPage': 'a segunda página, de 50 em 50',
  'partnerMarket.ex.commissions': 'linhas que ainda não foram liberadas',
  'partnerMarket.ex.statements': 'todos os extratos mensais',
  'partnerMarket.ex.statement': 'o extrato 12 com as linhas dele',
  'partnerMarket.ex.invoices': 'o que está em aberto no servidor-base',
  'partnerMarket.option.orderStatus': 'Só as vendas neste status (active ou churned)',
  'partnerMarket.option.lineStatus':
    'Só as linhas neste status: pending, confirmed, cleared, reversed ou rejected',
  'partnerMarket.option.limit': 'Quantos mostrar por página (até 100)',

  'partnerMarket.error.statementId':
    'O extrato é um número, como aparece em "bladecp partner marketplace statements". Recebido: "{value}".',
  'partnerMarket.error.limit': 'A opção --limit vai de 1 a 100, recebido "{value}".',
  'partnerMarket.error.page': 'A opção --page começa em 1, recebido "{value}".',

  'partnerMarket.page': 'página {page} de {pages}',
  'partnerMarket.next.page': 'Próxima página:',
  'partnerMarket.next.orders': 'Veja as vendas:',
  'partnerMarket.next.statements': 'Veja os extratos mensais:',
  'partnerMarket.next.statement': 'Veja um extrato:',
  'partnerMarket.settle.toYou': '{amount} para você',
  'partnerMarket.settle.toBladecp': '{amount} à BladeCP',

  'partnerMarket.summary.title': 'Marketplace',
  'partnerMarket.summary.listings': 'Planos listados',
  'partnerMarket.summary.sold': 'Assinaturas vendidas',
  'partnerMarket.summary.earnings': 'Ganhos em {currency}',
  'partnerMarket.summary.pending': 'Pendente',
  'partnerMarket.summary.confirmed': 'Confirmado',
  'partnerMarket.summary.cleared': 'Liberado',
  'partnerMarket.summary.total': 'Total até hoje',
  'partnerMarket.summary.coverage': 'Servidor-base',
  'partnerMarket.summary.rent': 'Aluguel mensal',
  'partnerMarket.summary.covered': 'Coberto pelas vendas',
  'partnerMarket.summary.remaining': 'Falta cobrir',
  'partnerMarket.summary.coveredAll':
    'Seus ganhos no marketplace já cobrem o aluguel do seu servidor-base.',
  'partnerMarket.summary.salesOne':
    'Falta cerca de 1 venda para cobrir o aluguel do servidor-base.',
  'partnerMarket.summary.salesMany':
    'Faltam cerca de {count} vendas para cobrir o aluguel do servidor-base.',
  'partnerMarket.summary.empty':
    'Ainda não há ganhos no marketplace. Quando a BladeCP vender um dos seus planos listados, ele aparece aqui.',

  'partnerMarket.column.sold': 'VENDIDO EM',
  'partnerMarket.column.customer': 'CLIENTE',
  'partnerMarket.column.plan': 'PLANO',
  'partnerMarket.column.price': 'PREÇO',
  'partnerMarket.column.receive': 'VOCÊ RECEBE',
  'partnerMarket.column.date': 'DATA',
  'partnerMarket.column.product': 'PRODUTO',
  'partnerMarket.column.type': 'TIPO',
  'partnerMarket.column.sale': 'VENDA',
  'partnerMarket.column.commission': 'COMISSÃO',
  'partnerMarket.column.period': 'PERÍODO',
  'partnerMarket.column.earnings': 'GANHOS',
  'partnerMarket.column.baseServer': 'SERVIDOR-BASE',
  'partnerMarket.column.settlement': 'SALDO',
  'partnerMarket.column.invoice': 'FATURA',
  'partnerMarket.column.due': 'VENCIMENTO',
  'partnerMarket.column.total': 'TOTAL',

  'partnerMarket.orders.empty':
    'Nenhuma venda ainda. Quando a BladeCP vender um dos seus planos listados, ela aparece aqui.',
  'partnerMarket.orders.emptyStatus': 'Nenhuma venda com o status "{status}".',
  'partnerMarket.orders.countOne': '1 venda',
  'partnerMarket.orders.countMany': '{count} vendas',
  'partnerMarket.order.active': 'Ativa',
  'partnerMarket.order.churned': 'Encerrada',

  'partnerMarket.commissions.empty': 'Nenhuma linha de comissão ainda.',
  'partnerMarket.commissions.emptyStatus': 'Nenhuma linha de comissão com o status "{status}".',
  'partnerMarket.commissions.countOne': '1 linha',
  'partnerMarket.commissions.countMany': '{count} linhas',
  'partnerMarket.source.firstSale': 'Primeira venda',
  'partnerMarket.source.renewal': 'Renovação',
  'partnerMarket.source.proration': 'Troca de plano',
  'partnerMarket.line.pending': 'Pendente',
  'partnerMarket.line.confirmed': 'Confirmada',
  'partnerMarket.line.cleared': 'Liberada',
  'partnerMarket.line.reversed': 'Estornada',
  'partnerMarket.line.rejected': 'Recusada',

  'partnerMarket.statements.empty':
    'Nenhum extrato ainda. A BladeCP fecha um extrato por mês em cada moeda, compensado com o aluguel do servidor-base.',
  'partnerMarket.statements.countOne': '1 extrato',
  'partnerMarket.statements.countMany': '{count} extratos',
  'partnerMarket.statement.open': 'Aberto',
  'partnerMarket.statement.closed': 'Fechado',
  'partnerMarket.statement.requested': 'Pagamento solicitado',
  'partnerMarket.statement.approved': 'Aprovado',
  'partnerMarket.statement.paid': 'Pago',
  'partnerMarket.statement.rejected': 'Recusado',
  'partnerMarket.statement.failed': 'Pagamento falhou',
  'partnerMarket.statement.title': 'Extrato {id}',
  'partnerMarket.statement.noLines': 'Nenhuma linha de comissão neste extrato.',
  'partnerMarket.statement.payment': 'Pagamento',
  'partnerMarket.label.period': 'Período',
  'partnerMarket.label.currency': 'Moeda',
  'partnerMarket.label.sales': 'Vendas',
  'partnerMarket.label.commission': 'Comissão da BladeCP',
  'partnerMarket.label.net': 'Líquido',
  'partnerMarket.label.withholding': 'Imposto retido',
  'partnerMarket.label.earnings': 'Seus ganhos',
  'partnerMarket.label.carryForward': 'Ajuste de extratos anteriores',
  'partnerMarket.label.baseServer': 'Aluguel do servidor-base',
  'partnerMarket.label.balance': 'Saldo',
  'partnerMarket.label.method': 'Acertado por',
  'partnerMarket.label.closed': 'Fechado em',
  'partnerMarket.label.paid': 'Pago em',
  'partnerMarket.method.credit': 'Crédito na fatura do servidor-base',
  'partnerMarket.method.pix': 'PIX',
  'partnerMarket.method.manual': 'Transferência manual',
  'partnerMarket.method.foreignRail': 'Transferência internacional',

  'partnerMarket.invoices.empty': 'Nenhuma fatura em aberto do servidor-base.',
  'partnerMarket.invoices.summaryOne': '1 fatura em aberto · {total}',
  'partnerMarket.invoices.summaryMany': '{count} faturas em aberto · {total} no total',
  'partnerMarket.invoices.server': 'Servidor-base: {label}',
  'partnerMarket.invoices.notMarked':
    'Nenhum servidor da sua conta está marcado como servidor-base, então aparecem todas as faturas em aberto em {currency}.',
  'partnerMarket.invoice.pending': 'Em aberto',
  'partnerMarket.invoice.unpaid': 'Não paga',
  'partnerMarket.invoice.overdue': 'Vencida',
  'partnerMarket.invoice.paid': 'Paga',
  'partnerMarket.invoice.cancelled': 'Cancelada',
};

export const es: Record<keyof typeof en, string> = {
  'partnerMarket.help.topic':
    'Seguir tus ventas en el marketplace, ganancias, extractos y facturas del servidor base',
  'partnerMarket.help.summary':
    'Mostrar las ganancias por moneda y cuánto del servidor base ya cubren',
  'partnerMarket.help.orders': 'Listar las ventas que BladeCP hizo de tus planes',
  'partnerMarket.help.commissions':
    'Listar cada factura pagada: la venta, la comisión de BladeCP y lo que recibes',
  'partnerMarket.help.statements':
    'Listar los extractos mensuales: tus ganancias compensadas con el servidor base',
  'partnerMarket.help.statement': 'Mostrar un extracto y sus líneas de comisión',
  'partnerMarket.help.invoices': 'Listar las facturas pendientes de tu servidor base',
  'partnerMarket.help.summaryDesc':
    'BladeCP vende tus planes listados en su marketplace, factura al cliente, retiene una comisión por producto y te transfiere el neto en un extracto mensual. Aquí ves tus ganancias por moneda y cuánto del alquiler de tu servidor base ya cubren.',
  'partnerMarket.help.stages':
    'Una venta pagada empieza pendiente, se confirma al día siguiente y se libera cuando termina el plazo de retención de su forma de pago (más largo con tarjeta). Las ganancias liberadas entran en el extracto mensual.',
  'partnerMarket.help.ordersDesc':
    'Cada suscripción que BladeCP vendió de tus planes, de la más reciente a la más antigua: el cliente, el plan, el precio que paga el cliente y lo que recibes después de la comisión de BladeCP.',
  'partnerMarket.help.commissionsDesc':
    'El libro de comisiones: una línea por factura pagada de una venta del marketplace (primera venta, renovación o cambio de plan), con el importe cobrado, la comisión de BladeCP y lo que recibes.',
  'partnerMarket.help.statementsDesc':
    'BladeCP cierra un extracto al mes por moneda: tus ganancias liberadas menos el alquiler de tu servidor base. Un saldo positivo se te paga; uno negativo se te cobra.',
  'partnerMarket.help.statementDesc':
    'Los totales de un extracto, cómo se liquidó y todas sus líneas de comisión.',
  'partnerMarket.help.statementArg':
    'Número del extracto, como lo muestra "bladecp partner marketplace statements"',
  'partnerMarket.help.invoicesDesc':
    'Las facturas pendientes de tu servidor base (el servidor que alquilas a BladeCP para revender). El extracto mensual las descuenta de tus ganancias en el marketplace.',
  'partnerMarket.ex.summary': 'ganancias y cobertura del servidor base',
  'partnerMarket.ex.json': 'lo mismo, en JSON (importes en centavos)',
  'partnerMarket.ex.orders': 'las ventas más recientes',
  'partnerMarket.ex.ordersPage': 'la segunda página, de 50 en 50',
  'partnerMarket.ex.commissions': 'líneas que aún no se liberaron',
  'partnerMarket.ex.statements': 'todos los extractos mensuales',
  'partnerMarket.ex.statement': 'el extracto 12 con sus líneas',
  'partnerMarket.ex.invoices': 'lo que está pendiente en tu servidor base',
  'partnerMarket.option.orderStatus': 'Solo las ventas con este estado (active o churned)',
  'partnerMarket.option.lineStatus':
    'Solo las líneas con este estado: pending, confirmed, cleared, reversed o rejected',
  'partnerMarket.option.limit': 'Cuántos mostrar por página (hasta 100)',

  'partnerMarket.error.statementId':
    'El extracto es un número, como lo muestra "bladecp partner marketplace statements". Recibido: "{value}".',
  'partnerMarket.error.limit': 'La opción --limit va de 1 a 100, se recibió "{value}".',
  'partnerMarket.error.page': 'La opción --page empieza en 1, se recibió "{value}".',

  'partnerMarket.page': 'página {page} de {pages}',
  'partnerMarket.next.page': 'Página siguiente:',
  'partnerMarket.next.orders': 'Mira las ventas:',
  'partnerMarket.next.statements': 'Mira los extractos mensuales:',
  'partnerMarket.next.statement': 'Mira un extracto:',
  'partnerMarket.settle.toYou': '{amount} para ti',
  'partnerMarket.settle.toBladecp': '{amount} a BladeCP',

  'partnerMarket.summary.title': 'Marketplace',
  'partnerMarket.summary.listings': 'Planes listados',
  'partnerMarket.summary.sold': 'Suscripciones vendidas',
  'partnerMarket.summary.earnings': 'Ganancias en {currency}',
  'partnerMarket.summary.pending': 'Pendiente',
  'partnerMarket.summary.confirmed': 'Confirmado',
  'partnerMarket.summary.cleared': 'Liberado',
  'partnerMarket.summary.total': 'Total hasta hoy',
  'partnerMarket.summary.coverage': 'Servidor base',
  'partnerMarket.summary.rent': 'Alquiler mensual',
  'partnerMarket.summary.covered': 'Cubierto por ventas',
  'partnerMarket.summary.remaining': 'Falta cubrir',
  'partnerMarket.summary.coveredAll':
    'Tus ganancias en el marketplace ya cubren el alquiler de tu servidor base.',
  'partnerMarket.summary.salesOne':
    'Falta cerca de 1 venta para cubrir el alquiler de tu servidor base.',
  'partnerMarket.summary.salesMany':
    'Faltan cerca de {count} ventas para cubrir el alquiler de tu servidor base.',
  'partnerMarket.summary.empty':
    'Aún no hay ganancias en el marketplace. Cuando BladeCP venda uno de tus planes listados, aparecerá aquí.',

  'partnerMarket.column.sold': 'VENDIDO',
  'partnerMarket.column.customer': 'CLIENTE',
  'partnerMarket.column.plan': 'PLAN',
  'partnerMarket.column.price': 'PRECIO',
  'partnerMarket.column.receive': 'RECIBES',
  'partnerMarket.column.date': 'FECHA',
  'partnerMarket.column.product': 'PRODUCTO',
  'partnerMarket.column.type': 'TIPO',
  'partnerMarket.column.sale': 'VENTA',
  'partnerMarket.column.commission': 'COMISIÓN',
  'partnerMarket.column.period': 'PERÍODO',
  'partnerMarket.column.earnings': 'GANANCIAS',
  'partnerMarket.column.baseServer': 'SERVIDOR BASE',
  'partnerMarket.column.settlement': 'SALDO',
  'partnerMarket.column.invoice': 'FACTURA',
  'partnerMarket.column.due': 'VENCE',
  'partnerMarket.column.total': 'TOTAL',

  'partnerMarket.orders.empty':
    'Aún no hay ventas. Cuando BladeCP venda uno de tus planes listados, aparecerá aquí.',
  'partnerMarket.orders.emptyStatus': 'No hay ventas con el estado "{status}".',
  'partnerMarket.orders.countOne': '1 venta',
  'partnerMarket.orders.countMany': '{count} ventas',
  'partnerMarket.order.active': 'Activa',
  'partnerMarket.order.churned': 'Terminada',

  'partnerMarket.commissions.empty': 'Aún no hay líneas de comisión.',
  'partnerMarket.commissions.emptyStatus': 'No hay líneas de comisión con el estado "{status}".',
  'partnerMarket.commissions.countOne': '1 línea',
  'partnerMarket.commissions.countMany': '{count} líneas',
  'partnerMarket.source.firstSale': 'Primera venta',
  'partnerMarket.source.renewal': 'Renovación',
  'partnerMarket.source.proration': 'Cambio de plan',
  'partnerMarket.line.pending': 'Pendiente',
  'partnerMarket.line.confirmed': 'Confirmada',
  'partnerMarket.line.cleared': 'Liberada',
  'partnerMarket.line.reversed': 'Revertida',
  'partnerMarket.line.rejected': 'Rechazada',

  'partnerMarket.statements.empty':
    'Aún no hay extractos. BladeCP cierra un extracto al mes por moneda, compensado con el alquiler de tu servidor base.',
  'partnerMarket.statements.countOne': '1 extracto',
  'partnerMarket.statements.countMany': '{count} extractos',
  'partnerMarket.statement.open': 'Abierto',
  'partnerMarket.statement.closed': 'Cerrado',
  'partnerMarket.statement.requested': 'Pago solicitado',
  'partnerMarket.statement.approved': 'Aprobado',
  'partnerMarket.statement.paid': 'Pagado',
  'partnerMarket.statement.rejected': 'Rechazado',
  'partnerMarket.statement.failed': 'Pago fallido',
  'partnerMarket.statement.title': 'Extracto {id}',
  'partnerMarket.statement.noLines': 'No hay líneas de comisión en este extracto.',
  'partnerMarket.statement.payment': 'Pago',
  'partnerMarket.label.period': 'Período',
  'partnerMarket.label.currency': 'Moneda',
  'partnerMarket.label.sales': 'Ventas',
  'partnerMarket.label.commission': 'Comisión de BladeCP',
  'partnerMarket.label.net': 'Neto',
  'partnerMarket.label.withholding': 'Impuesto retenido',
  'partnerMarket.label.earnings': 'Tus ganancias',
  'partnerMarket.label.carryForward': 'Ajuste de extractos anteriores',
  'partnerMarket.label.baseServer': 'Alquiler del servidor base',
  'partnerMarket.label.balance': 'Saldo',
  'partnerMarket.label.method': 'Liquidado por',
  'partnerMarket.label.closed': 'Cerrado el',
  'partnerMarket.label.paid': 'Pagado el',
  'partnerMarket.method.credit': 'Crédito en la factura del servidor base',
  'partnerMarket.method.pix': 'PIX',
  'partnerMarket.method.manual': 'Transferencia manual',
  'partnerMarket.method.foreignRail': 'Transferencia internacional',

  'partnerMarket.invoices.empty': 'No hay facturas pendientes de tu servidor base.',
  'partnerMarket.invoices.summaryOne': '1 factura pendiente · {total}',
  'partnerMarket.invoices.summaryMany': '{count} facturas pendientes · {total} en total',
  'partnerMarket.invoices.server': 'Servidor base: {label}',
  'partnerMarket.invoices.notMarked':
    'Ningún servidor de tu cuenta está marcado como servidor base, así que aparecen todas las facturas pendientes en {currency}.',
  'partnerMarket.invoice.pending': 'Pendiente',
  'partnerMarket.invoice.unpaid': 'Impaga',
  'partnerMarket.invoice.overdue': 'Vencida',
  'partnerMarket.invoice.paid': 'Pagada',
  'partnerMarket.invoice.cancelled': 'Cancelada',
};
