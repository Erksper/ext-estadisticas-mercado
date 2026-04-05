// estadisticas-mercado/src/views/reportes/estadisticas-m2-cla.js
// Solo filas clickeables (por urbanización), sin columnas clickeables.
define(
    'estadisticas-mercado:views/reportes/estadisticas-m2-cla',
    [
        'view',
        'estadisticas-mercado:views/modules/excel-export',
        'estadisticas-mercado:views/modules/detalle-nav'
    ],
    function (View, ExcelExport, DetalleNav) {

        return View.extend($.extend({}, DetalleNav, {

            template: 'estadisticas-mercado:reportes/estadisticas-m2-cla',

            _urbanizaciones: [],
            _filas:          [],
            _totales:        {},
            _hayDatos:       false,
            _filtrosActuales: null,

            events: {
                'click [data-action="buscar"]':   function () { this.buscar(); },
                'click [data-action="limpiar"]':  function () { this.limpiarFiltros(); },
                'click [data-action="volver"]':   function () {
                    this.getRouter().navigate('#EstadisticasMercado', { trigger: true });
                },
                'click [data-action="exportar"]': function () { this.exportar(); },
                'change #em-filtro-cla':           function () { this._cargarOficinas(); },
                'change #em-filtro-tipo-propiedad':function () { this._cargarSubtipos(); },

                // Solo filas clickeables (por urbanización)
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
                this._inicializarFechas();
                this._restaurarFiltrosDesdeUrl();
            },

            _restaurarFiltrosDesdeUrl: function () {
                var p    = this._filtrosDesdeUrl;
                var self = this;
                var tieneFiltros = p && (p.claId || p.fechaInicio || p.fechaFin ||
                                         p.tipoOperacion || p.tipoPropiedad);
                if (!tieneFiltros) return;

                if (p.fechaInicio)   this.$el.find('#em-filtro-fecha-inicio').val(p.fechaInicio);
                if (p.fechaFin)      this.$el.find('#em-filtro-fecha-fin').val(p.fechaFin);
                if (p.tipoOperacion) this.$el.find('#em-filtro-tipo-operacion').val(p.tipoOperacion);
                if (p.tipoPropiedad) this.$el.find('#em-filtro-tipo-propiedad').val(p.tipoPropiedad);

                var buscarFn = function () {
                    if (p.subtipoPropiedad && p.tipoPropiedad) {
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
                        (resp.data || []).forEach(function (of) {
                            html += '<option value="' + of.id + '">' + of.name + '</option>';
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
                var tipo    = this.$el.find('#em-filtro-tipo-propiedad').val();
                var $subtipo= this.$el.find('#em-filtro-subtipo');
                if (!tipo) {
                    $subtipo.html('<option value="">Todos</option>').prop('disabled', true);
                    if (callback) callback();
                    return;
                }
                $subtipo.prop('disabled', true).html('<option value="">Cargando...</option>');
                var self = this;
                Espo.Ajax.getRequest('EstadisticasMercado/action/getSubtiposPorTipo',
                                     { tipoPropiedad: tipo })
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
                        $subtipo.html('<option value="">Error</option>');
                        if (callback) callback();
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
                var claId    = this.$el.find('#em-filtro-cla').val();
                if (!claId) { Espo.Ui.error('Debe seleccionar un CLA.'); return; }

                var ofId     = this.$el.find('#em-filtro-oficina').val()          || null;
                var fi       = this.$el.find('#em-filtro-fecha-inicio').val()     || null;
                var ff       = this.$el.find('#em-filtro-fecha-fin').val()        || null;
                var tipoOp   = this.$el.find('#em-filtro-tipo-operacion').val()   || null;
                var tipoProp = this.$el.find('#em-filtro-tipo-propiedad').val()   || null;
                var subtipo  = this.$el.find('#em-filtro-subtipo').val()          || null;

                if (fi && ff && fi > ff) {
                    Espo.Ui.error('La fecha de inicio no puede ser mayor a la fecha fin.');
                    return;
                }

                this._mostrarCargando();
                this._filtrosActuales = {
                    claId: claId, oficinaId: ofId,
                    fechaInicio: fi, fechaFin: ff,
                    tipoOperacion: tipoOp, tipoPropiedad: tipoProp,
                    subtipoPropiedad: subtipo
                };

                var params = { claId: claId };
                if (ofId)     params.oficinaId        = ofId;
                if (fi)       params.fechaInicio      = fi;
                if (ff)       params.fechaFin         = ff;
                if (tipoOp)   params.tipoOperacion    = tipoOp;
                if (tipoProp) params.tipoPropiedad    = tipoProp;
                if (subtipo)  params.subtipoPropiedad = subtipo;

                var self = this;
                Espo.Ajax.getRequest('EstadisticasMercado/action/getEstadisticasM2PorCLA', params)
                    .then(function (resp) {
                        if (!resp.success) {
                            Espo.Ui.error('Error: ' + (resp.error || ''));
                            self._mostrarVacio('Error al cargar datos.');
                            return;
                        }
                        self._urbanizaciones = resp.urbanizaciones || [];
                        self._filas          = resp.filas          || [];
                        self._totales        = resp.totales        || {};
                        self._hayDatos       = true;
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
                this._inicializarFechas();
                this.$el.find('#em-filtro-tipo-operacion').val('');
                this.$el.find('#em-filtro-tipo-propiedad').val('');
                this.$el.find('#em-filtro-subtipo')
                    .html('<option value="">Todos</option>').prop('disabled', true);
                this._hayDatos = false;
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

                var f    = this._filtrosActuales;
                var desc = this._descripcionPeriodo(f);

                var html = '';
                html += '<div class="em-info-band"><i class="fas fa-info-circle"></i>' +
                        '<span>' + desc + '</span></div>';
                html += '<div class="em-tabla-wrapper"><div class="em-tabla-scroll">';
                html += '<table class="em-tabla"><thead><tr>';
                html += '<th>Urbanización</th><th>Lados</th>';
                html += '<th>Promedio de precios</th><th>Promedio por m²</th>';
                html += '<th>Promedio precio / m²</th>';
                html += '</tr></thead><tbody>';

                filas.forEach(function (fila) {
                    html += '<tr><td class="clickable-row" title="Ver detalle de ' +
                            self._esc(fila.urbanizacion) + '">' +
                            self._esc(fila.urbanizacion) + '</td>';
                    html += '<td>' + (fila.lados || 0) + '</td>';
                    html += '<td>' + (fila.avg_price !== null ? '$ ' + self._fmt(fila.avg_price) : '-') + '</td>';
                    html += '<td>' + (fila.avg_m2    !== null ? self._fmt(fila.avg_m2) + ' m²'  : '-') + '</td>';
                    html += '<td>' + (fila.avg_price_m2 !== null ? '$ ' + self._fmt(fila.avg_price_m2) : '-') + '</td>';
                    html += '</tr>';
                });

                var t = this._totales;
                html += '</tbody><tfoot><tr>';
                html += '<td><strong>Total / Promedio</strong></td>';
                html += '<td><strong>' + (t.lados || 0) + '</strong></td>';
                html += '<td><strong>' + (t.avg_price   !== null ? '$ ' + self._fmt(t.avg_price)   : '-') + '</strong></td>';
                html += '<td><strong>' + (t.avg_m2      !== null ? self._fmt(t.avg_m2) + ' m²'     : '-') + '</strong></td>';
                html += '<td><strong>' + (t.avg_price_m2!== null ? '$ ' + self._fmt(t.avg_price_m2): '-') + '</strong></td>';
                html += '</tr></tfoot></table></div></div>';

                this.$el.find('#em-resultado-container').html(html);
            },

            exportar: function () {
                if (!this._hayDatos) return;
                var self    = this;
                var headers = ['Urbanización','Lados','Promedio de precios','Promedio por m²','Promedio precio / m²'];
                var filasExcel = this._filas.map(function (f) {
                    return [f.urbanizacion, f.lados || 0,
                            f.avg_price !== null ? f.avg_price : '',
                            f.avg_m2    !== null ? f.avg_m2    : '',
                            f.avg_price_m2 !== null ? f.avg_price_m2 : ''];
                });
                var t = this._totales;
                var totalRow = ['Total / Promedio', t.lados || 0,
                                t.avg_price    !== null ? t.avg_price    : '',
                                t.avg_m2       !== null ? t.avg_m2       : '',
                                t.avg_price_m2 !== null ? t.avg_price_m2 : ''];
                ExcelExport.exportar({
                    nombreArchivo: 'estadisticas_m2_cla_' +
                                   (this._filtrosActuales.claId || '') + '_' +
                                   (this._filtrosActuales.fechaInicio || ''),
                    titulo: 'Estadísticas m² por CLA',
                    subtitulo: this._descripcionPeriodo(this._filtrosActuales),
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

            _descripcionPeriodo: function (f) {
                var partes = [];
                if (!f) return '';
                if (f.claId) {
                    var $opt = this.$el.find('#em-filtro-cla option[value="' + f.claId + '"]');
                    partes.push('CLA: ' + ($opt.length ? $opt.text() : f.claId));
                }
                if (f.oficinaId) {
                    var $optOf = this.$el.find('#em-filtro-oficina option[value="' + f.oficinaId + '"]');
                    partes.push('Oficina: ' + ($optOf.length ? $optOf.text() : f.oficinaId));
                }
                if (f.fechaInicio && f.fechaFin) partes.push('Período: ' + f.fechaInicio + ' → ' + f.fechaFin);
                else if (f.fechaInicio) partes.push('Desde: ' + f.fechaInicio);
                else if (f.fechaFin)   partes.push('Hasta: ' + f.fechaFin);
                if (f.tipoOperacion)    partes.push('Tipo Op.: ' + f.tipoOperacion);
                if (f.tipoPropiedad)    partes.push('Tipo Prop.: ' + f.tipoPropiedad);
                if (f.subtipoPropiedad) partes.push('Subtipo: ' + f.subtipoPropiedad);
                return partes.join(' | ');
            },

            _fmt: function (num) {
                if (num === null || num === undefined) return '';
                return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            },
            _esc: function (str) {
                if (!str) return '';
                return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                                  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
            }
        }));
    }
);