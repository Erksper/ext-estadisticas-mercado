// estadisticas-mercado/src/views/reportes/estadisticas-m2.js
define(
    'estadisticas-mercado:views/reportes/estadisticas-m2',
    [
        'view',
        'estadisticas-mercado:views/modules/excel-export',
        'estadisticas-mercado:views/modules/detalle-nav',
        'estadisticas-mercado:views/modules/periodo-select',
        'estadisticas-mercado:views/modules/searchable-select'
    ],
    function (View, ExcelExport, DetalleNav, PeriodoSelect, SearchableSelect) {

        return View.extend($.extend({}, DetalleNav, {

            template: 'estadisticas-mercado:reportes/estadisticas-m2',

            _filas:           [],
            _totales:         {},
            _hayDatos:        false,
            _filtrosActuales: null,
            _periodoSelect:   null,
            _ssEstado:        null,
            _ssCiudad:        null,

            events: {
                'click [data-action="buscar"]':     function () { this.buscar(); },
                'click [data-action="limpiar"]':    function () { this.limpiarFiltros(); },
                'click [data-action="volver"]':     function () {
                    this.getRouter().navigate('#EstadisticasMercado', { trigger: true });
                },
                'click [data-action="exportar"]':   function () { this.exportar(); },

                // Al cambiar tipo propiedad: recargar subtipos
                // Si tipo vacío → carga TODOS los subtipos
                'change #em-filtro-tipo-propiedad': function () {
                    this._cargarSubtipos();
                },

                // Solo filas clickeables (por urbanización)
                'click .clickable-row': function (e) {
                    var urb = $(e.currentTarget).text().trim();
                    this._irADetalle({
                        reporte:       'estadisticasM2',
                        rutaReporte:   '#EstadisticasMercado/estadisticasM2',
                        seleccion:     'fila',
                        identificador: urb,
                        titulo:        'Urbanización: ' + urb,
                        filtros:       this._filtrosActuales
                    });
                }
            },

            setup: function () {
                this._filtrosDesdeUrl = this.options.params || {};
            },

            afterRender: function () {
                this._iniciarSearchables();
                this._iniciarPeriodoSelect();
                this._cargarEstados();
                // Cargar todos los subtipos al inicio (tipo vacío = todos)
                this._cargarSubtipos();
                this._restaurarFiltrosDesdeUrl();
            },

            // ── SearchableSelect para Estado y Ciudad ─────────────────────────

            _iniciarSearchables: function () {
                var self = this;

                var contEstado = this.$el.find('#em-filtro-estado-container')[0];
                var contCiudad = this.$el.find('#em-filtro-ciudad-container')[0];
                if (!contEstado || !contCiudad) return;

                // Estado
                this._ssEstado = new SearchableSelect(contEstado, {
                    placeholder: 'Estado…',
                    emptyLabel:  'Todos los estados',
                    items:       [],
                    onChange: function (val) {
                        // Al cambiar estado: recargar ciudades y años
                        self._cargarCiudadesPorEstado(val);
                        if (self._periodoSelect) self._periodoSelect.reloadAnios();
                    }
                });

                // Ciudad
                this._ssCiudad = new SearchableSelect(contCiudad, {
                    placeholder: 'Ciudad…',
                    emptyLabel:  'Todas las ciudades',
                    items:       [],
                    onChange: function () {
                        // Al cambiar ciudad recargar años
                        if (self._periodoSelect) self._periodoSelect.reloadAnios();
                    }
                });
            },

            // ── PeriodoSelect ─────────────────────────────────────────────────

            _iniciarPeriodoSelect: function () {
                var self      = this;
                var container = this.$el.find('#em-periodo-container')[0];
                if (!container) return;

                this._periodoSelect = new PeriodoSelect(container, {
                    blockedMonths: [],   // m² NO excluye nov/dic
                    getAnios: function (cb) {
                        var ciudad = self._ssCiudad ? self._ssCiudad.getValue() : '';
                        Espo.Ajax.getRequest('EstadisticasMercado/action/getAniosDisponibles', {
                            reporte: 'estadisticasM2',
                            ciudad:  ciudad
                        }).then(function (r) {
                            cb(r.success ? (r.data || []) : []);
                        }).catch(function () { cb([]); });
                    }
                });
            },

            // ── Carga de Estados ──────────────────────────────────────────────

            _cargarEstados: function () {
                var self = this;
                Espo.Ajax.getRequest('EstadisticasMercado/action/getEstados')
                    .then(function (resp) {
                        if (!resp.success || !self._ssEstado) return;
                        var items = (resp.data || []).map(function (e) {
                            return { value: e, label: e };
                        });
                        self._ssEstado.setItems(items);
                        // Cargar todas las ciudades inicialmente (sin filtro de estado)
                        self._cargarCiudadesPorEstado('');
                    });
            },

            // ── Carga de Ciudades (filtradas por estado) ──────────────────────

            _cargarCiudadesPorEstado: function (estadoVal) {
                var self = this;
                if (!this._ssCiudad) return;

                this._ssCiudad.disable();

                var params = {};
                if (estadoVal) params.estado = estadoVal;

                Espo.Ajax.getRequest('EstadisticasMercado/action/getCiudades', params)
                    .then(function (resp) {
                        if (!resp.success || !self._ssCiudad) return;
                        var items = (resp.data || []).map(function (c) {
                            return { value: c, label: c };
                        });
                        self._ssCiudad.setItems(items);
                        self._ssCiudad.enable();
                    })
                    .catch(function () {
                        if (self._ssCiudad) self._ssCiudad.enable();
                    });
            },

            // ── Subtipos (siempre habilitado) ─────────────────────────────────
            // Si tipo vacío → devuelve TODOS los subtipos.
            // Si hay tipo → filtra por ese tipo.

            _cargarSubtipos: function (preseleccionarVal, callback) {
                var tipo     = this.$el.find('#em-filtro-tipo-propiedad').val();
                var $subtipo = this.$el.find('#em-filtro-subtipo');

                $subtipo.html('<option value="">Cargando...</option>').prop('disabled', true);

                var self   = this;
                var params = {};
                if (tipo) params.tipoPropiedad = tipo;

                Espo.Ajax.getRequest('EstadisticasMercado/action/getSubtiposPorTipo', params)
                    .then(function (resp) {
                        var html = '<option value="">Todos</option>';
                        (resp.data || []).forEach(function (s) {
                            html += '<option value="' + self._esc(s) + '">' + self._esc(s) + '</option>';
                        });
                        $subtipo.html(html).prop('disabled', false);
                        if (preseleccionarVal) $subtipo.val(preseleccionarVal);
                        if (callback) callback();
                    })
                    .catch(function () {
                        $subtipo.html('<option value="">Error</option>').prop('disabled', false);
                        if (callback) callback();
                    });
            },

            // ── Restaurar filtros desde URL ───────────────────────────────────

            _restaurarFiltrosDesdeUrl: function () {
                var p    = this._filtrosDesdeUrl;
                var self = this;
                var tieneFiltros = p && (p.estado || p.ciudad || p.anios || p.meses ||
                                          p.tipoOperacion || p.tipoPropiedad);
                if (!tieneFiltros) return;

                if (p.tipoOperacion) this.$el.find('#em-filtro-tipo-operacion').val(p.tipoOperacion);

                var buscarFn = function () {
                    if (p.tipoPropiedad) {
                        self.$el.find('#em-filtro-tipo-propiedad').val(p.tipoPropiedad);
                        self._cargarSubtipos(p.subtipoPropiedad, function () { self.buscar(); });
                    } else {
                        self.buscar();
                    }
                };

                // Restaurar estado → esperar a que ssEstado tenga items
                if (p.estado) {
                    var intentosE = 0;
                    var esperarE = setInterval(function () {
                        if ((self._ssEstado && self._ssEstado._items.length > 0) || intentosE > 30) {
                            clearInterval(esperarE);
                            self._ssEstado.setValue(p.estado);
                            // Cargar ciudades del estado y luego ciudad
                            self._cargarCiudadesPorEstado(p.estado);
                            setTimeout(function () {
                                if (p.ciudad && self._ssCiudad) {
                                    self._ssCiudad.setValue(p.ciudad);
                                }
                                buscarFn();
                            }, 400);
                        }
                        intentosE++;
                    }, 100);
                } else if (p.ciudad) {
                    // Sin estado pero con ciudad: esperar ciudades
                    var intentosC = 0;
                    var esperarC = setInterval(function () {
                        if ((self._ssCiudad && self._ssCiudad._items.length > 0) || intentosC > 30) {
                            clearInterval(esperarC);
                            self._ssCiudad.setValue(p.ciudad);
                            buscarFn();
                        }
                        intentosC++;
                    }, 100);
                } else {
                    buscarFn();
                }
            },

            // ── Búsqueda ──────────────────────────────────────────────────────

            buscar: function () {
                var estado  = this._ssEstado  ? this._ssEstado.getValue()  : '';
                var ciudad  = this._ssCiudad  ? this._ssCiudad.getValue()  : '';
                var tipOp   = this.$el.find('#em-filtro-tipo-operacion').val()   || null;
                var tipProp = this.$el.find('#em-filtro-tipo-propiedad').val()   || null;
                var subtipo = this.$el.find('#em-filtro-subtipo').val()          || null;
                var anios   = this._periodoSelect ? this._periodoSelect.getAniosSeleccionados() : [];
                var meses   = this._periodoSelect ? this._periodoSelect.getMesesSeleccionados() : [];

                if (!ciudad && !estado) {
                    Espo.Ui.error('Debe seleccionar al menos un estado o ciudad.');
                    return;
                }

                this._mostrarCargando();
                this._filtrosActuales = {
                    estado:           estado,
                    ciudad:           ciudad,
                    tipoOperacion:    tipOp,
                    tipoPropiedad:    tipProp,
                    subtipoPropiedad: subtipo,
                    anios:            anios,
                    meses:            meses
                };

                var params = {};
                if (estado)  params.estado           = estado;
                if (ciudad)  params.ciudad           = ciudad;
                if (tipOp)   params.tipoOperacion    = tipOp;
                if (tipProp) params.tipoPropiedad    = tipProp;
                if (subtipo) params.subtipoPropiedad = subtipo;
                if (anios.length) params.anios       = anios.join(',');
                if (meses.length) params.meses       = meses.join(',');

                console.log('[EstadisticasM2] params →', JSON.stringify(params));

                var self = this;
                Espo.Ajax.getRequest('EstadisticasMercado/action/getEstadisticasMercadoPorM2', params)
                    .then(function (resp) {
                        if (!resp.success) {
                            Espo.Ui.error('Error: ' + (resp.error || ''));
                            self._mostrarVacio('Error al cargar datos.');
                            return;
                        }
                        self._filas    = resp.filas    || [];
                        self._totales  = resp.totales  || {};
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
                if (this._ssEstado) this._ssEstado.reset();
                // Recargar todas las ciudades al limpiar estado
                this._cargarCiudadesPorEstado('');
                if (this._periodoSelect) this._periodoSelect.reset();
                this.$el.find('#em-filtro-tipo-operacion').val('');
                this.$el.find('#em-filtro-tipo-propiedad').val('');
                // Recargar subtipos con tipo vacío → todos
                this._cargarSubtipos();
                this._hayDatos        = false;
                this._filtrosActuales = null;
                this.$el.find('[data-action="exportar"]').prop('disabled', true);
                this._mostrarEstadoInicial();
            },

            // ── Render tabla ──────────────────────────────────────────────────

            _renderTabla: function () {
                var self  = this;
                var filas = this._filas;

                if (!filas.length) {
                    this._mostrarVacio('No hay datos para los filtros seleccionados.');
                    return;
                }

                var desc = this._descripcionPeriodo(this._filtrosActuales);
                var html = '';
                html += '<div class="em-info-band"><i class="fas fa-info-circle"></i>' +
                        '<span>' + desc + '</span></div>';
                html += '<div class="em-tabla-wrapper"><div class="em-tabla-scroll">';
                html += '<table class="em-tabla"><thead><tr>';
                html += '<th>Urbanización</th>';
                html += '<th>Lados</th>';
                html += '<th>Promedio de precios</th>';
                html += '<th>Promedio por m²</th>';
                html += '<th>Promedio precio / m²</th>';
                html += '</tr></thead><tbody>';

                filas.forEach(function (fila) {
                    html += '<tr>';
                    html += '<td class="clickable-row" title="Ver detalle de ' +
                            self._esc(fila.urbanizacion) + '">' +
                            self._esc(fila.urbanizacion) + '</td>';
                    html += '<td>' + (fila.lados || 0) + '</td>';
                    html += '<td>' + (fila.avg_price    !== null ? '$ ' + self._fmt(fila.avg_price)    : '-') + '</td>';
                    html += '<td>' + (fila.avg_m2       !== null ? self._fmt(fila.avg_m2) + ' m²'      : '-') + '</td>';
                    html += '<td>' + (fila.avg_price_m2 !== null ? '$ ' + self._fmt(fila.avg_price_m2) : '-') + '</td>';
                    html += '</tr>';
                });

                var t = this._totales;
                html += '</tbody><tfoot><tr>';
                html += '<td><strong>Total / Promedio</strong></td>';
                html += '<td><strong>' + (t.lados || 0) + '</strong></td>';
                html += '<td><strong>' + (t.avg_price    !== null ? '$ ' + self._fmt(t.avg_price)    : '-') + '</strong></td>';
                html += '<td><strong>' + (t.avg_m2       !== null ? self._fmt(t.avg_m2) + ' m²'      : '-') + '</strong></td>';
                html += '<td><strong>' + (t.avg_price_m2 !== null ? '$ ' + self._fmt(t.avg_price_m2) : '-') + '</strong></td>';
                html += '</tr></tfoot></table></div></div>';

                this.$el.find('#em-resultado-container').html(html);
            },

            // ── Exportar ──────────────────────────────────────────────────────

            exportar: function () {
                if (!this._hayDatos) return;
                var self    = this;
                var headers = ['Urbanización', 'Lados', 'Promedio de precios', 'Promedio por m²', 'Promedio precio / m²'];
                var filasExcel = this._filas.map(function (f) {
                    return [
                        f.urbanizacion,
                        f.lados || 0,
                        f.avg_price    !== null ? f.avg_price    : '',
                        f.avg_m2       !== null ? f.avg_m2       : '',
                        f.avg_price_m2 !== null ? f.avg_price_m2 : ''
                    ];
                });
                var t = this._totales;
                ExcelExport.exportar({
                    nombreArchivo: 'estadisticas_m2',
                    titulo:        'Informe Estadístico de Mercado por m²',
                    subtitulo:     this._descripcionPeriodo(this._filtrosActuales),
                    headers:       headers,
                    filas:         filasExcel,
                    filaTotal: [
                        'Total / Promedio',
                        t.lados || 0,
                        t.avg_price    !== null ? t.avg_price    : '',
                        t.avg_m2       !== null ? t.avg_m2       : '',
                        t.avg_price_m2 !== null ? t.avg_price_m2 : ''
                    ]
                });
            },

            // ── Helpers ───────────────────────────────────────────────────────

            _descripcionPeriodo: function (f) {
                if (!f) return '';
                var partes = [];
                if (f.estado)  partes.push('Estado: '  + f.estado);
                if (f.ciudad)  partes.push('Ciudad: '  + f.ciudad);
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
                if (f.tipoOperacion)    partes.push('Tipo Op.: '   + f.tipoOperacion);
                if (f.tipoPropiedad)    partes.push('Tipo Prop.: '  + f.tipoPropiedad);
                if (f.subtipoPropiedad) partes.push('Subtipo: '     + f.subtipoPropiedad);
                return partes.join(' | ');
            },

            _fmt: function (num) {
                if (num === null || num === undefined) return '';
                return num.toLocaleString('es-VE', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
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
                    '<p>Seleccione los parámetros y presione <strong>Buscar</strong></p>' +
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