// estadisticas-mercado/src/views/reportes/lados-por-tipo-operacion.js
define(
    'estadisticas-mercado:views/reportes/lados-por-tipo-operacion',
    [
        'view',
        'estadisticas-mercado:views/modules/excel-export',
        'estadisticas-mercado:views/modules/detalle-nav',
        'estadisticas-mercado:views/modules/periodo-select'
    ],
    function (View, ExcelExport, DetalleNav, PeriodoSelect) {

        return View.extend($.extend({}, DetalleNav, {

            template: 'estadisticas-mercado:reportes/lados-por-tipo-operacion',

            _oficinas:          [],
            _filas:             [],
            _totalesPorOficina: {},
            _totalGeneral:      0,
            _hayDatos:          false,
            _filtrosActuales:   null,
            _periodoSelect:     null,

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
                    this._irADetalle({
                        reporte:       'ladosPorTipoOperacion',
                        rutaReporte:   '#EstadisticasMercado/ladosPorTipoOperacion',
                        seleccion:     'columna',
                        identificador: String($th.data('oficina-id')),
                        titulo:        'Oficina: ' + $th.text().trim(),
                        filtros:       this._filtrosActuales
                    });
                },

                // Clic en primera celda de fila (tipo operación)
                'click .clickable-row': function (e) {
                    var tipo = $(e.currentTarget).text().trim();
                    this._irADetalle({
                        reporte:       'ladosPorTipoOperacion',
                        rutaReporte:   '#EstadisticasMercado/ladosPorTipoOperacion',
                        seleccion:     'fila',
                        identificador: tipo,
                        titulo:        'Tipo de Operación: ' + tipo,
                        filtros:       this._filtrosActuales
                    });
                }
            },

            setup: function () {
                this._filtrosDesdeUrl = this.options.params || {};
            },

            afterRender: function () {
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
                    blockedMonths: [11, 12],   // Nov y Dic bloqueados
                    getAnios: function (cb) {
                        var claId = self.$el.find('#em-filtro-cla').val() || null;
                        Espo.Ajax.getRequest('EstadisticasMercado/action/getAniosDisponibles', {
                            reporte: 'ladosPorTipoOperacion',
                            claId:   claId
                        }).then(function (r) {
                            cb(r.success ? (r.data || []) : []);
                        }).catch(function () { cb([]); });
                    }
                });
            },

            // ── Carga de CLAs ─────────────────────────────────────────────────

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
                        // Al cambiar CLA recargar años disponibles
                        $sel.on('change', function () {
                            if (self._periodoSelect) self._periodoSelect.reloadAnios();
                        });
                    })
                    .catch(function () { Espo.Ui.error('Error al cargar los CLAs.'); });
            },

            // ── Restaurar filtros desde URL (al volver del detalle) ───────────

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

            // ── Búsqueda principal ────────────────────────────────────────────

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

                // LOG de depuración → visible en DevTools > Network o Console
                console.log('[LadosPorTipoOperacion] params →', JSON.stringify(params));

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
                        self._renderTabla();
                        self.$el.find('[data-action="exportar"]').prop('disabled', false);
                    })
                    .catch(function () {
                        Espo.Ui.error('Error de conexión al obtener el reporte.');
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
                this._mostrarEstadoInicial();
            },

            // ── Render de tabla ───────────────────────────────────────────────

            _renderTabla: function () {
                var self     = this;
                var oficinas = this._oficinas;
                var filas    = this._filas;

                if (!oficinas.length || !filas.length || this._totalGeneral === 0) {
                    this._mostrarVacio('No se encontraron lados con los filtros aplicados.');
                    return;
                }

                var desc = this._descripcionPeriodo(this._filtrosActuales);
                var html = '';
                html += '<div class="em-info-band"><i class="fas fa-info-circle"></i><span>' + desc + '</span></div>';
                html += '<div class="em-tabla-wrapper"><div class="em-tabla-scroll">';
                html += '<table class="em-tabla"><thead><tr>';
                html += '<th>Tipo de Operación</th>';

                oficinas.forEach(function (of) {
                    html += '<th class="clickable-col" data-oficina-id="' +
                            self._esc(of.id) + '" title="Ver detalle de ' +
                            self._esc(of.name) + '">' + self._esc(of.name) + '</th>';
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

            // ── Exportar ──────────────────────────────────────────────────────

            exportar: function () {
                if (!this._hayDatos) return;

                var self     = this;
                var oficinas = this._oficinas;
                var headers  = ['Tipo de Operación']
                    .concat(oficinas.map(function (o) { return o.name; }))
                    .concat(['Total']);

                var filasExcel = this._filas.map(function (fila) {
                    var row = [fila.tipo];
                    oficinas.forEach(function (o) { row.push(fila.conteos[o.id] || 0); });
                    row.push(fila.total);
                    return row;
                });

                var filaTotal = ['Total'];
                oficinas.forEach(function (o) { filaTotal.push(self._totalesPorOficina[o.id] || 0); });
                filaTotal.push(this._totalGeneral);

                ExcelExport.exportar({
                    nombreArchivo: 'lados_por_tipo_operacion',
                    titulo:        'Lado por Tipo de Operación',
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
                    '</div>'
                );
            },

            _mostrarVacio: function (msg) {
                this.$el.find('#em-resultado-container').html(
                    '<div class="em-empty">' +
                    '<div class="em-empty-icon"><i class="fas fa-inbox"></i></div>' +
                    '<h4>Sin resultados</h4><p>' + (msg || 'No hay datos.') + '</p>' +
                    '</div>'
                );
                this.$el.find('[data-action="exportar"]').prop('disabled', true);
            },

            _mostrarEstadoInicial: function () {
                this.$el.find('#em-resultado-container').html(
                    '<div class="em-empty">' +
                    '<div class="em-empty-icon"><i class="fas fa-search"></i></div>' +
                    '<h4>Aplique los filtros para ver el reporte</h4>' +
                    '<p>Seleccione los parámetros deseados y presione <strong>Buscar</strong></p>' +
                    '</div>'
                );
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