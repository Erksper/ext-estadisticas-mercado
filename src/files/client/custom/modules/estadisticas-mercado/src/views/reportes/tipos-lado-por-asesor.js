// estadisticas-mercado/src/views/reportes/tipos-lado-por-asesor.js
define(
    'estadisticas-mercado:views/reportes/tipos-lado-por-asesor',
    [
        'view',
        'estadisticas-mercado:views/modules/excel-export',
        'estadisticas-mercado:views/modules/detalle-nav',
        'estadisticas-mercado:views/modules/periodo-select'
    ],
    function (View, ExcelExport, DetalleNav, PeriodoSelect) {

        return View.extend($.extend({}, DetalleNav, {

            template: 'estadisticas-mercado:reportes/tipos-lado-por-asesor',

            _asesores:         [],
            _filas:            [],
            _totalesPorAsesor: {},
            _totalGeneral:     0,
            _hayDatos:         false,
            _chartInstance:    null,
            _filtrosActuales:  null,
            _periodoSelect:    null,

            // ── Paginación del gráfico ─────────────────────────────────────────
            _graficoPagina:    0,          // página actual (base 0)
            _graficoPorPagina: 15,         // asesores visibles por página

            events: {
                'click [data-action="buscar"]':   function () { this.buscar(); },
                'click [data-action="limpiar"]':  function () { this.limpiarFiltros(); },
                'click [data-action="volver"]':   function () {
                    this.getRouter().navigate('#EstadisticasMercado', { trigger: true });
                },
                'click [data-action="exportar"]': function () { this.exportar(); },

                // Al cambiar CLA recargamos oficinas Y años disponibles
                'change #em-filtro-cla': function () {
                    this._cargarOficinasPorCLA();
                    if (this._periodoSelect) this._periodoSelect.reloadAnios();
                },

                // Clic en cabecera de columna (asesor)
                'click .clickable-col': function (e) {
                    var $th = $(e.currentTarget);
                    this._irADetalle({
                        reporte:       'ladosPorAsesor',
                        rutaReporte:   '#EstadisticasMercado/tiposLadoPorAsesor',
                        seleccion:     'columna',
                        identificador: String($th.data('asesor-id')),
                        titulo:        'Asesor: ' + $th.text().trim(),
                        filtros:       this._filtrosActuales
                    });
                },

                // Clic en primera celda de fila (tipo de lado)
                'click .clickable-row': function (e) {
                    var tipo = $(e.currentTarget).text().trim();
                    this._irADetalle({
                        reporte:       'ladosPorAsesor',
                        rutaReporte:   '#EstadisticasMercado/tiposLadoPorAsesor',
                        seleccion:     'fila',
                        identificador: tipo,
                        titulo:        'Tipo de Lado: ' + tipo,
                        filtros:       this._filtrosActuales
                    });
                }
            },

            setup: function () {
                this._filtrosDesdeUrl = this.options.params || {};
            },

            afterRender: function () {
                this._cargarChartJS();
                this._cargarCLAs();
                this._iniciarPeriodoSelect();
                this._restaurarFiltrosDesdeUrl();
            },

            // ── PeriodoSelect ─────────────────────────────────────────────────

            _iniciarPeriodoSelect: function () {
                var self      = this;
                var container = this.$el.find('#em-periodo-container')[0];
                if (!container) return;

                this._periodoSelect = new PeriodoSelect(container, {
                    blockedMonths: [11, 12],
                    getAnios: function (cb) {
                        var claId = self.$el.find('#em-filtro-cla').val() || null;
                        Espo.Ajax.getRequest('EstadisticasMercado/action/getAniosDisponibles', {
                            reporte: 'ladosPorAsesor',
                            claId:   claId
                        }).then(function (r) {
                            cb(r.success ? (r.data || []) : []);
                        }).catch(function () { cb([]); });
                    }
                });
            },

            // ── ChartJS ───────────────────────────────────────────────────────

            _cargarChartJS: function () {
                if (typeof Chart !== 'undefined') return;
                var s = document.createElement('script');
                s.src = 'client/custom/modules/estadisticas-mercado/lib/chart.umd.min.js';
                document.head.appendChild(s);
            },

            // ── CLAs y Oficinas ───────────────────────────────────────────────

            _cargarCLAs: function () {
                var self = this;
                Espo.Ajax.getRequest('EstadisticasMercado/action/getCLAs')
                    .then(function (resp) {
                        if (!resp.success) return;
                        var $sel = self.$el.find('#em-filtro-cla');
                        $sel.empty().append('<option value="">Todos los CLAs</option>');
                        (resp.data || []).forEach(function (c) {
                            $sel.append('<option value="' + c.id + '">' + c.name + '</option>');
                        });
                    });
            },

            _cargarOficinasPorCLA: function (preseleccionarId, callback) {
                var claId = this.$el.find('#em-filtro-cla').val();
                var $of   = this.$el.find('#em-filtro-oficina');

                if (!claId) {
                    $of.html('<option value="">Todas las oficinas</option>').prop('disabled', false);
                    if (callback) callback();
                    return;
                }

                $of.prop('disabled', true).html('<option value="">Cargando...</option>');
                Espo.Ajax.getRequest('EstadisticasMercado/action/getOficinasByCLA', { claId: claId })
                    .then(function (resp) {
                        var html = '<option value="">Todas las oficinas</option>';
                        (resp.data || []).forEach(function (o) {
                            html += '<option value="' + o.id + '">' + o.name + '</option>';
                        });
                        $of.html(html).prop('disabled', false);
                        if (preseleccionarId) $of.val(preseleccionarId);
                        if (callback) callback();
                    })
                    .catch(function () {
                        $of.html('<option value="">Error</option>');
                        if (callback) callback();
                    });
            },

            // ── Restaurar desde URL ───────────────────────────────────────────

            _restaurarFiltrosDesdeUrl: function () {
                var p    = this._filtrosDesdeUrl;
                var self = this;
                if (!p || (!p.claId && !p.oficinaId && !p.anios && !p.meses)) return;

                if (p.claId) {
                    var intentos = 0;
                    var esperar = setInterval(function () {
                        var $sel = self.$el.find('#em-filtro-cla');
                        if ($sel.find('option[value="' + p.claId + '"]').length || intentos > 30) {
                            clearInterval(esperar);
                            $sel.val(p.claId);
                            self._cargarOficinasPorCLA(p.oficinaId, function () {
                                self.buscar();
                            });
                        }
                        intentos++;
                    }, 100);
                } else {
                    this.buscar();
                }
            },

            // ── Búsqueda ──────────────────────────────────────────────────────

            buscar: function () {
                var claId    = this.$el.find('#em-filtro-cla').val()     || null;
                var ofId     = this.$el.find('#em-filtro-oficina').val() || null;
                var anios    = this._periodoSelect ? this._periodoSelect.getAniosSeleccionados() : [];
                var meses    = this._periodoSelect ? this._periodoSelect.getMesesSeleccionados() : [];

                this._mostrarCargando();
                this._filtrosActuales = { claId: claId, oficinaId: ofId, anios: anios, meses: meses };

                var params = {};
                if (claId)        params.claId      = claId;
                if (ofId)         params.oficinaId   = ofId;
                if (anios.length) params.anios       = anios.join(',');
                if (meses.length) params.meses       = meses.join(',');

                console.log('[TiposLadoPorAsesor] params →', JSON.stringify(params));

                var self = this;
                Espo.Ajax.getRequest('EstadisticasMercado/action/getLadosPorAsesor', params)
                    .then(function (resp) {
                        if (!resp.success) {
                            Espo.Ui.error('Error: ' + (resp.error || ''));
                            self._mostrarVacio('Error al cargar datos.');
                            return;
                        }
                        var raw = resp.asesores || [];
                        self._asesores         = Array.isArray(raw) ? raw : Object.values(raw);
                        self._filas            = resp.filas            || [];
                        self._totalesPorAsesor = resp.totalesPorAsesor || {};
                        self._totalGeneral     = resp.totalGeneral     || 0;

                        // Filtrar asesores sin lados en el período
                        self._asesores = self._asesores.filter(function (a) {
                            return (self._totalesPorAsesor[a.id] || 0) > 0;
                        });

                        self._graficoPagina = 0;   // siempre volver a página 1 al buscar
                        self._hayDatos = true;
                        self._renderTabla();
                        self.$el.find('[data-action="exportar"]').prop('disabled', false);
                    })
                    .catch(function () {
                        Espo.Ui.error('Error de conexión.');
                        self._mostrarVacio('Error de conexión.');
                    });
            },

            // ── Limpiar ───────────────────────────────────────────────────────

            limpiarFiltros: function () {
                this.$el.find('#em-filtro-cla').val('');
                this.$el.find('#em-filtro-oficina')
                    .html('<option value="">Todas las oficinas</option>').prop('disabled', true);
                if (this._periodoSelect) this._periodoSelect.reset();
                this._hayDatos        = false;
                this._filtrosActuales = null;
                this.$el.find('[data-action="exportar"]').prop('disabled', true);
                if (this._chartInstance) { this._chartInstance.destroy(); this._chartInstance = null; }
                this._mostrarEstadoInicial();
            },

            // ── Render tabla ──────────────────────────────────────────────────

            _renderTabla: function () {
                var self     = this;
                var asesores = this._asesores;
                var filas    = this._filas;

                if (!asesores.length || !filas.length) {
                    this._mostrarVacio('No hay datos para los filtros seleccionados.');
                    return;
                }

                var desc = this._descripcionPeriodo(this._filtrosActuales);
                var html = '';
                html += '<div class="em-info-band"><i class="fas fa-info-circle"></i><span>' + desc + '</span></div>';
                html += '<div class="em-tabla-wrapper"><div class="em-tabla-scroll">';
                html += '<table class="em-tabla"><thead><tr><th>Tipo de Lado</th>';

                asesores.forEach(function (a) {
                    html += '<th class="clickable-col" data-asesor-id="' + self._esc(a.id) +
                            '" title="Ver detalle de ' + self._esc(a.name) + '">' +
                            self._esc(a.name) + '</th>';
                });
                html += '<th class="col-total">Total</th></tr></thead><tbody>';

                filas.forEach(function (fila) {
                    html += '<tr><td class="clickable-row" title="Ver detalle de ' +
                            self._esc(fila.tipo) + '">' + self._esc(fila.tipo) + '</td>';
                    asesores.forEach(function (a) {
                        html += '<td>' + (fila.conteos[a.id] || 0) + '</td>';
                    });
                    html += '<td class="col-total">' + fila.total + '</td></tr>';
                });

                html += '</tbody><tfoot><tr><td><strong>Total</strong></td>';
                asesores.forEach(function (a) {
                    html += '<td><strong>' + (self._totalesPorAsesor[a.id] || 0) + '</strong></td>';
                });
                html += '<td class="col-total"><strong>' + this._totalGeneral + '</strong></td>';
                html += '</tr></tfoot></table></div></div>';

                html += '<div class="em-grafico-container">';
                html += '<h3 style="margin-top:0;margin-bottom:16px;">' +
                        '<i class="fas fa-chart-bar"></i> Distribución por Asesor</h3>';
                html += '<canvas id="em-grafico-canvas" style="width:100%;max-height:500px;"></canvas>';
                html += '</div>';

                this.$el.find('#em-resultado-container').html(html);
                var selfRef = this;
                setTimeout(function () { selfRef._renderGrafico(); }, 50);
            },

            // ── Gráfico (con paginación, orden desc por total) ────────────────

            _renderGrafico: function () {
                if (typeof Chart === 'undefined') return;

                var self  = this;
                var filas = this._filas;

                // Ordenar asesores de mayor a menor por total de lados
                var asesorOrdenado = this._asesores.slice().sort(function (a, b) {
                    return (self._totalesPorAsesor[b.id] || 0) - (self._totalesPorAsesor[a.id] || 0);
                });

                var total      = asesorOrdenado.length;
                var porPagina  = this._graficoPorPagina;
                var totalPags  = Math.ceil(total / porPagina) || 1;

                // Escala global: máximo valor INDIVIDUAL de cualquier barra (no suma),
                // redondeado a la decena superior más próxima
                var cfila = filas.find(function (f) { return f.tipo === 'Captador (Obtención)'; });
                var efila = filas.find(function (f) { return f.tipo === 'Cerrador (Cierre)'; });
                var maxGlobal = 0;
                asesorOrdenado.forEach(function (a) {
                    var cap = cfila ? (cfila.conteos[a.id] || 0) : 0;
                    var cer = efila ? (efila.conteos[a.id] || 0) : 0;
                    if (cap > maxGlobal) maxGlobal = cap;
                    if (cer > maxGlobal) maxGlobal = cer;
                });
                // Decena superior: 23 → 30, 25 → 30, 30 → 30, 31 → 40
                var escalaMax = maxGlobal === 0 ? 10 : Math.ceil(maxGlobal / 10) * 10;

                // Clampear página actual en caso de que haya cambiado el dataset
                if (this._graficoPagina >= totalPags) this._graficoPagina = 0;

                var inicio  = this._graficoPagina * porPagina;
                var slice   = asesorOrdenado.slice(inicio, inicio + porPagina);

                var labels     = slice.map(function (a) { return a.name; });
                var captadores = [];
                var cerradores = [];

                slice.forEach(function (a) {
                    captadores.push(cfila ? (cfila.conteos[a.id] || 0) : 0);
                    cerradores.push(efila ? (efila.conteos[a.id] || 0) : 0);
                });

                // Rellenar con filas vacías para que la última página tenga el mismo
                // número de barras que las demás y no se vean gigantes
                var faltantes = porPagina - slice.length;
                for (var i = 0; i < faltantes; i++) {
                    labels.push('');       // label vacío → barra fantasma sin texto
                    captadores.push(null); // null → Chart.js no dibuja barra
                    cerradores.push(null);
                }

                // ── Controles de paginación ───────────────────────────────────
                var $wrapper = this.$el.find('.em-grafico-container');

                // Altura FIJA basada en porPagina (no en slice.length),
                // así las barras siempre tienen el mismo grosor en todas las páginas
                var alturaCanvas = Math.max(300, porPagina * 36);

                // Limpiar canvas y controles previos
                $wrapper.find('#em-grafico-canvas').remove();
                $wrapper.find('.em-grafico-paginacion').remove();

                // Nuevo canvas con altura apropiada
                var $canvas = $('<canvas id="em-grafico-canvas"></canvas>').css({
                    width: '100%',
                    height: alturaCanvas + 'px'
                });
                $wrapper.append($canvas);

                // Controles de navegación (solo si hay más de una página)
                if (totalPags > 1) {
                    var desde  = inicio + 1;
                    var hasta  = Math.min(inicio + porPagina, total);
                    var $pag   = $('<div class="em-grafico-paginacion"></div>').css({
                        display:        'flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                        gap:            '10px',
                        marginTop:      '12px',
                        fontSize:       '13px'
                    });

                    var btnEstilo = 'border:1.5px solid var(--color-primary);' +
                                   'background:#fff;color:var(--color-primary);' +
                                   'border-radius:6px;padding:5px 14px;' +
                                   'cursor:pointer;font-size:13px;transition:all 0.15s;';

                    var $prev = $('<button type="button">&#8249; Anterior</button>').attr('style', btnEstilo);
                    var $next = $('<button type="button">Siguiente &#8250;</button>').attr('style', btnEstilo);
                    var $info = $('<span></span>').text(
                        'Mostrando ' + desde + '–' + hasta + ' de ' + total + ' asesores' +
                        '  (página ' + (this._graficoPagina + 1) + ' de ' + totalPags + ')'
                    ).css({ color: '#666' });

                    if (this._graficoPagina === 0)             $prev.prop('disabled', true).css('opacity', '0.4');
                    if (this._graficoPagina >= totalPags - 1)  $next.prop('disabled', true).css('opacity', '0.4');

                    $prev.on('click', function () {
                        self._graficoPagina--;
                        self._renderGrafico();
                    });
                    $next.on('click', function () {
                        self._graficoPagina++;
                        self._renderGrafico();
                    });

                    $pag.append($prev, $info, $next);
                    $wrapper.append($pag);
                }

                // ── Dibujar chart ─────────────────────────────────────────────
                if (this._chartInstance) this._chartInstance.destroy();

                var ctx = document.getElementById('em-grafico-canvas');
                if (!ctx) return;

                this._chartInstance = new Chart(ctx.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [
                            { label: 'Captador (Obtención)', data: captadores,
                              backgroundColor: 'rgba(184,162,121,0.8)', borderColor: '#B8A279', borderWidth: 1 },
                            { label: 'Cerrador (Cierre)', data: cerradores,
                              backgroundColor: 'rgba(54,52,56,0.8)', borderColor: '#363438', borderWidth: 1 }
                        ]
                    },
                    options: {
                        responsive:          true,
                        maintainAspectRatio: false,
                        indexAxis:           'y',
                        plugins: { legend: { position: 'top' } },
                        scales: {
                            x: { title: { display: true, text: 'Cantidad de lados' }, beginAtZero: true, max: escalaMax },
                            y: { title: { display: true, text: 'Asesor' } }
                        }
                    }
                });
            },

            // ── Exportar ──────────────────────────────────────────────────────

            exportar: function () {
                if (!this._hayDatos) return;
                var self    = this;
                var headers = ['Tipo de Lado']
                    .concat(this._asesores.map(function (a) { return a.name; }))
                    .concat(['Total']);
                var filasExcel = this._filas.map(function (fila) {
                    var row = [fila.tipo];
                    self._asesores.forEach(function (a) { row.push(fila.conteos[a.id] || 0); });
                    row.push(fila.total);
                    return row;
                });
                var filaTotal = ['Total'];
                this._asesores.forEach(function (a) {
                    filaTotal.push(self._totalesPorAsesor[a.id] || 0);
                });
                filaTotal.push(this._totalGeneral);

                ExcelExport.exportar({
                    nombreArchivo: 'tipos_lado_por_asesor',
                    titulo:        'Tipos de Lado por Asesor',
                    subtitulo:     this._descripcionPeriodo(this._filtrosActuales),
                    headers:       headers,
                    filas:         filasExcel,
                    filaTotal:     filaTotal
                });
            },

            // ── Helpers ───────────────────────────────────────────────────────

            _descripcionPeriodo: function (f) {
                if (!f) return '';
                var partes = [];
                if (f.claId) {
                    var $opt = this.$el.find('#em-filtro-cla option[value="' + f.claId + '"]');
                    partes.push('CLA: ' + ($opt.length ? $opt.text() : f.claId));
                }
                if (f.oficinaId) {
                    var $optOf = this.$el.find('#em-filtro-oficina option[value="' + f.oficinaId + '"]');
                    partes.push('Oficina: ' + ($optOf.length ? $optOf.text() : f.oficinaId));
                }
                if (f.anios && f.anios.length) {
                    partes.push('Años: ' + f.anios.join(', '));
                } else {
                    partes.push('Todos los años');
                }
                if (f.meses && f.meses.length) {
                    partes.push('Meses: ' + f.meses.join(', '));
                } else {
                    partes.push('Todos los meses');
                }
                partes.push('(Excluye Nov-Dic)');
                return partes.join(' | ');
            },

            _mostrarCargando: function () {
                this.$el.find('#em-resultado-container').html(
                    '<div class="em-empty">' +
                    '<div class="em-spinner" style="margin-bottom:16px;"></div>' +
                    '<h4>Cargando datos…</h4><p>Consultando la base de datos</p>' +
                    '</div>');
            },
            _mostrarVacio: function (msg) {
                this.$el.find('#em-resultado-container').html(
                    '<div class="em-empty">' +
                    '<div class="em-empty-icon"><i class="fas fa-inbox"></i></div>' +
                    '<h4>Sin resultados</h4><p>' + (msg || 'No hay datos.') + '</p>' +
                    '</div>');
                this.$el.find('[data-action="exportar"]').prop('disabled', true);
            },
            _mostrarEstadoInicial: function () {
                this.$el.find('#em-resultado-container').html(
                    '<div class="em-empty">' +
                    '<div class="em-empty-icon"><i class="fas fa-search"></i></div>' +
                    '<h4>Aplique los filtros para ver el reporte</h4>' +
                    '<p>Seleccione los parámetros deseados y presione <strong>Buscar</strong></p>' +
                    '</div>');
            },
            _esc: function (str) {
                if (!str) return '';
                return String(str)
                    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            }
        }));
    }
);