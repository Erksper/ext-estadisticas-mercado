// estadisticas-mercado/src/views/reportes/estadisticas-m2.js
define(
    'estadisticas-mercado:views/reportes/estadisticas-m2',
    [
        'view',
        'estadisticas-mercado:views/modules/excel-export'
    ],
    function (View, ExcelExport) {

        return View.extend({

            template: 'estadisticas-mercado:reportes/estadisticas-m2',

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
                'change #em-filtro-tipo-propiedad': function () { this._cargarSubtipos(); }
            },

            setup: function () {
                this._cargandoCiudades = true;
            },

            afterRender: function () {
                this._cargarCiudades();
                this._inicializarFechas();
            },

            _cargarCiudades: function () {
                var self = this;
                Espo.Ajax.getRequest('EstadisticasMercado/action/getCiudades')
                    .then(function (resp) {
                        if (!resp.success) return;
                        var $sel = self.$el.find('#em-filtro-ciudad');
                        $sel.empty().append('<option value="">Seleccione una ciudad</option>');
                        (resp.data || []).forEach(function (ciudad) {
                            $sel.append('<option value="' + ciudad + '">' + ciudad + '</option>');
                        });
                    })
                    .catch(function () {
                        Espo.Ui.error('Error al cargar las ciudades.');
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
                var ciudad = this.$el.find('#em-filtro-ciudad').val();
                if (!ciudad) {
                    Espo.Ui.error('Debe seleccionar una ciudad.');
                    return;
                }

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
                    ciudad: ciudad,
                    fechaInicio: fechaInicio,
                    fechaFin: fechaFin,
                    tipoOperacion: tipoOperacion,
                    tipoPropiedad: tipoPropiedad,
                    subtipoPropiedad: subtipoPropiedad
                };

                var self = this;
                Espo.Ajax.getRequest('EstadisticasMercado/action/getEstadisticasMercadoPorM2', params)
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

                        self._renderTabla(ciudad, fechaInicio, fechaFin, tipoOperacion, tipoPropiedad, subtipoPropiedad);
                        self.$el.find('[data-action="exportar"]').prop('disabled', false);
                    })
                    .catch(function () {
                        Espo.Ui.error('Error de conexión al obtener el reporte.');
                        self._mostrarVacio('Error de conexión.');
                    });
            },

            limpiarFiltros: function () {
                this.$el.find('#em-filtro-ciudad').val('');
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

            _renderTabla: function (ciudad, fechaInicio, fechaFin, tipoOperacion, tipoPropiedad, subtipoPropiedad) {
                var self = this;
                var urbanizaciones = this._urbanizaciones;
                var filas = this._filas;

                if (!urbanizaciones.length) {
                    this._mostrarVacio('No hay urbanizaciones en la ciudad seleccionada.');
                    return;
                }

                // Mapear visualmente el tipo de operación para mostrar "Alquiler" si es 'renta'
                var tipoOperacionTexto = '';
                if (tipoOperacion === 'renta') {
                    tipoOperacionTexto = 'Alquiler';
                } else if (tipoOperacion === 'Venta') {
                    tipoOperacionTexto = 'Venta';
                }

                var desc = this._descripcionPeriodo(ciudad, fechaInicio, fechaFin, tipoOperacionTexto, tipoPropiedad, subtipoPropiedad);

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

                var ciudad = this.$el.find('#em-filtro-ciudad').val() || '';
                var fechaInicio = this.$el.find('#em-filtro-fecha-inicio').val() || null;
                var fechaFin = this.$el.find('#em-filtro-fecha-fin').val() || null;
                var tipoOperacion = this.$el.find('#em-filtro-tipo-operacion').val() || null;
                var tipoPropiedad = this.$el.find('#em-filtro-tipo-propiedad').val() || null;
                var subtipoPropiedad = this.$el.find('#em-filtro-subtipo').val() || null;

                // Convertir tipoOperacion para mostrar 'Alquiler' si es 'renta'
                var tipoOperacionTexto = '';
                if (tipoOperacion === 'renta') {
                    tipoOperacionTexto = 'Alquiler';
                } else if (tipoOperacion === 'Venta') {
                    tipoOperacionTexto = 'Venta';
                }

                ExcelExport.exportar({
                    nombreArchivo: 'estadisticas_m2_' + ciudad.replace(/\s/g, '_') + '_' + (fechaInicio ? fechaInicio : '') + '_' + (fechaFin ? fechaFin : ''),
                    titulo: 'Informe Estadístico de Mercado por m²',
                    subtitulo: this._descripcionPeriodo(ciudad, fechaInicio, fechaFin, tipoOperacionTexto, tipoPropiedad, subtipoPropiedad),
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

            _descripcionPeriodo: function (ciudad, fechaInicio, fechaFin, tipoOperacionTexto, tipoPropiedad, subtipoPropiedad) {
                var partes = [];
                partes.push('Ciudad: ' + ciudad);
                if (fechaInicio && fechaFin) partes.push('Período: ' + fechaInicio + ' → ' + fechaFin);
                else if (fechaInicio) partes.push('Desde: ' + fechaInicio);
                else if (fechaFin) partes.push('Hasta: ' + fechaFin);
                if (tipoOperacionTexto) partes.push('Tipo Operación: ' + tipoOperacionTexto);
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