// estadisticas-mercado/src/views/reportes/estadisticas-m2-cla.js
define(
    'estadisticas-mercado:views/reportes/estadisticas-m2-cla',
    [
        'view',
        'estadisticas-mercado:views/modules/excel-export'
    ],
    function (View, ExcelExport) {

        return View.extend({

            template: 'estadisticas-mercado:reportes/estadisticas-m2-cla',

            _urbanizaciones: [],
            _filas: [],
            _totales: {},
            _hayDatos: false,

            events: {
                'click [data-action="buscar"]':   function () { this.buscar(); },
                'click [data-action="limpiar"]':  function () { this.limpiarFiltros(); },
                'click [data-action="volver"]':   function () {
                    this.getRouter().navigate('#EstadisticasMercado', { trigger: true });
                },
                'click [data-action="exportar"]': function () { this.exportar(); },
                'change #em-filtro-cla': function () { this._cargarOficinas(); },
                'change #em-filtro-tipo-propiedad': function () { this._cargarSubtipos(); }
            },

            setup: function () {
                this._cargandoCLAs = true;
            },

            afterRender: function () {
                this._cargarCLAs();
                this._inicializarFechas();
            },

            _cargarCLAs: function () {
                var self = this;
                Espo.Ajax.getRequest('EstadisticasMercado/action/getCLAs')
                    .then(function (resp) {
                        if (!resp.success) return;
                        var $sel = self.$el.find('#em-filtro-cla');
                        $sel.empty().append('<option value="">Seleccione un CLA</option>');
                        (resp.data || []).forEach(function (cla) {
                            $sel.append('<option value="' + cla.id + '">' + cla.name + '</option>');
                        });
                    })
                    .catch(function () {
                        Espo.Ui.error('Error al cargar los CLAs.');
                    });
            },

            _cargarOficinas: function () {
                var claId = this.$el.find('#em-filtro-cla').val();
                var $oficina = this.$el.find('#em-filtro-oficina');
                if (!claId) {
                    $oficina.html('<option value="">Todas las oficinas</option>');
                    $oficina.prop('disabled', true);
                    return;
                }
                $oficina.prop('disabled', true).html('<option value="">Cargando...</option>');
                var self = this;
                Espo.Ajax.getRequest('EstadisticasMercado/action/getOficinasByCLA', { claId: claId })
                    .then(function (resp) {
                        if (!resp.success) {
                            $oficina.html('<option value="">Error</option>');
                            return;
                        }
                        var html = '<option value="">Todas las oficinas</option>';
                        (resp.data || []).forEach(function (of) {
                            html += '<option value="' + of.id + '">' + of.name + '</option>';
                        });
                        $oficina.html(html);
                        $oficina.prop('disabled', false);
                    })
                    .catch(function () {
                        $oficina.html('<option value="">Error</option>');
                    });
            },

            _cargarSubtipos: function () {
                var tipoPropiedad = this.$el.find('#em-filtro-tipo-propiedad').val();
                var $subtipo = this.$el.find('#em-filtro-subtipo');
                if (!tipoPropiedad) {
                    $subtipo.html('<option value="">Todos</option>');
                    $subtipo.prop('disabled', true);
                    return;
                }
                $subtipo.prop('disabled', true).html('<option value="">Cargando...</option>');
                var self = this;
                Espo.Ajax.getRequest('EstadisticasMercado/action/getSubtiposPorTipo', { tipoPropiedad: tipoPropiedad })
                    .then(function (resp) {
                        if (!resp.success) {
                            $subtipo.html('<option value="">Error</option>');
                            return;
                        }
                        var html = '<option value="">Todos</option>';
                        (resp.data || []).forEach(function (subtipo) {
                            html += '<option value="' + self._escapeHtml(subtipo) + '">' + self._escapeHtml(subtipo) + '</option>';
                        });
                        $subtipo.html(html);
                        $subtipo.prop('disabled', false);
                    })
                    .catch(function () {
                        $subtipo.html('<option value="">Error</option>');
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
                var claId = this.$el.find('#em-filtro-cla').val();
                if (!claId) {
                    Espo.Ui.error('Debe seleccionar un CLA.');
                    return;
                }

                var oficinaId = this.$el.find('#em-filtro-oficina').val() || null;
                var fechaInicio = this.$el.find('#em-filtro-fecha-inicio').val() || null;
                var fechaFin = this.$el.find('#em-filtro-fecha-fin').val() || null;
                if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
                    Espo.Ui.error('La fecha de inicio no puede ser mayor a la fecha fin.');
                    return;
                }

                var tipoOperacion = this.$el.find('#em-filtro-tipo-operacion').val() || null;
                var tipoPropiedad = this.$el.find('#em-filtro-tipo-propiedad').val() || null;
                var subtipoPropiedad = this.$el.find('#em-filtro-subtipo').val() || null;

                this._mostrarCargando();

                var params = {
                    claId: claId,
                    oficinaId: oficinaId,
                    fechaInicio: fechaInicio,
                    fechaFin: fechaFin,
                    tipoOperacion: tipoOperacion,
                    tipoPropiedad: tipoPropiedad,
                    subtipoPropiedad: subtipoPropiedad
                };

                var self = this;
                Espo.Ajax.getRequest('EstadisticasMercado/action/getEstadisticasM2PorCLA', params)
                    .then(function (resp) {
                        if (!resp.success) {
                            Espo.Ui.error('Error al obtener datos: ' + (resp.error || ''));
                            self._mostrarVacio('Error al cargar datos del servidor.');
                            return;
                        }
                        self._urbanizaciones = resp.urbanizaciones || [];
                        self._filas = resp.filas || [];
                        self._totales = resp.totales || { lados: 0, avg_price: null, avg_m2: null, avg_price_m2: null };
                        self._hayDatos = true;

                        self._renderTabla(claId, oficinaId, fechaInicio, fechaFin, tipoOperacion, tipoPropiedad, subtipoPropiedad);
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
                this.$el.find('#em-filtro-tipo-operacion').val('');
                this.$el.find('#em-filtro-tipo-propiedad').val('');
                var $subtipo = this.$el.find('#em-filtro-subtipo');
                $subtipo.html('<option value="">Todos</option>');
                $subtipo.prop('disabled', true);
                this._hayDatos = false;
                this.$el.find('[data-action="exportar"]').prop('disabled', true);
                this._mostrarEstadoInicial();
            },

            _renderTabla: function (claId, oficinaId, fechaInicio, fechaFin, tipoOperacion, tipoPropiedad, subtipoPropiedad) {
                var self = this;
                var urbanizaciones = this._urbanizaciones;
                var filas = this._filas;

                if (!urbanizaciones.length) {
                    this._mostrarVacio('No hay urbanizaciones con datos para los filtros seleccionados.');
                    return;
                }

                var desc = this._descripcionPeriodo(claId, oficinaId, fechaInicio, fechaFin, tipoOperacion, tipoPropiedad, subtipoPropiedad);

                var html = '';
                html += '<div class="em-info-band"><i class="fas fa-info-circle"></i><span>' + desc + '</span></div>';
                html += '<div class="em-tabla-wrapper"><div class="em-tabla-scroll">';
                html += '<table class="em-tabla">';
                html += '<thead>';
                html += '<th>Urbanización</th>';
                html += '<th>Lados</th>';
                html += '<th>Promedio de precios</th>';
                html += '<th>Promedio por m²</th>';
                html += '<th>Promedio precio / m²</th>';
                html += '</thead>';
                html += '<tbody>';

                for (var i = 0; i < filas.length; i++) {
                    var fila = filas[i];
                    html += '<tr>';
                    html += '<td>' + this._escapeHtml(fila.urbanizacion) + '</td>';
                    html += '<td>' + (fila.lados || 0) + '</td>';
                    html += '<td>' + (fila.avg_price !== null ? '$ ' + this._formatNumber(fila.avg_price) : '-') + '</td>';
                    html += '<td>' + (fila.avg_m2 !== null ? this._formatNumber(fila.avg_m2) + ' m²' : '-') + '</td>';
                    html += '<td>' + (fila.avg_price_m2 !== null ? '$ ' + this._formatNumber(fila.avg_price_m2) : '-') + '</td>';
                    html += '</tr>';
                }

                html += '</tbody>';
                html += '<tfoot>';
                html += '<tr>';
                html += '<td><strong>Total / Promedio</strong></td>';
                html += '<td><strong>' + (this._totales.lados || 0) + '</strong></td>';
                html += '<td><strong>' + (this._totales.avg_price !== null ? '$ ' + this._formatNumber(this._totales.avg_price) : '-') + '</strong></td>';
                html += '<td><strong>' + (this._totales.avg_m2 !== null ? this._formatNumber(this._totales.avg_m2) + ' m²' : '-') + '</strong></td>';
                html += '<td><strong>' + (this._totales.avg_price_m2 !== null ? '$ ' + this._formatNumber(this._totales.avg_price_m2) : '-') + '</strong></td>';
                html += '</tr>';
                html += '</tfoot>';
                html += '</table></div></div>';

                this.$el.find('#em-resultado-container').html(html);
            },

            exportar: function () {
                if (!this._hayDatos) return;

                var headers = ['Urbanización', 'Lados', 'Promedio de precios', 'Promedio por m²', 'Promedio precio / m²'];
                var filasExcel = this._filas.map(function (fila) {
                    return [
                        fila.urbanizacion,
                        fila.lados || 0,
                        fila.avg_price !== null ? fila.avg_price : '',
                        fila.avg_m2 !== null ? fila.avg_m2 : '',
                        fila.avg_price_m2 !== null ? fila.avg_price_m2 : ''
                    ];
                });

                var totalRow = [
                    'Total / Promedio',
                    this._totales.lados || 0,
                    this._totales.avg_price !== null ? this._totales.avg_price : '',
                    this._totales.avg_m2 !== null ? this._totales.avg_m2 : '',
                    this._totales.avg_price_m2 !== null ? this._totales.avg_price_m2 : ''
                ];

                var claId = this.$el.find('#em-filtro-cla').val() || '';
                var oficinaId = this.$el.find('#em-filtro-oficina').val() || null;
                var fechaInicio = this.$el.find('#em-filtro-fecha-inicio').val() || null;
                var fechaFin = this.$el.find('#em-filtro-fecha-fin').val() || null;
                var tipoOperacion = this.$el.find('#em-filtro-tipo-operacion').val() || null;
                var tipoPropiedad = this.$el.find('#em-filtro-tipo-propiedad').val() || null;
                var subtipoPropiedad = this.$el.find('#em-filtro-subtipo').val() || null;

                ExcelExport.exportar({
                    nombreArchivo: 'estadisticas_m2_cla_' + claId + (oficinaId ? '_' + oficinaId : '') + '_' + (fechaInicio ? fechaInicio : '') + '_' + (fechaFin ? fechaFin : ''),
                    titulo: 'Estadísticas m² por CLA',
                    subtitulo: this._descripcionPeriodo(claId, oficinaId, fechaInicio, fechaFin, tipoOperacion, tipoPropiedad, subtipoPropiedad),
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

            _descripcionPeriodo: function (claId, oficinaId, fechaInicio, fechaFin, tipoOperacion, tipoPropiedad, subtipoPropiedad) {
                var partes = [];
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
                if (fechaInicio && fechaFin) partes.push('Período: ' + fechaInicio + ' → ' + fechaFin);
                else if (fechaInicio) partes.push('Desde: ' + fechaInicio);
                else if (fechaFin) partes.push('Hasta: ' + fechaFin);
                if (tipoOperacion) partes.push('Tipo Operación: ' + tipoOperacion);
                if (tipoPropiedad) partes.push('Tipo Propiedad: ' + tipoPropiedad);
                if (subtipoPropiedad) partes.push('Subtipo: ' + subtipoPropiedad);
                return partes.join(' | ');
            },

            _formatNumber: function (num) {
                if (num === null || num === undefined) return '';
                return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            },

            _escapeHtml: function (str) {
                if (!str) return '';
                return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            }

        });
    }
);