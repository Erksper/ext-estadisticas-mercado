// estadisticas-mercado/src/views/reportes/estadisticas-m2-cla.js
define(
    'estadisticas-mercado:views/reportes/estadisticas-m2-cla',
    [
        'view',
        'estadisticas-mercado:views/modules/excel-export',
        'estadisticas-mercado:views/modules/detalle-nav',
        'estadisticas-mercado:views/modules/periodo-select'
    ],
    function (View, ExcelExport, DetalleNav, PeriodoSelect) {

        return View.extend($.extend({}, DetalleNav, {

            template: 'estadisticas-mercado:reportes/estadisticas-m2-cla',

            _filas:           [],
            _totales:         {},
            _hayDatos:        false,
            _filtrosActuales: null,
            _periodoSelect:   null,

            // Helper para transformar etiquetas visualmente
            _transformarEtiqueta: function(texto) {
                if (!texto) return texto;
                var map = {
                    'Renta': 'Alquiler',
                    'renta': 'Alquiler',
                    'Habitacional': 'Residencial',
                    'Departamento': 'Apartamento'
                };
                return map[texto] || texto;
            },

            events: {
                'click [data-action="buscar"]':    function () { this.buscar(); },
                'click [data-action="limpiar"]':   function () { this.limpiarFiltros(); },
                'click [data-action="volver"]':    function () {
                    this.getRouter().navigate('#EstadisticasMercado', { trigger: true });
                },
                'click [data-action="exportar"]':  function () { this.exportar(); },

                'change #em-filtro-cla': function () {
                    this._cargarOficinas();
                    if (this._periodoSelect) this._periodoSelect.reloadAnios();
                },

                'change #em-filtro-tipo-propiedad': function () {
                    this._cargarSubtipos();
                },

                'click .clickable-row': function (e) {
                    var urb = $(e.currentTarget).text().trim();
                    this._irADetalle({
                        reporte:       'estadisticasM2Cla',
                        rutaReporte:   '#EstadisticasMercado/estadisticasM2Cla',
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
                this._cargarCLAs();
                this._iniciarPeriodoSelect();
                this._cargarSubtipos();
                this._restaurarFiltrosDesdeUrl();
            },

            _iniciarPeriodoSelect: function () {
                var self      = this;
                var container = this.$el.find('#em-periodo-container')[0];
                if (!container) return;

                this._periodoSelect = new PeriodoSelect(container, {
                    blockedMonths: [],
                    getAnios: function (cb) {
                        var claId = self.$el.find('#em-filtro-cla').val() || null;
                        Espo.Ajax.getRequest('EstadisticasMercado/action/getAniosDisponibles', {
                            reporte: 'estadisticasM2Cla',
                            claId:   claId
                        }).then(function (r) {
                            cb(r.success ? (r.data || []) : []);
                        }).catch(function () { cb([]); });
                    }
                });
            },

            _cargarCLAs: function () {
                var self = this;
                Espo.Ajax.getRequest('EstadisticasMercado/action/getCLAs')
                    .then(function (resp) {
                        if (!resp.success) return;
                        var $sel = self.$el.find('#em-filtro-cla');
                        $sel.empty().append('<option value="">Seleccione un CLA</option>');
                        (resp.data || []).forEach(function (c) {
                            $sel.append('<option value="' + c.id + '">' + c.name + '</option>');
                        });
                    });
            },

            _cargarOficinas: function (preseleccionarId, callback) {
                var claId = this.$el.find('#em-filtro-cla').val();
                var $of   = this.$el.find('#em-filtro-oficina');

                if (!claId) {
                    $of.html('<option value="">Todas las oficinas</option>').prop('disabled', true);
                    if (callback) callback();
                    return;
                }

                $of.prop('disabled', true).html('<option value="">Cargando...</option>');
                Espo.Ajax.getRequest('EstadisticasMercado/action/getOficinasByCLA', { claId: claId })
                    .then(function (resp) {
                        var html = '<option value="">Todas las oficinas</option>';
                        (resp.data || []).forEach(function (o) {
                            html += '<option value="' + o.id + '">' + o.name + '</option>';
                        });
                        $of.html(html).prop('disabled', false);
                        if (preseleccionarId) $of.val(preseleccionarId);
                        if (callback) callback();
                    })
                    .catch(function () {
                        $of.html('<option value="">Error</option>');
                        if (callback) callback();
                    });
            },

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
                            var textoMostrar = self._transformarEtiqueta(s);
                            html += '<option value="' + self._esc(s) + '">' + self._esc(textoMostrar) + '</option>';
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

            _restaurarFiltrosDesdeUrl: function () {
                var p    = this._filtrosDesdeUrl;
                var self = this;
                var tieneFiltros = p && (p.claId || p.anios || p.meses ||
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

                if (p.claId) {
                    var intentos = 0;
                    var esperar = setInterval(function () {
                        var $sel = self.$el.find('#em-filtro-cla');
                        if ($sel.find('option[value="' + p.claId + '"]').length || intentos > 30) {
                            clearInterval(esperar);
                            $sel.val(p.claId);
                            self._cargarOficinas(p.oficinaId, buscarFn);
                        }
                        intentos++;
                    }, 100);
                } else {
                    buscarFn();
                }
            },

            buscar: function () {
                var claId   = this.$el.find('#em-filtro-cla').val();
                if (!claId) { Espo.Ui.error('Debe seleccionar un CLA.'); return; }

                var ofId    = this.$el.find('#em-filtro-oficina').val()          || null;
                var tipOp   = this.$el.find('#em-filtro-tipo-operacion').val()   || null;
                var tipProp = this.$el.find('#em-filtro-tipo-propiedad').val()   || null;
                var subtipo = this.$el.find('#em-filtro-subtipo').val()          || null;
                var anios   = this._periodoSelect ? this._periodoSelect.getAniosSeleccionados() : [];
                var meses   = this._periodoSelect ? this._periodoSelect.getMesesSeleccionados() : [];

                this._mostrarCargando();
                this._filtrosActuales = {
                    claId:            claId,
                    oficinaId:        ofId,
                    tipoOperacion:    tipOp,
                    tipoPropiedad:    tipProp,
                    subtipoPropiedad: subtipo,
                    anios:            anios,
                    meses:            meses
                };

                var params = { claId: claId };
                if (ofId)    params.oficinaId         = ofId;
                if (tipOp)   params.tipoOperacion     = tipOp;
                if (tipProp) params.tipoPropiedad     = tipProp;
                if (subtipo) params.subtipoPropiedad  = subtipo;
                if (anios.length) params.anios        = anios.join(',');
                if (meses.length) params.meses        = meses.join(',');

                console.log('[EstadisticasM2Cla] params →', JSON.stringify(params));

                var self = this;
                Espo.Ajax.getRequest('EstadisticasMercado/action/getEstadisticasM2PorCLA', params)
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

            limpiarFiltros: function () {
                this.$el.find('#em-filtro-cla').val('');
                this.$el.find('#em-filtro-oficina')
                    .html('<option value="">Todas las oficinas</option>').prop('disabled', true);
                if (this._periodoSelect) this._periodoSelect.reset();
                this.$el.find('#em-filtro-tipo-operacion').val('');
                this.$el.find('#em-filtro-tipo-propiedad').val('');
                this._cargarSubtipos();
                this._hayDatos        = false;
                this._filtrosActuales = null;
                this.$el.find('[data-action="exportar"]').prop('disabled', true);
                this._mostrarEstadoInicial();
            },

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
                    nombreArchivo: 'estadisticas_m2_cla',
                    titulo:        'Estadísticas m² por CLA',
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

            _descripcionPeriodo: function (f) {
                if (!f) return '';
                var self = this;
                var partes = [];
                if (f.claId) {
                    var $opt = this.$el.find('#em-filtro-cla option[value="' + f.claId + '"]');
                    partes.push('CLA: ' + ($opt.length ? $opt.text() : f.claId));
                }
                if (f.oficinaId) {
                    var $optOf = this.$el.find('#em-filtro-oficina option[value="' + f.oficinaId + '"]');
                    partes.push('Oficina: ' + ($optOf.length ? $optOf.text() : f.oficinaId));
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
                if (f.tipoOperacion)    partes.push('Tipo Op.: '   + self._transformarEtiqueta(f.tipoOperacion));
                if (f.tipoPropiedad)    partes.push('Tipo Prop.: '  + self._transformarEtiqueta(f.tipoPropiedad));
                if (f.subtipoPropiedad) partes.push('Subtipo: '     + self._transformarEtiqueta(f.subtipoPropiedad));
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