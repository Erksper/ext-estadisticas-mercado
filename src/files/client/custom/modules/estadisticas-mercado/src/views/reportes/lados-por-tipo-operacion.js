// estadisticas-mercado/src/views/reportes/lados-por-tipo-operacion.js
define(
    'estadisticas-mercado:views/reportes/lados-por-tipo-operacion',
    [
        'view',
        'estadisticas-mercado:views/modules/excel-export'
    ],
    function (View, ExcelExport) {

        return View.extend({

            template: 'estadisticas-mercado:reportes/lados-por-tipo-operacion',

            _oficinas:          [],
            _filas:             [],
            _totalesPorOficina: {},
            _totalGeneral:      0,
            _hayDatos:          false,
            _filtrosActuales:   null,

            events: {
                'click [data-action="buscar"]':   function () { this.buscar(); },
                'click [data-action="limpiar"]':  function () { this.limpiarFiltros(); },
                'click [data-action="volver"]':   function () {
                    this.getRouter().navigate('#EstadisticasMercado', { trigger: true });
                },
                'click [data-action="exportar"]': function () { this.exportar(); },
                // Clic en cabecera de columna (oficina)
                'click .clickable-col': function (e) {
                    var $th = $(e.currentTarget);
                    var oficinaId = $th.data('oficina-id');
                    var oficinaNombre = $th.text();
                    this._abrirDetalle({
                        tipoSeleccion: 'columna',
                        identificador: oficinaId,
                        titulo: 'Oficina: ' + oficinaNombre
                    });
                },
                // Clic en la primera celda de cada fila (tipo de operación)
                'click .clickable-row': function (e) {
                    var $td = $(e.currentTarget);
                    var tipoOperacion = $td.text().trim();
                    this._abrirDetalle({
                        tipoSeleccion: 'fila',
                        identificador: tipoOperacion,
                        titulo: 'Tipo: ' + tipoOperacion
                    });
                }
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
                        $sel.empty().append('<option value="">Todos los CLAs</option>');
                        (resp.data || []).forEach(function (cla) {
                            $sel.append('<option value="' + cla.id + '">' + cla.name + '</option>');
                        });
                    })
                    .catch(function () {
                        Espo.Ui.error('Error al cargar los CLAs.');
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
                var claId        = this.$el.find('#em-filtro-cla').val() || null;
                var fechaInicio  = this.$el.find('#em-filtro-fecha-inicio').val() || null;
                var fechaFin     = this.$el.find('#em-filtro-fecha-fin').val() || null;

                if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
                    Espo.Ui.error('La fecha de inicio no puede ser mayor a la fecha fin.');
                    return;
                }

                this._mostrarCargando();

                var params = {};
                if (claId)        params.claId = claId;
                if (fechaInicio)  params.fechaInicio = fechaInicio;
                if (fechaFin)     params.fechaFin = fechaFin;

                var self = this;
                Espo.Ajax.getRequest('EstadisticasMercado/action/getLadosPorTipoOperacion', params)
                    .then(function (resp) {
                        if (!resp.success) {
                            Espo.Ui.error('Error al obtener datos: ' + (resp.error || ''));
                            self._mostrarVacio('Error al cargar datos del servidor.');
                            return;
                        }
                        self._oficinas          = resp.oficinas          || [];
                        self._filas             = resp.filas             || [];
                        self._totalesPorOficina = resp.totalesPorOficina || {};
                        self._totalGeneral      = resp.totalGeneral      || 0;
                        self._hayDatos          = true;

                        self._filtrosActuales = {
                            claId: claId,
                            fechaInicio: fechaInicio,
                            fechaFin: fechaFin
                        };

                        self._renderTabla();
                        self.$el.find('[data-action="exportar"]').prop('disabled', false);
                    })
                    .catch(function () {
                        Espo.Ui.error('Error de conexión al obtener el reporte.');
                        self._mostrarVacio('Error de conexión.');
                    });
            },

            limpiarFiltros: function () {
                this.$el.find('#em-filtro-cla').val('');
                this._inicializarFechas();
                this._hayDatos = false;
                this.$el.find('[data-action="exportar"]').prop('disabled', true);
                this._mostrarEstadoInicial();
            },

            _renderTabla: function () {
                var self     = this;
                var oficinas = this._oficinas;
                var filas    = this._filas;

                if (!oficinas.length) {
                    this._mostrarVacio('No hay oficinas para el CLA seleccionado.');
                    return;
                }

                if (!filas.length || this._totalGeneral === 0) {
                    this._mostrarVacio('No se encontraron lados con los filtros aplicados.');
                    return;
                }

                var desc = this._descripcionPeriodo(this._filtrosActuales.claId, this._filtrosActuales.fechaInicio, this._filtrosActuales.fechaFin);

                var html = '';

                html += '<div class="em-info-band">'
                     + '<i class="fas fa-info-circle"></i>'
                     + '<span>' + desc + '</span>'
                     + '</div>';

                html += '<div class="em-tabla-wrapper"><div class="em-tabla-scroll">';
                html += '<table class="em-tabla">';

                // THEAD
                html += '<thead>右';
                html += '<th>Tipo de Operación</th>';
                oficinas.forEach(function (of) {
                    html += '<th class="clickable-col" data-oficina-id="' + of.id + '">' + self._escapeHtml(of.name) + '</th>';
                });
                html += '<th class="col-total">Total</th>';
                html += '</thead>';

                // TBODY
                html += '<tbody>';
                filas.forEach(function (fila) {
                    html += '争';
                    html += '<td class="clickable-row">' + self._escapeHtml(fila.tipo) + '</td>';
                    oficinas.forEach(function (of) {
                        var n = fila.conteos[of.id] || 0;
                        html += '<td>' + n + '</td>';
                    });
                    html += '<td class="col-total">' + fila.total + '</td>';
                    html += '</tr>';
                });
                html += '</tbody>';

                // TFOOT
                html += '<tfoot>右';
                html += '<td><strong>Total</strong></td>';
                oficinas.forEach(function (of) {
                    var n = self._totalesPorOficina[of.id] || 0;
                    html += '<td><strong>' + n + '</strong></td>';
                });
                html += '<td class="col-total"><strong>' + this._totalGeneral + '</strong></td>';
                html += '</tr></tfoot>';

                html += '</table></div></div>';

                this.$el.find('#em-resultado-container').html(html);
            },

            _abrirDetalle: function (opciones) {
                var reporte = 'ladosPorTipoOperacion';
                var tipoSeleccion = opciones.tipoSeleccion;
                var identificador = opciones.identificador;
                var titulo = opciones.titulo;

                var filtros = {
                    claId: this._filtrosActuales.claId,
                    fechaInicio: this._filtrosActuales.fechaInicio,
                    fechaFin: this._filtrosActuales.fechaFin
                };

                var filtrosJson = JSON.stringify(filtros);
                var dataString = reporte + '|' + tipoSeleccion + '|' + identificador + '|' + titulo + '|' + filtrosJson;

                var urlActual = window.location.hash;
                var retorno = encodeURIComponent(urlActual);

                var url = '#EstadisticasMercado/propiedadesDetalle?data=' + encodeURIComponent(dataString) + '&retorno=' + retorno;
                this.getRouter().navigate(url, { trigger: true });
            },

            exportar: function () {
                if (!this._hayDatos) return;

                var self     = this;
                var oficinas = this._oficinas;
                var filas    = this._filas;

                var headers = ['Tipo de Operación'];
                oficinas.forEach(function (of) { headers.push(of.name); });
                headers.push('Total');

                var filasExcel = filas.map(function (fila) {
                    var row = [fila.tipo];
                    oficinas.forEach(function (of) {
                        row.push(fila.conteos[of.id] || 0);
                    });
                    row.push(fila.total);
                    return row;
                });

                var filaTotal = ['Total'];
                oficinas.forEach(function (of) {
                    filaTotal.push(self._totalesPorOficina[of.id] || 0);
                });
                filaTotal.push(this._totalGeneral);

                var claId = this._filtrosActuales ? this._filtrosActuales.claId : null;
                var fechaInicio = this._filtrosActuales ? this._filtrosActuales.fechaInicio : null;
                var fechaFin = this._filtrosActuales ? this._filtrosActuales.fechaFin : null;

                ExcelExport.exportar({
                    nombreArchivo: 'lados_por_tipo_operacion_' + (fechaInicio ? fechaInicio.replace(/-/g, '') : '') + '_' + (fechaFin ? fechaFin.replace(/-/g, '') : ''),
                    titulo:        'Lado por Tipo de Operación',
                    subtitulo:     this._descripcionPeriodo(claId, fechaInicio, fechaFin),
                    headers:       headers,
                    filas:         filasExcel,
                    filaTotal:     filaTotal
                });
            },

            _mostrarCargando: function () {
                this.$el.find('#em-resultado-container').html(
                    '<div class="em-empty">'
                    + '<div class="em-spinner" style="margin-bottom:16px;"></div>'
                    + '<h4>Cargando datos…</h4>'
                    + '<p>Consultando la base de datos</p>'
                    + '</div>'
                );
            },

            _mostrarVacio: function (msg) {
                this.$el.find('#em-resultado-container').html(
                    '<div class="em-empty">'
                    + '<div class="em-empty-icon"><i class="fas fa-inbox"></i></div>'
                    + '<h4>Sin resultados</h4>'
                    + '<p>' + (msg || 'No hay datos para los filtros seleccionados.') + '</p>'
                    + '</div>'
                );
                this.$el.find('[data-action="exportar"]').prop('disabled', true);
            },

            _mostrarEstadoInicial: function () {
                this.$el.find('#em-resultado-container').html(
                    '<div class="em-empty">'
                    + '<div class="em-empty-icon"><i class="fas fa-search"></i></div>'
                    + '<h4>Aplique los filtros para ver el reporte</h4>'
                    + '<p>Seleccione los parámetros deseados y presione <strong>Buscar</strong></p>'
                    + '</div>'
                );
            },

            _descripcionPeriodo: function (claId, fechaInicio, fechaFin) {
                var partes = [];
                if (fechaInicio && fechaFin) {
                    partes.push('Período: ' + fechaInicio + ' → ' + fechaFin);
                } else if (fechaInicio) {
                    partes.push('Desde: ' + fechaInicio);
                } else if (fechaFin) {
                    partes.push('Hasta: ' + fechaFin);
                } else {
                    partes.push('Todos los períodos');
                }

                if (claId) {
                    var $opt = this.$el.find('#em-filtro-cla option[value="' + claId + '"]');
                    var nombreCla = $opt.length ? $opt.text() : claId;
                    partes.push('CLA: ' + nombreCla);
                }

                return partes.join(' | ');
            },

            _escapeHtml: function (str) {
                if (!str) return '';
                return String(str)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;');
            }

        });
    }
);