// estadisticas-mercado/src/views/reportes/tipos-lado-por-asesor.js
define(
    'estadisticas-mercado:views/reportes/tipos-lado-por-asesor',
    [
        'view',
        'estadisticas-mercado:views/modules/excel-export'
    ],
    function (View, ExcelExport) {

        return View.extend({

            template: 'estadisticas-mercado:reportes/tipos-lado-por-asesor',

            _asesores: [],
            _filas: [],
            _totalesPorAsesor: {},
            _totalGeneral: 0,
            _hayDatos: false,
            _chartInstance: null,

            events: {
                'click [data-action="buscar"]':   function () { this.buscar(); },
                'click [data-action="limpiar"]':  function () { this.limpiarFiltros(); },
                'click [data-action="volver"]':   function () {
                    this.getRouter().navigate('#EstadisticasMercado', { trigger: true });
                },
                'click [data-action="exportar"]': function () { this.exportar(); },
                'change #em-filtro-cla': function () { this._cargarOficinasPorCLA(); }
            },

            setup: function () {
                this._cargandoCLAs = true;
            },

            afterRender: function () {
                this._cargarChartJS();
                this._cargarCLAs();
                this._inicializarFechas();
            },

            _cargarChartJS: function () {
                if (typeof Chart !== 'undefined') return;
                var script = document.createElement('script');
                script.src = 'client/custom/modules/estadisticas-mercado/lib/chart.umd.min.js';
                script.onload = function () { };
                script.onerror = function () {
                    console.warn('No se pudo cargar Chart.js');
                };
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
                    })
                    .catch(function () {
                        Espo.Ui.error('Error al cargar los CLAs.');
                    });
            },

            _cargarOficinasPorCLA: function () {
                var claId = this.$el.find('#em-filtro-cla').val();
                var $oficinaSelect = this.$el.find('#em-filtro-oficina');
                if (!claId) {
                    $oficinaSelect.html('<option value="">Todas las oficinas</option>');
                    $oficinaSelect.prop('disabled', false);
                    return;
                }
                $oficinaSelect.prop('disabled', true).html('<option value="">Cargando...</option>');
                var self = this;
                Espo.Ajax.getRequest('EstadisticasMercado/action/getOficinasByCLA', { claId: claId })
                    .then(function (resp) {
                        if (!resp.success) {
                            $oficinaSelect.html('<option value="">Error al cargar</option>');
                            return;
                        }
                        var html = '<option value="">Todas las oficinas</option>';
                        (resp.data || []).forEach(function (of) {
                            html += '<option value="' + of.id + '">' + of.name + '</option>';
                        });
                        $oficinaSelect.html(html);
                        $oficinaSelect.prop('disabled', false);
                    })
                    .catch(function () {
                        $oficinaSelect.html('<option value="">Error</option>');
                    });
            },

            _inicializarFechas: function () {
                var hoy = new Date();
                var fin = hoy.toISOString().split('T')[0];
                var inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1);
                var inicioStr = inicio.toISOString().split('T')[0];
                this.$el.find('#em-filtro-fecha-inicio').val(inicioStr);
                this.$el.find('#em-filtro-fecha-fin').val(fin);
            },

            buscar: function () {
                var claId = this.$el.find('#em-filtro-cla').val() || null;
                var oficinaId = this.$el.find('#em-filtro-oficina').val() || null;
                var fechaInicio = this.$el.find('#em-filtro-fecha-inicio').val() || null;
                var fechaFin = this.$el.find('#em-filtro-fecha-fin').val() || null;

                if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
                    Espo.Ui.error('La fecha de inicio no puede ser mayor a la fecha fin.');
                    return;
                }

                this._mostrarCargando();

                var params = {};
                if (claId) params.claId = claId;
                if (oficinaId) params.oficinaId = oficinaId;
                if (fechaInicio) params.fechaInicio = fechaInicio;
                if (fechaFin) params.fechaFin = fechaFin;

                var self = this;
                Espo.Ajax.getRequest('EstadisticasMercado/action/getLadosPorAsesor', params)
                    .then(function (resp) {
                        if (!resp.success) {
                            Espo.Ui.error('Error al obtener datos: ' + (resp.error || ''));
                            self._mostrarVacio('Error al cargar datos del servidor.');
                            return;
                        }
                        // Asegurar que asesores sea un array
                        var asesoresRaw = resp.asesores || [];
                        self._asesores = Array.isArray(asesoresRaw) ? asesoresRaw : Object.values(asesoresRaw);
                        self._filas = resp.filas || [];
                        self._totalesPorAsesor = resp.totalesPorAsesor || {};
                        self._totalGeneral = resp.totalGeneral || 0;

                        // Filtrar asesores con total 0
                        self._asesores = self._asesores.filter(function(as) {
                            var total = self._totalesPorAsesor[as.id] || 0;
                            return total > 0;
                        });
                        // Recalcular total general
                        self._totalGeneral = 0;
                        self._asesores.forEach(function(as) {
                            self._totalGeneral += self._totalesPorAsesor[as.id] || 0;
                        });

                        self._hayDatos = true;

                        self._renderTabla(claId, oficinaId, fechaInicio, fechaFin);
                        self.$el.find('[data-action="exportar"]').prop('disabled', false);
                    })
                    .catch(function () {
                        Espo.Ui.error('Error de conexión al obtener el reporte.');
                        self._mostrarVacio('Error de conexión.');
                    });
            },

            limpiarFiltros: function () {
                this.$el.find('#em-filtro-cla').val('');
                this.$el.find('#em-filtro-oficina').html('<option value="">Todas las oficinas</option>').prop('disabled', true);
                this._inicializarFechas();
                this._hayDatos = false;
                this.$el.find('[data-action="exportar"]').prop('disabled', true);
                if (this._chartInstance) {
                    this._chartInstance.destroy();
                    this._chartInstance = null;
                }
                this._mostrarEstadoInicial();
            },

            _renderTabla: function (claId, oficinaId, fechaInicio, fechaFin) {
                var self = this;
                var asesores = this._asesores;
                var filas = this._filas;

                if (!asesores.length) {
                    this._mostrarVacio('No hay asesores con lados en el período seleccionado.');
                    return;
                }
                if (!filas.length) {
                    this._mostrarVacio('No hay datos para los filtros seleccionados.');
                    return;
                }

                var desc = this._descripcionPeriodo(claId, oficinaId, fechaInicio, fechaFin);

                var headers = ['<th>Tipo de Lado</th>'];
                asesores.forEach(as => {
                    headers.push('<th>' + this._escapeHtml(as.name) + '</th>');
                });
                headers.push('<th class="col-total">Total</th>');

                var tbodyRows = [];
                filas.forEach(fila => {
                    var cells = ['<td>' + this._escapeHtml(fila.tipo) + '</td>'];
                    asesores.forEach(as => {
                        var n = fila.conteos[as.id] || 0;
                        cells.push('<td>' + n + '</td>');
                    });
                    cells.push('<td class="col-total">' + fila.total + '</td>');
                    tbodyRows.push('<tr>' + cells.join('') + '</tr>');
                });

                var totalCells = ['<td><strong>Total</strong></td>'];
                asesores.forEach(as => {
                    var n = this._totalesPorAsesor[as.id] || 0;
                    totalCells.push('<td><strong>' + n + '</strong></td>');
                });
                totalCells.push('<td class="col-total"><strong>' + this._totalGeneral + '</strong></td>');
                var tfootRow = '<tr>' + totalCells.join('') + '</tr>';

                var html = '';
                html += '<div class="em-info-band"><i class="fas fa-info-circle"></i><span>' + desc + '</span></div>';
                html += '<div class="em-tabla-wrapper"><div class="em-tabla-scroll">';
                html += '<table class="em-tabla">';
                html += '<thead><tr>' + headers.join('') + '</tr></thead>';
                html += '<tbody>' + tbodyRows.join('') + '</tbody>';
                html += '<tfoot>' + tfootRow + '</tfoot>';
                html += '</table></div></div>';

                html += '<div class="em-grafico-container">';
                html += '<h3 style="margin-top:0;margin-bottom:16px;"><i class="fas fa-chart-bar"></i> Distribución por Asesor</h3>';
                html += '<canvas id="em-grafico-canvas" style="width:100%; max-height:500px;"></canvas>';
                html += '</div>';

                this.$el.find('#em-resultado-container').html(html);

                setTimeout(function () {
                    self._renderGrafico();
                }, 50);
            },

            _renderGrafico: function () {
                if (typeof Chart === 'undefined') {
                    this.$el.find('.em-grafico-container').html(
                        '<div class="em-info-band"><i class="fas fa-chart-bar"></i> Gráfico no disponible (falta librería Chart.js)</div>'
                    );
                    return;
                }

                if (this._chartInstance) {
                    this._chartInstance.destroy();
                }

                var asesores = this._asesores;
                var filas = this._filas;

                var captadores = [];
                var cerradores = [];
                var labels = [];

                asesores.forEach(as => {
                    labels.push(as.name);
                    var captadorFila = filas.find(f => f.tipo === 'Captador (Obtención)');
                    var cerradorFila = filas.find(f => f.tipo === 'Cerrador (Cierre)');
                    captadores.push(captadorFila ? (captadorFila.conteos[as.id] || 0) : 0);
                    cerradores.push(cerradorFila ? (cerradorFila.conteos[as.id] || 0) : 0);
                });

                var ctx = document.getElementById('em-grafico-canvas');
                if (!ctx) return;
                ctx = ctx.getContext('2d');

                this._chartInstance = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Captador (Obtención)',
                                data: captadores,
                                backgroundColor: 'rgba(184, 162, 121, 0.8)',
                                borderColor: '#B8A279',
                                borderWidth: 1
                            },
                            {
                                label: 'Cerrador (Cierre)',
                                data: cerradores,
                                backgroundColor: 'rgba(54, 52, 56, 0.8)',
                                borderColor: '#363438',
                                borderWidth: 1
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        indexAxis: 'y',
                        plugins: {
                            legend: { position: 'top' },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        return context.dataset.label + ': ' + context.raw;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: { title: { display: true, text: 'Cantidad de lados' } },
                            y: { title: { display: true, text: 'Asesor' } }
                        }
                    }
                });
            },

            exportar: function () {
                if (!this._hayDatos) return;

                var headers = ['Tipo de Lado'].concat(this._asesores.map(as => as.name)).concat(['Total']);
                var filasExcel = this._filas.map(function (fila) {
                    var row = [fila.tipo];
                    this._asesores.forEach(function (as) {
                        row.push(fila.conteos[as.id] || 0);
                    });
                    row.push(fila.total);
                    return row;
                }.bind(this));

                var totalRow = ['Total'];
                this._asesores.forEach(function (as) {
                    totalRow.push(this._totalesPorAsesor[as.id] || 0);
                }.bind(this));
                totalRow.push(this._totalGeneral);

                var claId = this.$el.find('#em-filtro-cla').val() || null;
                var oficinaId = this.$el.find('#em-filtro-oficina').val() || null;
                var fechaInicio = this.$el.find('#em-filtro-fecha-inicio').val() || null;
                var fechaFin = this.$el.find('#em-filtro-fecha-fin').val() || null;

                ExcelExport.exportar({
                    nombreArchivo: 'tipos_lado_por_asesor_' + (fechaInicio ? fechaInicio.replace(/-/g, '') : '') + '_' + (fechaFin ? fechaFin.replace(/-/g, '') : ''),
                    titulo: 'Tipos de Lado por Asesor',
                    subtitulo: this._descripcionPeriodo(claId, oficinaId, fechaInicio, fechaFin),
                    headers: headers,
                    filas: filasExcel,
                    filaTotal: totalRow
                });
            },

            _mostrarCargando: function () {
                this.$el.find('#em-resultado-container').html(
                    '<div class="em-empty"><div class="em-spinner" style="margin-bottom:16px;"></div><h4>Cargando datos…</h4><p>Consultando la base de datos</p></div>'
                );
            },

            _mostrarVacio: function (msg) {
                this.$el.find('#em-resultado-container').html(
                    '<div class="em-empty"><div class="em-empty-icon"><i class="fas fa-inbox"></i></div><h4>Sin resultados</h4><p>' + (msg || 'No hay datos para los filtros seleccionados.') + '</p></div>'
                );
                this.$el.find('[data-action="exportar"]').prop('disabled', true);
            },

            _mostrarEstadoInicial: function () {
                this.$el.find('#em-resultado-container').html(
                    '<div class="em-empty"><div class="em-empty-icon"><i class="fas fa-search"></i></div><h4>Aplique los filtros para ver el reporte</h4><p>Seleccione los parámetros deseados y presione <strong>Buscar</strong></p></div>'
                );
            },

            _descripcionPeriodo: function (claId, oficinaId, fechaInicio, fechaFin) {
                var partes = [];
                if (fechaInicio && fechaFin) partes.push('Período: ' + fechaInicio + ' → ' + fechaFin);
                else if (fechaInicio) partes.push('Desde: ' + fechaInicio);
                else if (fechaFin) partes.push('Hasta: ' + fechaFin);
                else partes.push('Todos los períodos');

                if (claId) {
                    var $opt = this.$el.find('#em-filtro-cla option[value="' + claId + '"]');
                    var nombreCla = $opt.length ? $opt.text() : claId;
                    partes.push('CLA: ' + nombreCla);
                }
                if (oficinaId) {
                    var $optOf = this.$el.find('#em-filtro-oficina option[value="' + oficinaId + '"]');
                    var nombreOf = $optOf.length ? $optOf.text() : oficinaId;
                    partes.push('Oficina: ' + nombreOf);
                }

                return partes.join(' | ');
            },

            _escapeHtml: function (str) {
                if (!str) return '';
                return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            }

        });
    }
);