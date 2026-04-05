// estadisticas-mercado/src/views/reportes/lados-por-tipo-operacion.js
//
// CAMBIOS respecto a la versión anterior:
//   1. Se importa el mixin 'detalle-nav'
//   2. Se extiende la vista con $.extend({}, DetalleNav, { … })
//   3. Los eventos de click en columna/fila llaman a this._irADetalle(…)
//   4. Se elimina el método _abrirDetalle() anterior (reemplazado por el mixin)
//
define(
    'estadisticas-mercado:views/reportes/lados-por-tipo-operacion',
    [
        'view',
        'estadisticas-mercado:views/modules/excel-export',
        'estadisticas-mercado:views/modules/detalle-nav'
    ],
    function (View, ExcelExport, DetalleNav) {

        return View.extend($.extend({}, DetalleNav, {

            template: 'estadisticas-mercado:reportes/lados-por-tipo-operacion',

            _oficinas:          [],
            _filas:             [],
            _totalesPorOficina: {},
            _totalGeneral:      0,
            _hayDatos:          false,
            _filtrosActuales:   null,

            events: {
                'click [data-action="buscar"]':  function () { this.buscar(); },
                'click [data-action="limpiar"]': function () { this.limpiarFiltros(); },
                'click [data-action="volver"]':  function () {
                    this.getRouter().navigate('#EstadisticasMercado', { trigger: true });
                },
                'click [data-action="exportar"]': function () { this.exportar(); },

                // ── Clic en cabecera de columna (oficina) ──────────────────
                'click .clickable-col': function (e) {
                    var $th = $(e.currentTarget);
                    var oficinaNombre = $th.text().trim();
                    var oficinaId     = $th.data('oficina-id');

                    this._irADetalle({
                        reporte:       'ladosPorTipoOperacion',
                        // Ruta base del reporte: al volver se navega aquí con los filtros
                        rutaReporte:   '#EstadisticasMercado/ladosPorTipoOperacion',
                        seleccion:     'columna',
                        identificador: String(oficinaId),
                        titulo:        'Oficina: ' + oficinaNombre,
                        filtros: {
                            claId:       this._filtrosActuales.claId,
                            fechaInicio: this._filtrosActuales.fechaInicio,
                            fechaFin:    this._filtrosActuales.fechaFin
                        }
                    });
                },

                // ── Clic en la primera celda de cada fila (tipo operación) ─
                'click .clickable-row': function (e) {
                    var tipoOperacion = $(e.currentTarget).text().trim(); // 'Venta' | 'Alquiler'

                    this._irADetalle({
                        reporte:       'ladosPorTipoOperacion',
                        rutaReporte:   '#EstadisticasMercado/ladosPorTipoOperacion',
                        seleccion:     'fila',
                        identificador: tipoOperacion,  // se mapea a 'renta' en el backend
                        titulo:        'Tipo de Operación: ' + tipoOperacion,
                        filtros: {
                            claId:       this._filtrosActuales.claId,
                            fechaInicio: this._filtrosActuales.fechaInicio,
                            fechaFin:    this._filtrosActuales.fechaFin
                        }
                    });
                }
            },

            setup: function () {
                this._cargandoCLAs = true;
                // Leer filtros que vengan en la URL (al volver desde el detalle)
                this._filtrosDesdeUrl = this.options.params || {};
            },

            afterRender: function () {
                this._cargarCLAs();
                this._inicializarFechas();
                // Si venimos de "volver" del detalle, restaurar filtros y buscar
                this._restaurarFiltrosDesdeUrl();
            },

            // Restaura los valores de los selects/inputs desde los params de la URL
            // y lanza la búsqueda automáticamente si hay algún filtro activo.
            _restaurarFiltrosDesdeUrl: function () {
                var p    = this._filtrosDesdeUrl;
                var self = this;
                if (!p || (!p.claId && !p.fechaInicio && !p.fechaFin)) return;

                // Restaurar fechas directamente (no dependen de async)
                if (p.fechaInicio) this.$el.find('#em-filtro-fecha-inicio').val(p.fechaInicio);
                if (p.fechaFin)    this.$el.find('#em-filtro-fecha-fin').val(p.fechaFin);

                // Restaurar CLA: esperar a que el select esté poblado
                if (p.claId) {
                    var intentos = 0;
                    var esperar = setInterval(function () {
                        var $sel = self.$el.find('#em-filtro-cla');
                        if ($sel.find('option[value="' + p.claId + '"]').length || intentos > 30) {
                            clearInterval(esperar);
                            $sel.val(p.claId);
                            // Disparar búsqueda automática
                            self.buscar();
                        }
                        intentos++;
                    }, 100);
                } else {
                    // Sin CLA: buscar directamente con las fechas
                    this.buscar();
                }
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

                var params = {};
                if (claId)       params.claId       = claId;
                if (fechaInicio) params.fechaInicio  = fechaInicio;
                if (fechaFin)    params.fechaFin     = fechaFin;

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
                        self._filtrosActuales   = { claId, fechaInicio, fechaFin };

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
                this._filtrosActuales = null;
                this.$el.find('[data-action="exportar"]').prop('disabled', true);
                this._mostrarEstadoInicial();
            },

            _renderTabla: function () {
                var self     = this;
                var oficinas = this._oficinas;
                var filas    = this._filas;

                if (!oficinas.length || !filas.length || this._totalGeneral === 0) {
                    this._mostrarVacio('No se encontraron lados con los filtros aplicados.');
                    return;
                }

                var desc = this._descripcionPeriodo(
                    this._filtrosActuales.claId,
                    this._filtrosActuales.fechaInicio,
                    this._filtrosActuales.fechaFin
                );

                var html = '';
                html += '<div class="em-info-band"><i class="fas fa-info-circle"></i><span>' + desc + '</span></div>';
                html += '<div class="em-tabla-wrapper"><div class="em-tabla-scroll">';
                html += '<table class="em-tabla"><thead><tr>';
                html += '<th>Tipo de Operación</th>';

                oficinas.forEach(function (of) {
                    html += '<th class="clickable-col" data-oficina-id="' +
                            self._esc(of.id) + '" title="Ver detalle de ' +
                            self._esc(of.name) + '">' +
                            self._esc(of.name) + '</th>';
                });

                html += '<th class="col-total">Total</th>';
                html += '</tr></thead><tbody>';

                filas.forEach(function (fila) {
                    html += '<tr>';
                    html += '<td class="clickable-row" title="Ver detalle de ' +
                            self._esc(fila.tipo) + '">' + self._esc(fila.tipo) + '</td>';
                    oficinas.forEach(function (of) {
                        html += '<td>' + (fila.conteos[of.id] || 0) + '</td>';
                    });
                    html += '<td class="col-total">' + fila.total + '</td>';
                    html += '</tr>';
                });

                html += '</tbody><tfoot><tr>';
                html += '<td><strong>Total</strong></td>';
                oficinas.forEach(function (of) {
                    html += '<td><strong>' + (self._totalesPorOficina[of.id] || 0) + '</strong></td>';
                });
                html += '<td class="col-total"><strong>' + this._totalGeneral + '</strong></td>';
                html += '</tr></tfoot></table></div></div>';

                this.$el.find('#em-resultado-container').html(html);
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
                    oficinas.forEach(function (of) { row.push(fila.conteos[of.id] || 0); });
                    row.push(fila.total);
                    return row;
                });

                var filaTotal = ['Total'];
                oficinas.forEach(function (of) {
                    filaTotal.push(self._totalesPorOficina[of.id] || 0);
                });
                filaTotal.push(this._totalGeneral);

                ExcelExport.exportar({
                    nombreArchivo: 'lados_por_tipo_operacion_' +
                                   (this._filtrosActuales.fechaInicio || '').replace(/-/g, '') + '_' +
                                   (this._filtrosActuales.fechaFin    || '').replace(/-/g, ''),
                    titulo:    'Lado por Tipo de Operación',
                    subtitulo: this._descripcionPeriodo(
                        this._filtrosActuales.claId,
                        this._filtrosActuales.fechaInicio,
                        this._filtrosActuales.fechaFin
                    ),
                    headers:   headers,
                    filas:     filasExcel,
                    filaTotal: filaTotal
                });
            },

            _mostrarCargando: function () {
                this.$el.find('#em-resultado-container').html(
                    '<div class="em-empty"><div class="em-spinner" style="margin-bottom:16px;"></div>' +
                    '<h4>Cargando datos…</h4><p>Consultando la base de datos</p></div>'
                );
            },

            _mostrarVacio: function (msg) {
                this.$el.find('#em-resultado-container').html(
                    '<div class="em-empty"><div class="em-empty-icon"><i class="fas fa-inbox"></i></div>' +
                    '<h4>Sin resultados</h4><p>' + (msg || 'No hay datos.') + '</p></div>'
                );
                this.$el.find('[data-action="exportar"]').prop('disabled', true);
            },

            _mostrarEstadoInicial: function () {
                this.$el.find('#em-resultado-container').html(
                    '<div class="em-empty"><div class="em-empty-icon"><i class="fas fa-search"></i></div>' +
                    '<h4>Aplique los filtros para ver el reporte</h4>' +
                    '<p>Seleccione los parámetros deseados y presione <strong>Buscar</strong></p></div>'
                );
            },

            _descripcionPeriodo: function (claId, fechaInicio, fechaFin) {
                var partes = [];
                if (fechaInicio && fechaFin) partes.push('Período: ' + fechaInicio + ' → ' + fechaFin);
                else if (fechaInicio)        partes.push('Desde: ' + fechaInicio);
                else if (fechaFin)           partes.push('Hasta: ' + fechaFin);
                else                         partes.push('Todos los períodos');
                if (claId) {
                    var $opt    = this.$el.find('#em-filtro-cla option[value="' + claId + '"]');
                    var nomCla  = $opt.length ? $opt.text() : claId;
                    partes.push('CLA: ' + nomCla);
                }
                return partes.join(' | ');
            },

            _esc: function (str) {
                if (!str) return '';
                return String(str)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;');
            }

        })); // cierre $.extend + View.extend
    }
);