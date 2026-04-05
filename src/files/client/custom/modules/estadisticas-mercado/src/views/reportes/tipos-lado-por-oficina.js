// estadisticas-mercado/src/views/reportes/tipos-lado-por-oficina.js
define(
    'estadisticas-mercado:views/reportes/tipos-lado-por-oficina',
    [
        'view',
        'estadisticas-mercado:views/modules/excel-export',
        'estadisticas-mercado:views/modules/detalle-nav'
    ],
    function (View, ExcelExport, DetalleNav) {

        return View.extend($.extend({}, DetalleNav, {

            template: 'estadisticas-mercado:reportes/tipos-lado-por-oficina',

            _oficinas:          [],
            _filas:             [],
            _totalesPorOficina: {},
            _totalGeneral:      0,
            _hayDatos:          false,
            _chartInstance:     null,
            _filtrosActuales:   null,

            events: {
                'click [data-action="buscar"]':   function () { this.buscar(); },
                'click [data-action="limpiar"]':  function () { this.limpiarFiltros(); },
                'click [data-action="volver"]':   function () {
                    this.getRouter().navigate('#EstadisticasMercado', { trigger: true });
                },
                'click [data-action="exportar"]': function () { this.exportar(); },

                'click .clickable-col': function (e) {
                    var $th       = $(e.currentTarget);
                    var oficinaId = $th.data('oficina-id');
                    var oficinaNom= $th.text().trim();
                    this._irADetalle({
                        reporte:       'ladosPorOficina',
                        rutaReporte:   '#EstadisticasMercado/tiposLadoPorOficina',
                        seleccion:     'columna',
                        identificador: String(oficinaId),
                        titulo:        'Oficina: ' + oficinaNom,
                        filtros:       this._filtrosActuales
                    });
                },

                'click .clickable-row': function (e) {
                    var tipoLado = $(e.currentTarget).text().trim();
                    this._irADetalle({
                        reporte:       'ladosPorOficina',
                        rutaReporte:   '#EstadisticasMercado/tiposLadoPorOficina',
                        seleccion:     'fila',
                        identificador: tipoLado,
                        titulo:        'Tipo de Lado: ' + tipoLado,
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
                this._inicializarFechas();
                this._restaurarFiltrosDesdeUrl();
            },

            _restaurarFiltrosDesdeUrl: function () {
                var p    = this._filtrosDesdeUrl;
                var self = this;
                if (!p || (!p.claId && !p.fechaInicio && !p.fechaFin)) return;

                if (p.fechaInicio) this.$el.find('#em-filtro-fecha-inicio').val(p.fechaInicio);
                if (p.fechaFin)    this.$el.find('#em-filtro-fecha-fin').val(p.fechaFin);

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

            _cargarChartJS: function () {
                if (typeof Chart !== 'undefined') return;
                var script = document.createElement('script');
                script.src = 'client/custom/modules/estadisticas-mercado/lib/chart.umd.min.js';
                document.head.appendChild(script);
            },

            _cargarCLAs: function () {
                var self = this;
                Espo.Ajax.getRequest('EstadisticasMercado/action/getCLAs')
                    .then(function (resp) {
                        if (!resp.success) return;
                        var $sel = self.$el.find('#em-filtro-cla');
                        $sel.empty().append('<option value="">Todos los CLAs</option>');
                        (resp.data || []).forEach(function (cla) {
                            $sel.append('<option value="' + cla.id + '">' + cla.name + '</option>');
                        });
                    });
            },

            _inicializarFechas: function () {
                var hoy    = new Date();
                var fin    = hoy.toISOString().split('T')[0];
                var inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1);
                this.$el.find('#em-filtro-fecha-inicio').val(inicio.toISOString().split('T')[0]);
                this.$el.find('#em-filtro-fecha-fin').val(fin);
            },

            buscar: function () {
                var claId       = this.$el.find('#em-filtro-cla').val()          || null;
                var fechaInicio = this.$el.find('#em-filtro-fecha-inicio').val() || null;
                var fechaFin    = this.$el.find('#em-filtro-fecha-fin').val()    || null;

                if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
                    Espo.Ui.error('La fecha de inicio no puede ser mayor a la fecha fin.');
                    return;
                }

                this._mostrarCargando();
                this._filtrosActuales = { claId: claId, fechaInicio: fechaInicio, fechaFin: fechaFin };

                var params = {};
                if (claId)       params.claId       = claId;
                if (fechaInicio) params.fechaInicio  = fechaInicio;
                if (fechaFin)    params.fechaFin     = fechaFin;

                var self = this;
                Espo.Ajax.getRequest('EstadisticasMercado/action/getLadosPorOficina', params)
                    .then(function (resp) {
                        if (!resp.success) {
                            Espo.Ui.error('Error: ' + (resp.error || ''));
                            self._mostrarVacio('Error al cargar datos.');
                            return;
                        }
                        self._oficinas = (resp.oficinas || []).filter(function (of) {
                            return of.name && of.name.trim() !== '';
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

            limpiarFiltros: function () {
                this.$el.find('#em-filtro-cla').val('');
                this._inicializarFechas();
                this._hayDatos = false;
                this._filtrosActuales = null;
                this.$el.find('[data-action="exportar"]').prop('disabled', true);
                if (this._chartInstance) { this._chartInstance.destroy(); this._chartInstance = null; }
                this._mostrarEstadoInicial();
            },

            _renderTabla: function () {
                var self    = this;
                var oficinas= this._oficinas;
                var filas   = this._filas;

                if (!oficinas.length || !filas.length) {
                    this._mostrarVacio('No hay datos para los filtros seleccionados.');
                    return;
                }

                var desc = this._descripcionPeriodo(
                    this._filtrosActuales.claId,
                    this._filtrosActuales.fechaInicio,
                    this._filtrosActuales.fechaFin
                );

                var html = '';
                html += '<div class="em-info-band"><i class="fas fa-info-circle"></i>' +
                        '<span>' + desc + '</span></div>';
                html += '<div class="em-tabla-wrapper"><div class="em-tabla-scroll">';
                html += '<table class="em-tabla"><thead><tr>';
                html += '<th>Tipo de Lado</th>';
                oficinas.forEach(function (of) {
                    html += '<th class="clickable-col" data-oficina-id="' + self._esc(of.id) + '" ' +
                            'title="Ver detalle de ' + self._esc(of.name) + '">' +
                            self._esc(of.name) + '</th>';
                });
                html += '<th class="col-total">Total</th>';
                html += '</tr></thead><tbody>';

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

            _renderGrafico: function () {
                if (typeof Chart === 'undefined') return;
                if (this._chartInstance) this._chartInstance.destroy();

                var oficinas  = this._oficinas;
                var filas     = this._filas;
                var labels    = oficinas.map(function (of) { return of.name; });
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

            exportar: function () {
                if (!this._hayDatos) return;
                var self    = this;
                var headers = ['Tipo de Lado']
                    .concat(this._oficinas.map(function (of) { return of.name; }))
                    .concat(['Total']);
                var filasExcel = this._filas.map(function (fila) {
                    var row = [fila.tipo];
                    self._oficinas.forEach(function (of) { row.push(fila.conteos[of.id] || 0); });
                    row.push(fila.total);
                    return row;
                });
                var totalRow = ['Total'];
                this._oficinas.forEach(function (of) {
                    totalRow.push(self._totalesPorOficina[of.id] || 0);
                });
                totalRow.push(this._totalGeneral);

                ExcelExport.exportar({
                    nombreArchivo: 'tipos_lado_por_oficina_' +
                                   (this._filtrosActuales.fechaInicio || '').replace(/-/g, '') + '_' +
                                   (this._filtrosActuales.fechaFin    || '').replace(/-/g, ''),
                    titulo: 'Tipos de Lado por Oficina',
                    subtitulo: this._descripcionPeriodo(
                        this._filtrosActuales.claId,
                        this._filtrosActuales.fechaInicio,
                        this._filtrosActuales.fechaFin),
                    headers: headers, filas: filasExcel, filaTotal: totalRow
                });
            },

            _mostrarCargando: function () {
                this.$el.find('#em-resultado-container').html(
                    '<div class="em-empty"><div class="em-spinner" style="margin-bottom:16px;"></div>' +
                    '<h4>Cargando datos…</h4><p>Consultando la base de datos</p></div>');
            },
            _mostrarVacio: function (msg) {
                this.$el.find('#em-resultado-container').html(
                    '<div class="em-empty"><div class="em-empty-icon"><i class="fas fa-inbox"></i></div>' +
                    '<h4>Sin resultados</h4><p>' + (msg || 'No hay datos.') + '</p></div>');
                this.$el.find('[data-action="exportar"]').prop('disabled', true);
            },
            _mostrarEstadoInicial: function () {
                this.$el.find('#em-resultado-container').html(
                    '<div class="em-empty"><div class="em-empty-icon"><i class="fas fa-search"></i></div>' +
                    '<h4>Aplique los filtros para ver el reporte</h4>' +
                    '<p>Seleccione los parámetros y presione <strong>Buscar</strong></p></div>');
            },

            _descripcionPeriodo: function (claId, fechaInicio, fechaFin) {
                var partes = [];
                if (fechaInicio && fechaFin) partes.push('Período: ' + fechaInicio + ' → ' + fechaFin);
                else if (fechaInicio) partes.push('Desde: ' + fechaInicio);
                else if (fechaFin)    partes.push('Hasta: ' + fechaFin);
                else partes.push('Todos los períodos');
                if (claId) {
                    var $opt = this.$el.find('#em-filtro-cla option[value="' + claId + '"]');
                    partes.push('CLA: ' + ($opt.length ? $opt.text() : claId));
                }
                return partes.join(' | ');
            },

            _esc: function (str) {
                if (!str) return '';
                return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                                  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
            }
        }));
    }
);