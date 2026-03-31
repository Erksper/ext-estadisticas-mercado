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

            // Estado interno
            _oficinas:          [],
            _filas:             [],
            _totalesPorOficina: {},
            _totalGeneral:      0,
            _hayDatos:          false,

            events: {
                'click [data-action="buscar"]':   function () { this.buscar(); },
                'click [data-action="limpiar"]':  function () { this.limpiarFiltros(); },
                'click [data-action="volver"]':   function () {
                    this.getRouter().navigate('#EstadisticasMercado', { trigger: true });
                },
                'click [data-action="exportar"]': function () { this.exportar(); }
            },

            setup: function () {
                this._cargandoCLAs = true;
            },

            afterRender: function () {
                this._cargarCLAs();
                this._poblarAnios();
            },

            // ── Carga inicial de selectores ──────────────────────────────

            _cargarCLAs: function () {
                var self = this;
                Espo.Ajax.getRequest('EstadisticasMercado/action/getCLAs')
                    .then(function (resp) {
                        if (!resp.success) return;
                        var $sel = self.$el.find('#em-filtro-cla');
                        $sel.empty().append('<option value="">Todos los CLAs</option>');
                        (resp.data || []).forEach(function (cla) {
                            $sel.append(
                                '<option value="' + cla.id + '">' + cla.name + '</option>'
                            );
                        });
                    })
                    .catch(function () {
                        Espo.Ui.error('Error al cargar los CLAs.');
                    });
            },

            _poblarAnios: function () {
                var anioActual = new Date().getFullYear();
                var $sel = this.$el.find('#em-filtro-anio');
                $sel.empty().append('<option value="">Todos</option>');
                for (var a = anioActual; a >= anioActual - 5; a--) {
                    $sel.append('<option value="' + a + '">' + a + '</option>');
                }
                // Seleccionar año actual por defecto
                $sel.val(String(anioActual));
            },

            // ── Buscar ───────────────────────────────────────────────────

            buscar: function () {
                var claId = this.$el.find('#em-filtro-cla').val()  || null;
                var anio  = this.$el.find('#em-filtro-anio').val() || null;
                var mes   = this.$el.find('#em-filtro-mes').val()  || null;

                this._mostrarCargando();

                var params = {};
                if (claId) params.claId = claId;
                if (anio)  params.anio  = anio;
                if (mes)   params.mes   = mes;

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

                        self._renderTabla(claId, anio, mes);
                        self.$el.find('[data-action="exportar"]').prop('disabled', false);
                    })
                    .catch(function () {
                        Espo.Ui.error('Error de conexión al obtener el reporte.');
                        self._mostrarVacio('Error de conexión.');
                    });
            },

            limpiarFiltros: function () {
                this.$el.find('#em-filtro-cla').val('');
                this.$el.find('#em-filtro-anio').val(String(new Date().getFullYear()));
                this.$el.find('#em-filtro-mes').val('');
                this._hayDatos = false;
                this.$el.find('[data-action="exportar"]').prop('disabled', true);
                this._mostrarEstadoInicial();
            },

            // ── Render tabla ─────────────────────────────────────────────

            _renderTabla: function (claId, anio, mes) {
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

                // Descripción del período
                var desc = this._descripcionPeriodo(claId, anio, mes);

                var html = '';

                // Info band
                html += '<div class="em-info-band">'
                     + '<i class="fas fa-info-circle"></i>'
                     + '<span>' + desc + '</span>'
                     + '</div>';

                html += '<div class="em-tabla-wrapper"><div class="em-tabla-scroll">';
                html += '<table class="em-tabla">';

                // ── THEAD ──
                html += '<thead><tr>';
                html += '<th>Tipo de Operación</th>';
                oficinas.forEach(function (of) {
                    html += '<th>' + self._escapeHtml(of.name) + '</th>';
                });
                html += '<th class="col-total">Total</th>';
                html += '</tr></thead>';

                // ── TBODY ──
                html += '<tbody>';
                filas.forEach(function (fila) {
                    html += '<tr>';
                    html += '<td>' + self._escapeHtml(fila.tipo) + '</td>';
                    oficinas.forEach(function (of) {
                        var n = fila.conteos[of.id] || 0;
                        html += '<td>' + n + '</td>';
                    });
                    html += '<td class="col-total">' + fila.total + '</td>';
                    html += '</tr>';
                });
                html += '</tbody>';

                // ── TFOOT ──
                html += '<tfoot><tr>';
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

            // ── Exportar Excel ───────────────────────────────────────────

            exportar: function () {
                if (!this._hayDatos) return;

                var self     = this;
                var oficinas = this._oficinas;
                var filas    = this._filas;

                // Encabezados
                var headers = ['Tipo de Operación'];
                oficinas.forEach(function (of) { headers.push(of.name); });
                headers.push('Total');

                // Filas
                var filasExcel = filas.map(function (fila) {
                    var row = [fila.tipo];
                    oficinas.forEach(function (of) {
                        row.push(fila.conteos[of.id] || 0);
                    });
                    row.push(fila.total);
                    return row;
                });

                // Fila total
                var filaTotal = ['Total'];
                oficinas.forEach(function (of) {
                    filaTotal.push(self._totalesPorOficina[of.id] || 0);
                });
                filaTotal.push(this._totalGeneral);

                // Subtítulo con filtros aplicados
                var claId = this.$el.find('#em-filtro-cla').val() || null;
                var anio  = this.$el.find('#em-filtro-anio').val() || null;
                var mes   = this.$el.find('#em-filtro-mes').val() || null;

                ExcelExport.exportar({
                    nombreArchivo: 'lados_por_tipo_operacion_' + (anio || 'todos') + '_' + (mes || 'todos'),
                    titulo:        'Lado por Tipo de Operación',
                    subtitulo:     this._descripcionPeriodo(claId, anio, mes),
                    headers:       headers,
                    filas:         filasExcel,
                    filaTotal:     filaTotal
                });
            },

            // ── Helpers UI ───────────────────────────────────────────────

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

            // ── Utilidades ───────────────────────────────────────────────

            _descripcionPeriodo: function (claId, anio, mes) {
                var meses = ['', 'Enero','Febrero','Marzo','Abril','Mayo','Junio',
                             'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

                var partes = [];
                if (anio) partes.push('Año: ' + anio);
                if (mes)  partes.push('Mes: ' + (meses[parseInt(mes)] || mes));

                // Obtener nombre del CLA del selector si hay claId
                if (claId) {
                    var $opt = this.$el.find('#em-filtro-cla option[value="' + claId + '"]');
                    var nombreCla = $opt.length ? $opt.text() : claId;
                    partes.push('CLA: ' + nombreCla);
                }

                return partes.length
                    ? partes.join(' | ')
                    : 'Todos los períodos y CLAs';
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
