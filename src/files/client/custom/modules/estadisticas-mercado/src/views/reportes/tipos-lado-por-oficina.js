// estadisticas-mercado/src/views/reportes/tipos-lado-por-oficina.js
define(
    'estadisticas-mercado:views/reportes/tipos-lado-por-oficina',
    [
        'view',
        'estadisticas-mercado:views/modules/excel-export',
        'estadisticas-mercado:views/modules/detalle-nav',
        'estadisticas-mercado:views/modules/periodo-select'
    ],
    function (View, ExcelExport, DetalleNav, PeriodoSelect) {

        return View.extend($.extend({}, DetalleNav, {

            template: 'estadisticas-mercado:reportes/tipos-lado-por-oficina',

            _oficinas:          [],
            _filas:             [],
            _totalesPorOficina: {},
            _totalGeneral:      0,
            _hayDatos:          false,
            _chartInstance:     null,
            _filtrosActuales:   null,
            _periodoSelect:     null,

            events: {
                'click [data-action="buscar"]':   function () { this.buscar(); },
                'click [data-action="limpiar"]':  function () { this.limpiarFiltros(); },
                'click [data-action="volver"]':   function () {
                    this.getRouter().navigate('#EstadisticasMercado', { trigger: true });
                },
                'click [data-action="exportar"]': function () { this.exportar(); },

                'change #em-filtro-cla': function () {
                    if (this._periodoSelect) this._periodoSelect.reloadAnios();
                },

                'click .clickable-col': function (e) {
                    var $th = $(e.currentTarget);
                    this._irADetalle({
                        reporte:       'ladosPorOficina',
                        rutaReporte:   '#EstadisticasMercado/tiposLadoPorOficina',
                        seleccion:     'columna',
                        identificador: String($th.data('oficina-id')),
                        titulo:        'Oficina: ' + $th.text().trim(),
                        filtros:       this._filtrosActuales
                    });
                },

                'click .clickable-row': function (e) {
                    var tipo = $(e.currentTarget).text().trim();
                    this._irADetalle({
                        reporte:       'ladosPorOficina',
                        rutaReporte:   '#EstadisticasMercado/tiposLadoPorOficina',
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
                            reporte: 'ladosPorOficina',
                            claId:   claId
                        }).then(function (r) {
                            cb(r.success ? (r.data || []) : []);
                        }).catch(function () { cb([]); });
                    }
                });
            },

            _cargarChartJS: function () {
                if (typeof Chart !== 'undefined') return;
                var s = document.createElement('script');
                s.src = 'client/custom/modules/estadisticas-mercado/lib/chart.umd.min.js';
                document.head.appendChild(s);
            },

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

            // ── Restaurar desde URL ───────────────────────────────────────────

            _restaurarFiltrosDesdeUrl: function () {
                var p    = this._filtrosDesdeUrl;
                var self = this;
                if (!p || (!p.claId && !p.anios && !p.meses)) return;

                if (p.claId) {
                    var intentos = 0;
                    var esperar = setInterval(function () {
                        var $sel = self.$el.find('#em-filtro-cla');
                        if ($sel.find('option[value="' + p.claId + '"]').length || intentos > 30) {
                            clearInterval(esperar);
                            $sel.val(p.claId);
                            self.buscar();
                        }
                        intentos++;
                    }, 100);
                } else {
                    this.buscar();
                }
            },

            // ── Búsqueda ──────────────────────────────────────────────────────

            buscar: function () {
                var claId = this.$el.find('#em-filtro-cla').val() || null;
                var anios = this._periodoSelect ? this._periodoSelect.getAniosSeleccionados() : [];
                var meses = this._periodoSelect ? this._periodoSelect.getMesesSeleccionados() : [];

                this._mostrarCargando();
                this._filtrosActuales = { claId: claId, anios: anios, meses: meses };

                var params = {};
                if (claId)        params.claId  = claId;
                if (anios.length) params.anios  = anios.join(',');
                if (meses.length) params.meses  = meses.join(',');

                console.log('[TiposLadoPorOficina] params →', JSON.stringify(params));

                var self = this;
                Espo.Ajax.getRequest('EstadisticasMercado/action/getLadosPorOficina', params)
                    .then(function (resp) {
                        if (!resp.success) {
                            Espo.Ui.error('Error: ' + (resp.error || ''));
                            self._mostrarVacio('Error al cargar datos.');
                            return;
                        }
                        self._oficinas = (resp.oficinas || []).filter(function (o) {
                            return o.name && o.name.trim() !== '';
                        });
                        self._filas             = resp.filas             || [];
                        self._totalesPorOficina = resp.totalesPorOficina || {};
                        self._totalGeneral      = resp.totalGeneral      || 0;
                        self._hayDatos          = true;
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
                if (this._periodoSelect) this._periodoSelect.reset();
                this._hayDatos        = false;
                this._filtrosActuales = null;
                this.$el.find('[data-action="exportar"]').prop('disabled', true);
                if (this._chartInstance) { this._chartInstance.destroy(); this._chartInstance = null; }
                this._mostrarEstadoInicial();
            },

            // ── Render tabla ──────────────────────────────────────────────────

            _renderTabla: function () {
                var self    = this;
                var oficinas= this._oficinas;
                var filas   = this._filas;

                if (!oficinas.length || !filas.length) {
                    this._mostrarVacio('No hay datos para los filtros seleccionados.');
                    return;
                }

                var desc = this._descripcionPeriodo(this._filtrosActuales);
                var html = '';
                html += '<div class="em-info-band"><i class="fas fa-info-circle"></i><span>' + desc + '</span></div>';
                html += '<div class="em-tabla-wrapper"><div class="em-tabla-scroll">';
                html += '<table class="em-tabla"><thead><tr><th>Tipo de Lado</th>';

                oficinas.forEach(function (of) {
                    html += '<th class="clickable-col" data-oficina-id="' + self._esc(of.id) +
                            '" title="Ver detalle de ' + self._esc(of.name) + '">' +
                            self._esc(of.name) + '</th>';
                });
                html += '<th class="col-total">Total</th></tr></thead><tbody>';

                filas.forEach(function (fila) {
                    html += '<tr><td class="clickable-row" title="Ver detalle de ' +
                            self._esc(fila.tipo) + '">' + self._esc(fila.tipo) + '</td>';
                    oficinas.forEach(function (of) {
                        html += '<td>' + (fila.conteos[of.id] || 0) + '</td>';
                    });
                    html += '<td class="col-total">' + fila.total + '</td></tr>';
                });

                html += '</tbody><tfoot><tr><td><strong>Total</strong></td>';
                oficinas.forEach(function (of) {
                    html += '<td><strong>' + (self._totalesPorOficina[of.id] || 0) + '</strong></td>';
                });
                html += '<td class="col-total"><strong>' + this._totalGeneral + '</strong></td>';
                html += '</tr></tfoot></table></div></div>';

                html += '<div class="em-grafico-container">';
                html += '<h3 style="margin-top:0;margin-bottom:16px;">' +
                        '<i class="fas fa-chart-bar"></i> Distribución por Oficina</h3>';
                html += '<canvas id="em-grafico-canvas" style="width:100%;max-height:500px;"></canvas>';
                html += '</div>';

                this.$el.find('#em-resultado-container').html(html);
                var selfRef = this;
                setTimeout(function () { selfRef._renderGrafico(); }, 50);
            },

            // ── Gráfico ───────────────────────────────────────────────────────

            _renderGrafico: function () {
                if (typeof Chart === 'undefined') return;
                if (this._chartInstance) this._chartInstance.destroy();

                var oficinas  = this._oficinas;
                var filas     = this._filas;
                var labels    = oficinas.map(function (o) { return o.name; });
                var captadores = [];
                var cerradores = [];

                oficinas.forEach(function (of) {
                    var cf = filas.find(function (f) { return f.tipo === 'Captador (Obtención)'; });
                    var ef = filas.find(function (f) { return f.tipo === 'Cerrador (Cierre)'; });
                    captadores.push(cf ? (cf.conteos[of.id] || 0) : 0);
                    cerradores.push(ef ? (ef.conteos[of.id] || 0) : 0);
                });

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
                        responsive: true, maintainAspectRatio: true, indexAxis: 'y',
                        plugins: { legend: { position: 'top' } },
                        scales: {
                            x: { title: { display: true, text: 'Cantidad de lados' } },
                            y: { title: { display: true, text: 'Oficina' } }
                        }
                    }
                });
            },

            // ── Exportar ──────────────────────────────────────────────────────

            exportar: function () {
                if (!this._hayDatos) return;
                var self    = this;
                var headers = ['Tipo de Lado']
                    .concat(this._oficinas.map(function (o) { return o.name; }))
                    .concat(['Total']);
                var filasExcel = this._filas.map(function (fila) {
                    var row = [fila.tipo];
                    self._oficinas.forEach(function (o) { row.push(fila.conteos[o.id] || 0); });
                    row.push(fila.total);
                    return row;
                });
                var filaTotal = ['Total'];
                this._oficinas.forEach(function (o) {
                    filaTotal.push(self._totalesPorOficina[o.id] || 0);
                });
                filaTotal.push(this._totalGeneral);

                ExcelExport.exportar({
                    nombreArchivo: 'tipos_lado_por_oficina',
                    titulo:        'Tipos de Lado por Oficina',
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