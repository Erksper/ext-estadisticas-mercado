// estadisticas-mercado/src/views/reportes/rango-precios.js
define(
    'estadisticas-mercado:views/reportes/rango-precios',
    [
        'view',
        'estadisticas-mercado:views/modules/excel-export',
        'estadisticas-mercado:views/modules/detalle-nav'
    ],
    function (View, ExcelExport, DetalleNav) {

        return View.extend($.extend({}, DetalleNav, {

            template: 'estadisticas-mercado:reportes/rango-precios',

            _subtipoList:    [],
            _rangoList:      [],
            _filas:          [],
            _totalesPorRango:{},
            _totalGeneral:   0,
            _hayDatos:       false,
            _chartInstance:  null,
            _filtrosActuales: null,

            events: {
                'click [data-action="buscar"]':   function () { this.buscar(); },
                'click [data-action="limpiar"]':  function () { this.limpiarFiltros(); },
                'click [data-action="volver"]':   function () {
                    this.getRouter().navigate('#EstadisticasMercado', { trigger: true });
                },
                'click [data-action="exportar"]': function () { this.exportar(); },
                'change #em-filtro-cla':           function () { this._cargarOficinasPorCLA(); },
                'change #em-filtro-tipo-propiedad':function () { this._cargarSubtiposPorTipo(); },

                // Columna = rango de precio
                'click .clickable-col': function (e) {
                    var rango = $(e.currentTarget).text().trim();
                    this._irADetalle({
                        reporte:       'rangoPrecios',
                        rutaReporte:   '#EstadisticasMercado/rangoPrecios',
                        seleccion:     'columna',
                        identificador: rango,
                        titulo:        'Rango de precio: ' + rango,
                        filtros:       this._filtrosActuales
                    });
                },

                // Fila = subtipo de propiedad
                'click .clickable-row': function (e) {
                    var subtipo = $(e.currentTarget).text().trim();
                    this._irADetalle({
                        reporte:       'rangoPrecios',
                        rutaReporte:   '#EstadisticasMercado/rangoPrecios',
                        seleccion:     'fila',
                        identificador: subtipo,
                        titulo:        'Subtipo: ' + subtipo,
                        filtros:       this._filtrosActuales
                    });
                }
            },

            setup: function () {
                this._filtrosDesdeUrl = this.options.params || {};
            },

            afterRender: function () {
                this._cargarChartJS();
                this._cargarCLAs();
                this._inicializarFechas();
                this._restaurarFiltrosDesdeUrl();
            },

            _restaurarFiltrosDesdeUrl: function () {
                var p    = this._filtrosDesdeUrl;
                var self = this;
                var tieneFiltros = p && (p.claId || p.oficina || p.fechaInicio || p.fechaFin ||
                                         p.tipoOperacion || p.tipoPropiedad || p.subtipoPropiedad);
                if (!tieneFiltros) return;

                if (p.fechaInicio)    this.$el.find('#em-filtro-fecha-inicio').val(p.fechaInicio);
                if (p.fechaFin)       this.$el.find('#em-filtro-fecha-fin').val(p.fechaFin);
                if (p.tipoOperacion)  this.$el.find('#em-filtro-tipo-operacion').val(p.tipoOperacion);
                if (p.tipoPropiedad)  this.$el.find('#em-filtro-tipo-propiedad').val(p.tipoPropiedad);

                var buscarFn = function () {
                    // Subtipo: esperar si hay tipoPropiedad
                    if (p.subtipoPropiedad && p.tipoPropiedad) {
                        self._cargarSubtiposPorTipo(p.subtipoPropiedad, function () {
                            self.buscar();
                        });
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
                            self._cargarOficinasPorCLA(p.oficinaId, buscarFn);
                        }
                        intentos++;
                    }, 100);
                } else {
                    buscarFn();
                }
            },

            _cargarChartJS: function () {
                if (typeof Chart !== 'undefined') return;
                var script = document.createElement('script');
                script.src = 'client/custom/modules/estadisticas-mercado/lib/chart.umd.min.js';
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
                    });
            },

            _cargarOficinasPorCLA: function (preseleccionarId, callback) {
                var claId = this.$el.find('#em-filtro-cla').val();
                var $of   = this.$el.find('#em-filtro-oficina');
                if (!claId) {
                    $of.html('<option value="">Todas las oficinas</option>').prop('disabled', false);
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

            _cargarSubtiposPorTipo: function (preseleccionarVal, callback) {
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
                var claId    = this.$el.find('#em-filtro-cla').val()              || null;
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

                var params = {};
                if (claId)    params.claId           = claId;
                if (ofId)     params.oficinaId        = ofId;
                if (fi)       params.fechaInicio      = fi;
                if (ff)       params.fechaFin         = ff;
                if (tipoOp)   params.tipoOperacion    = tipoOp;
                if (tipoProp) params.tipoPropiedad    = tipoProp;
                if (subtipo)  params.subtipoPropiedad = subtipo;

                var self = this;
                Espo.Ajax.getRequest('EstadisticasMercado/action/getRangoPrecios', params)
                    .then(function (resp) {
                        if (!resp.success) {
                            Espo.Ui.error('Error: ' + (resp.error || ''));
                            self._mostrarVacio('Error al cargar datos.');
                            return;
                        }
                        self._subtipoList     = resp.subtipoList     || [];
                        self._rangoList       = resp.rangoList       || [];
                        self._filas           = resp.filas           || [];
                        self._totalesPorRango = resp.totalesPorRango || {};
                        self._totalGeneral    = resp.totalGeneral    || 0;
                        self._hayDatos        = true;
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
                if (this._chartInstance) { this._chartInstance.destroy(); this._chartInstance = null; }
                this._mostrarEstadoInicial();
            },

            _renderTabla: function () {
                var self       = this;
                var subtipoList= this._subtipoList;
                var rangoList  = this._rangoList;
                var filas      = this._filas;

                if (!subtipoList.length || !rangoList.length) {
                    this._mostrarVacio('No hay datos con los filtros seleccionados.');
                    return;
                }

                var desc = this._descripcionPeriodo(this._filtrosActuales);
                var html = '';
                html += '<div class="em-info-band"><i class="fas fa-info-circle"></i>' +
                        '<span>' + desc + '</span></div>';
                html += '<div class="em-tabla-wrapper"><div class="em-tabla-scroll">';
                html += '<table class="em-tabla"><thead><tr>';
                html += '<th>Subtipo de Propiedad</th>';
                rangoList.forEach(function (rango) {
                    html += '<th class="clickable-col" title="Ver detalle del rango ' +
                            self._esc(rango) + '">' + self._esc(rango) + '</th>';
                });
                html += '<th class="col-total">Total</th></tr></thead><tbody>';

                filas.forEach(function (fila) {
                    html += '<tr><td class="clickable-row" title="Ver detalle de ' +
                            self._esc(fila.subtipo) + '">' + self._esc(fila.subtipo) + '</td>';
                    rangoList.forEach(function (rango) {
                        html += '<td>' + (fila.conteos[rango] || 0) + '</td>';
                    });
                    html += '<td class="col-total">' + fila.total + '</td></tr>';
                });

                html += '</tbody><tfoot><tr><td><strong>Total</strong></td>';
                rangoList.forEach(function (rango) {
                    html += '<td><strong>' + (self._totalesPorRango[rango] || 0) + '</strong></td>';
                });
                html += '<td class="col-total"><strong>' + this._totalGeneral + '</strong></td>';
                html += '</tr></tfoot></table></div></div>';

                html += '<div class="em-grafico-container">';
                html += '<h3 style="margin-top:0;margin-bottom:16px;">' +
                        '<i class="fas fa-chart-bar"></i> Distribución por Rango de Precio</h3>';
                html += '<canvas id="em-grafico-canvas" style="width:100%;max-height:400px;"></canvas>';
                html += '</div>';

                this.$el.find('#em-resultado-container').html(html);
                var selfRef = this;
                setTimeout(function () { selfRef._renderGrafico(); }, 50);
            },

            _renderGrafico: function () {
                if (typeof Chart === 'undefined') return;
                if (this._chartInstance) this._chartInstance.destroy();
                var self     = this;
                var labels   = this._rangoList;
                var data     = labels.map(function (r) {
                    return self._totalesPorRango[r] || 0;
                });
                var ctx = document.getElementById('em-grafico-canvas');
                if (!ctx) return;
                this._chartInstance = new Chart(ctx.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{ label: 'Cantidad de propiedades', data: data,
                            backgroundColor: 'rgba(184,162,121,0.8)',
                            borderColor: '#B8A279', borderWidth: 1 }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: true, indexAxis: 'y',
                        plugins: { legend: { position: 'top' } },
                        scales: {
                            x: { title: { display: true, text: 'Cantidad de propiedades' } },
                            y: { title: { display: true, text: 'Rango de precio (USD)' } }
                        }
                    }
                });
            },

            exportar: function () {
                if (!this._hayDatos) return;
                var self    = this;
                var headers = ['Subtipo de Propiedad']
                    .concat(this._rangoList).concat(['Total']);
                var filasExcel = this._filas.map(function (fila) {
                    var row = [fila.subtipo];
                    self._rangoList.forEach(function (r) { row.push(fila.conteos[r] || 0); });
                    row.push(fila.total);
                    return row;
                });
                var totalRow = ['Total'];
                this._rangoList.forEach(function (r) {
                    totalRow.push(self._totalesPorRango[r] || 0);
                });
                totalRow.push(this._totalGeneral);

                ExcelExport.exportar({
                    nombreArchivo: 'rango_precios_' +
                                   (this._filtrosActuales.fechaInicio || '').replace(/-/g,'') + '_' +
                                   (this._filtrosActuales.fechaFin    || '').replace(/-/g,''),
                    titulo: 'Rango de Precios',
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
                if (f.fechaInicio && f.fechaFin) partes.push('Período: ' + f.fechaInicio + ' → ' + f.fechaFin);
                else if (f.fechaInicio) partes.push('Desde: ' + f.fechaInicio);
                else if (f.fechaFin)   partes.push('Hasta: ' + f.fechaFin);
                else partes.push('Todos los períodos');
                if (f.claId) {
                    var $opt = this.$el.find('#em-filtro-cla option[value="' + f.claId + '"]');
                    partes.push('CLA: ' + ($opt.length ? $opt.text() : f.claId));
                }
                if (f.oficinaId) {
                    var $optOf = this.$el.find('#em-filtro-oficina option[value="' + f.oficinaId + '"]');
                    partes.push('Oficina: ' + ($optOf.length ? $optOf.text() : f.oficinaId));
                }
                if (f.tipoOperacion)    partes.push('Tipo Op.: ' + f.tipoOperacion);
                if (f.tipoPropiedad)    partes.push('Tipo Prop.: ' + f.tipoPropiedad);
                if (f.subtipoPropiedad) partes.push('Subtipo: ' + f.subtipoPropiedad);
                return partes.join(' | ');
            },

            _esc: function (str) {
                if (!str) return '';
                return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                                  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
            }
        }));
    }
);