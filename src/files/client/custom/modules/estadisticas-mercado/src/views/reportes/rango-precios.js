// estadisticas-mercado/src/views/reportes/rango-precios.js
define(
    'estadisticas-mercado:views/reportes/rango-precios',
    [
        'view',
        'estadisticas-mercado:views/modules/excel-export',
        'estadisticas-mercado:views/modules/detalle-nav',
        'estadisticas-mercado:views/modules/periodo-select'
    ],
    function (View, ExcelExport, DetalleNav, PeriodoSelect) {

        return View.extend($.extend({}, DetalleNav, {

            template: 'estadisticas-mercado:reportes/rango-precios',

            _subtipoList:     [],
            _rangoList:       [],
            _filas:           [],
            _totalesPorRango: {},
            _totalGeneral:    0,
            _hayDatos:        false,
            _chartInstance:   null,
            _filtrosActuales: null,
            _periodoSelect:   null,

            events: {
                'click [data-action="buscar"]':    function () { this.buscar(); },
                'click [data-action="limpiar"]':   function () { this.limpiarFiltros(); },
                'click [data-action="volver"]':    function () {
                    this.getRouter().navigate('#EstadisticasMercado', { trigger: true });
                },
                'click [data-action="exportar"]':  function () { this.exportar(); },

                // Al cambiar CLA: recargar oficinas y años
                'change #em-filtro-cla': function () {
                    this._cargarOficinasPorCLA();
                    if (this._periodoSelect) this._periodoSelect.reloadAnios();
                },

                // Al cambiar tipo propiedad: recargar subtipos
                // Si tipo está vacío → carga TODOS los subtipos
                'change #em-filtro-tipo-propiedad': function () {
                    this._cargarSubtipos();
                },

                // Clic en cabecera columna (rango de precio)
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

                // Clic en primera celda de fila (subtipo de propiedad)
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
                this._iniciarPeriodoSelect();
                // Cargar todos los subtipos al inicio (tipo vacío = todos)
                this._cargarSubtipos();
                this._restaurarFiltrosDesdeUrl();
            },

            // ── PeriodoSelect ─────────────────────────────────────────────────

            _iniciarPeriodoSelect: function () {
                var self      = this;
                var container = this.$el.find('#em-periodo-container')[0];
                if (!container) return;

                this._periodoSelect = new PeriodoSelect(container, {
                    blockedMonths: [],   // Rango de precios NO excluye nov/dic
                    getAnios: function (cb) {
                        var claId = self.$el.find('#em-filtro-cla').val() || null;
                        Espo.Ajax.getRequest('EstadisticasMercado/action/getAniosDisponibles', {
                            reporte: 'rangoPrecios',
                            claId:   claId
                        }).then(function (r) {
                            cb(r.success ? (r.data || []) : []);
                        }).catch(function () { cb([]); });
                    }
                });
            },

            // ── ChartJS ───────────────────────────────────────────────────────

            _cargarChartJS: function () {
                if (typeof Chart !== 'undefined') return;
                var s = document.createElement('script');
                s.src = 'client/custom/modules/estadisticas-mercado/lib/chart.umd.min.js';
                document.head.appendChild(s);
            },

            // ── CLAs y Oficinas ───────────────────────────────────────────────

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

            // ── Subtipos (siempre habilitado) ─────────────────────────────────
            // Si tipo está vacío → devuelve TODOS los subtipos de la BD.
            // Si hay tipo seleccionado → filtra por ese tipo.

            _cargarSubtipos: function (preseleccionarVal, callback) {
                var tipo     = this.$el.find('#em-filtro-tipo-propiedad').val();
                var $subtipo = this.$el.find('#em-filtro-subtipo');

                $subtipo.html('<option value="">Cargando...</option>').prop('disabled', true);

                var self   = this;
                var params = {};
                if (tipo) params.tipoPropiedad = tipo;   // sin tipo → el backend devuelve todos

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

            // ── Restaurar desde URL ───────────────────────────────────────────

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
                            self._cargarOficinasPorCLA(p.oficinaId, buscarFn);
                        }
                        intentos++;
                    }, 100);
                } else {
                    buscarFn();
                }
            },

            // ── Búsqueda ──────────────────────────────────────────────────────

            buscar: function () {
                var claId   = this.$el.find('#em-filtro-cla').val()              || null;
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

                var params = {};
                if (claId)   params.claId            = claId;
                if (ofId)    params.oficinaId         = ofId;
                if (tipOp)   params.tipoOperacion     = tipOp;
                if (tipProp) params.tipoPropiedad     = tipProp;
                if (subtipo) params.subtipoPropiedad  = subtipo;
                if (anios.length) params.anios        = anios.join(',');
                if (meses.length) params.meses        = meses.join(',');

                console.log('[RangoPrecios] params →', JSON.stringify(params));

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

            // ── Limpiar ───────────────────────────────────────────────────────

            limpiarFiltros: function () {
                this.$el.find('#em-filtro-cla').val('');
                this.$el.find('#em-filtro-oficina')
                    .html('<option value="">Todas las oficinas</option>').prop('disabled', true);
                if (this._periodoSelect) this._periodoSelect.reset();
                this.$el.find('#em-filtro-tipo-operacion').val('');
                this.$el.find('#em-filtro-tipo-propiedad').val('');
                // Recargar subtipos con tipo vacío → todos los subtipos
                this._cargarSubtipos();
                this._hayDatos        = false;
                this._filtrosActuales = null;
                this.$el.find('[data-action="exportar"]').prop('disabled', true);
                if (this._chartInstance) { this._chartInstance.destroy(); this._chartInstance = null; }
                this._mostrarEstadoInicial();
            },

            // ── Render tabla ──────────────────────────────────────────────────

            _renderTabla: function () {
                var self      = this;
                var stList    = this._subtipoList;
                var rList     = this._rangoList;
                var filas     = this._filas;

                if (!stList.length || !rList.length) {
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

                rList.forEach(function (rango) {
                    html += '<th class="clickable-col" title="Ver detalle del rango ' +
                            self._esc(rango) + '">' + self._esc(rango) + '</th>';
                });
                html += '<th class="col-total">Total</th>';
                html += '</tr></thead><tbody>';

                filas.forEach(function (fila) {
                    html += '<tr>';
                    html += '<td class="clickable-row" title="Ver detalle de ' +
                            self._esc(fila.subtipo) + '">' + self._esc(fila.subtipo) + '</td>';
                    rList.forEach(function (rango) {
                        html += '<td>' + (fila.conteos[rango] || 0) + '</td>';
                    });
                    html += '<td class="col-total">' + fila.total + '</td>';
                    html += '</tr>';
                });

                html += '</tbody><tfoot><tr>';
                html += '<td><strong>Total</strong></td>';
                rList.forEach(function (rango) {
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

            // ── Gráfico ───────────────────────────────────────────────────────

            _renderGrafico: function () {
                if (typeof Chart === 'undefined') return;
                if (this._chartInstance) this._chartInstance.destroy();

                var self   = this;
                var labels = this._rangoList;
                var data   = labels.map(function (r) {
                    return self._totalesPorRango[r] || 0;
                });

                var ctx = document.getElementById('em-grafico-canvas');
                if (!ctx) return;

                this._chartInstance = new Chart(ctx.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Cantidad de propiedades',
                            data:  data,
                            backgroundColor: 'rgba(184,162,121,0.8)',
                            borderColor: '#B8A279',
                            borderWidth: 1
                        }]
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

            // ── Exportar ──────────────────────────────────────────────────────

            exportar: function () {
                if (!this._hayDatos) return;
                var self    = this;
                var headers = ['Subtipo de Propiedad']
                    .concat(this._rangoList)
                    .concat(['Total']);
                var filasExcel = this._filas.map(function (fila) {
                    var row = [fila.subtipo];
                    self._rangoList.forEach(function (r) { row.push(fila.conteos[r] || 0); });
                    row.push(fila.total);
                    return row;
                });
                var filaTotal = ['Total'];
                this._rangoList.forEach(function (r) {
                    filaTotal.push(self._totalesPorRango[r] || 0);
                });
                filaTotal.push(this._totalGeneral);

                ExcelExport.exportar({
                    nombreArchivo: 'rango_precios',
                    titulo:        'Rango de Precios',
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
                if (f.tipoOperacion)    partes.push('Tipo Op.: '   + f.tipoOperacion);
                if (f.tipoPropiedad)    partes.push('Tipo Prop.: '  + f.tipoPropiedad);
                if (f.subtipoPropiedad) partes.push('Subtipo: '     + f.subtipoPropiedad);
                return partes.join(' | ');
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