// estadisticas-mercado/src/views/reportes/rango-precios.js
define(
    'estadisticas-mercado:views/reportes/rango-precios',
    [
        'view',
        'estadisticas-mercado:views/modules/excel-export'
    ],
    function (View, ExcelExport) {

        return View.extend({

            template: 'estadisticas-mercado:reportes/rango-precios',

            _subtipoList: [],
            _rangoList: [],
            _filas: [],
            _totalesPorRango: {},
            _totalGeneral: 0,
            _hayDatos: false,
            _chartInstance: null,

            events: {
                'click [data-action="buscar"]':   function () { this.buscar(); },
                'click [data-action="limpiar"]':  function () { this.limpiarFiltros(); },
                'click [data-action="volver"]':   function () {
                    this.getRouter().navigate('#EstadisticasMercado', { trigger: true });
                },
                'click [data-action="exportar"]': function () { this.exportar(); },
                'change #em-filtro-cla': function () { this._cargarOficinasPorCLA(); },
                'change #em-filtro-tipo-propiedad': function () { this._cargarSubtiposPorTipo(); }
            },

            setup: function () {
                this._cargandoCLAs = true;
            },

            afterRender: function () {
                this._cargarChartJS();
                this._cargarCLAs();
                this._inicializarFechas();
            },

            // ── Carga dinámica de Chart.js ──────────────────────────────
            _cargarChartJS: function () {
                var self = this;
                if (typeof Chart !== 'undefined') {
                    return;
                }
                var script = document.createElement('script');
                script.src = 'client/custom/modules/estadisticas-mercado/lib/chart.umd.min.js';
                script.onload = function () { /* ok */ };
                script.onerror = function () {
                    console.warn('No se pudo cargar Chart.js');
                };
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
                    })
                    .catch(function () {
                        Espo.Ui.error('Error al cargar los CLAs.');
                    });
            },

            _cargarOficinasPorCLA: function () {
                var claId = this.$el.find('#em-filtro-cla').val();
                var $oficinaSelect = this.$el.find('#em-filtro-oficina');
                if (!claId) {
                    $oficinaSelect.html('<option value="">Todas las oficinas</option>');
                    $oficinaSelect.prop('disabled', false);
                    return;
                }
                $oficinaSelect.prop('disabled', true).html('<option value="">Cargando...</option>');
                var self = this;
                Espo.Ajax.getRequest('EstadisticasMercado/action/getOficinasByCLA', { claId: claId })
                    .then(function (resp) {
                        if (!resp.success) {
                            $oficinaSelect.html('<option value="">Error al cargar</option>');
                            return;
                        }
                        var html = '<option value="">Todas las oficinas</option>';
                        (resp.data || []).forEach(function (of) {
                            html += '<option value="' + of.id + '">' + of.name + '</option>';
                        });
                        $oficinaSelect.html(html);
                        $oficinaSelect.prop('disabled', false);
                    })
                    .catch(function () {
                        $oficinaSelect.html('<option value="">Error</option>');
                    });
            },

            _cargarSubtiposPorTipo: function () {
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
                var claId = this.$el.find('#em-filtro-cla').val() || null;
                var oficinaId = this.$el.find('#em-filtro-oficina').val() || null;
                var fechaInicio = this.$el.find('#em-filtro-fecha-inicio').val() || null;
                var fechaFin = this.$el.find('#em-filtro-fecha-fin').val() || null;
                var tipoOperacion = this.$el.find('#em-filtro-tipo-operacion').val() || null;
                var tipoPropiedad = this.$el.find('#em-filtro-tipo-propiedad').val() || null;
                var subtipoPropiedad = this.$el.find('#em-filtro-subtipo').val() || null;

                if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
                    Espo.Ui.error('La fecha de inicio no puede ser mayor a la fecha fin.');
                    return;
                }

                this._mostrarCargando();

                var params = {};
                if (claId) params.claId = claId;
                if (oficinaId) params.oficinaId = oficinaId;
                if (fechaInicio) params.fechaInicio = fechaInicio;
                if (fechaFin) params.fechaFin = fechaFin;
                if (tipoOperacion) params.tipoOperacion = tipoOperacion;
                if (tipoPropiedad) params.tipoPropiedad = tipoPropiedad;
                if (subtipoPropiedad) params.subtipoPropiedad = subtipoPropiedad;

                var self = this;
                Espo.Ajax.getRequest('EstadisticasMercado/action/getRangoPrecios', params)
                    .then(function (resp) {
                        if (!resp.success) {
                            Espo.Ui.error('Error al obtener datos: ' + (resp.error || ''));
                            self._mostrarVacio('Error al cargar datos del servidor.');
                            return;
                        }
                        self._subtipoList = resp.subtipoList || [];
                        self._rangoList = resp.rangoList || [];
                        self._filas = resp.filas || [];
                        self._totalesPorRango = resp.totalesPorRango || {};
                        self._totalGeneral = resp.totalGeneral || 0;
                        self._hayDatos = true;

                        self._renderTabla(claId, oficinaId, fechaInicio, fechaFin, tipoOperacion, tipoPropiedad, subtipoPropiedad);
                        self.$el.find('[data-action="exportar"]').prop('disabled', false);
                    })
                    .catch(function () {
                        Espo.Ui.error('Error de conexión al obtener el reporte.');
                        self._mostrarVacio('Error de conexión.');
                    });
            },

            limpiarFiltros: function () {
                this.$el.find('#em-filtro-cla').val('');
                this.$el.find('#em-filtro-oficina').html('<option value="">Todas las oficinas</option>').prop('disabled', true);
                this._inicializarFechas();
                this.$el.find('#em-filtro-tipo-operacion').val('');
                this.$el.find('#em-filtro-tipo-propiedad').val('');
                var $subtipo = this.$el.find('#em-filtro-subtipo');
                $subtipo.html('<option value="">Todos</option>');
                $subtipo.prop('disabled', true);
                this._hayDatos = false;
                this.$el.find('[data-action="exportar"]').prop('disabled', true);
                if (this._chartInstance) {
                    this._chartInstance.destroy();
                    this._chartInstance = null;
                }
                this._mostrarEstadoInicial();
            },

            _renderTabla: function (claId, oficinaId, fechaInicio, fechaFin, tipoOperacion, tipoPropiedad, subtipoPropiedad) {
                var self = this;
                var subtipoList = this._subtipoList;
                var rangoList = this._rangoList;
                var filas = this._filas;

                if (!subtipoList.length || !rangoList.length) {
                    this._mostrarVacio('No hay datos con los filtros seleccionados.');
                    return;
                }

                var desc = this._descripcionPeriodo(claId, oficinaId, fechaInicio, fechaFin, tipoOperacion, tipoPropiedad, subtipoPropiedad);

                var html = '';

                html += '<div class="em-info-band"><i class="fas fa-info-circle"></i><span>' + desc + '</span></div>';

                html += '<div class="em-tabla-wrapper"><div class="em-tabla-scroll">';
                html += '<table class="em-tabla">';

                // Encabezados
                html += '<thead>';
                html += '<tr><th>Subtipo de Propiedad</th>';
                rangoList.forEach(function (rango) {
                    html += '<th>' + self._escapeHtml(rango) + '</th>';
                });
                html += '<th class="col-total">Total</th>';
                html += '</tr></thead>';

                // Cuerpo
                html += '<tbody>';
                filas.forEach(function (fila) {
                    html += '<tr>';
                    html += '<td>' + self._escapeHtml(fila.subtipo) + '</td>';
                    rangoList.forEach(function (rango) {
                        var n = fila.conteos[rango] || 0;
                        html += '<td>' + n + '</td>';
                    });
                    html += '<td class="col-total">' + fila.total + '</td>';
                    html += '</tr>';
                });
                html += '</tbody>';

                // Pie
                html += '<tfoot>';
                html += '<tr><td><strong>Total</strong></td>';
                rangoList.forEach(function (rango) {
                    var n = self._totalesPorRango[rango] || 0;
                    html += '<td><strong>' + n + '</strong></td>';
                });
                html += '<td class="col-total"><strong>' + this._totalGeneral + '</strong></td>';
                html += '</tr></tfoot>';

                html += '</table></div></div>';

                // Contenedor del gráfico
                html += '<div class="em-grafico-container">';
                html += '<h3 style="margin-top:0;margin-bottom:16px;"><i class="fas fa-chart-bar"></i> Distribución por Rango de Precio</h3>';
                html += '<canvas id="em-grafico-canvas" style="width:100%; max-height:400px;"></canvas>';
                html += '</div>';

                this.$el.find('#em-resultado-container').html(html);

                // Dibujar gráfico después de que el canvas esté en el DOM
                setTimeout(function () {
                    self._renderGrafico();
                }, 50);
            },

            _renderGrafico: function () {
                if (typeof Chart === 'undefined') {
                    console.warn('Chart.js no disponible');
                    this.$el.find('.em-grafico-container').html(
                        '<div class="em-info-band"><i class="fas fa-chart-bar"></i> Gráfico no disponible (falta librería Chart.js)</div>'
                    );
                    return;
                }

                if (this._chartInstance) {
                    this._chartInstance.destroy();
                }

                var rangoList = this._rangoList;
                var totales = rangoList.map(function (rango) {
                    return this._totalesPorRango[rango] || 0;
                }.bind(this));

                // Filtrar rangos con valor > 0 para mejor visualización (opcional)
                var labels = rangoList;
                var data = totales;

                var ctx = document.getElementById('em-grafico-canvas');
                if (!ctx) return;
                ctx = ctx.getContext('2d');

                this._chartInstance = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Cantidad de propiedades',
                            data: data,
                            backgroundColor: 'rgba(184, 162, 121, 0.8)',
                            borderColor: '#B8A279',
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        indexAxis: 'y', // barras horizontales
                        plugins: {
                            legend: { position: 'top' },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        return context.dataset.label + ': ' + context.raw;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                title: { display: true, text: 'Cantidad de propiedades' },
                                beginAtZero: true
                            },
                            y: {
                                title: { display: true, text: 'Rango de precio (USD)' }
                            }
                        }
                    }
                });
            },

            exportar: function () {
                if (!this._hayDatos) return;

                var headers = ['Subtipo de Propiedad'].concat(this._rangoList).concat(['Total']);
                var filasExcel = this._filas.map(function (fila) {
                    var row = [fila.subtipo];
                    this._rangoList.forEach(function (rango) {
                        row.push(fila.conteos[rango] || 0);
                    });
                    row.push(fila.total);
                    return row;
                }.bind(this));

                var totalRow = ['Total'];
                this._rangoList.forEach(function (rango) {
                    totalRow.push(this._totalesPorRango[rango] || 0);
                }.bind(this));
                totalRow.push(this._totalGeneral);

                var claId = this.$el.find('#em-filtro-cla').val() || null;
                var oficinaId = this.$el.find('#em-filtro-oficina').val() || null;
                var fechaInicio = this.$el.find('#em-filtro-fecha-inicio').val() || null;
                var fechaFin = this.$el.find('#em-filtro-fecha-fin').val() || null;
                var tipoOperacion = this.$el.find('#em-filtro-tipo-operacion').val() || null;
                var tipoPropiedad = this.$el.find('#em-filtro-tipo-propiedad').val() || null;
                var subtipoPropiedad = this.$el.find('#em-filtro-subtipo').val() || null;

                ExcelExport.exportar({
                    nombreArchivo: 'rango_precios_' + (fechaInicio ? fechaInicio.replace(/-/g, '') : '') + '_' + (fechaFin ? fechaFin.replace(/-/g, '') : ''),
                    titulo: 'Rango de Precios',
                    subtitulo: this._descripcionPeriodo(claId, oficinaId, fechaInicio, fechaFin, tipoOperacion, tipoPropiedad, subtipoPropiedad),
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

            _descripcionPeriodo: function (claId, oficinaId, fechaInicio, fechaFin, tipoOperacion, tipoPropiedad, subtipoPropiedad) {
                var partes = [];
                if (fechaInicio && fechaFin) partes.push('Período: ' + fechaInicio + ' → ' + fechaFin);
                else if (fechaInicio) partes.push('Desde: ' + fechaInicio);
                else if (fechaFin) partes.push('Hasta: ' + fechaFin);
                else partes.push('Todos los períodos');

                if (claId) {
                    var $opt = this.$el.find('#em-filtro-cla option[value="' + claId + '"]');
                    var nombreCla = $opt.length ? $opt.text() : claId;
                    partes.push('CLA: ' + nombreCla);
                }
                if (oficinaId) {
                    var $optOf = this.$el.find('#em-filtro-oficina option[value="' + oficinaId + '"]');
                    var nombreOf = $optOf.length ? $optOf.text() : oficinaId;
                    partes.push('Oficina: ' + nombreOf);
                }
                if (tipoOperacion) partes.push('Tipo Operación: ' + tipoOperacion);
                if (tipoPropiedad) partes.push('Tipo Propiedad: ' + tipoPropiedad);
                if (subtipoPropiedad) partes.push('Subtipo: ' + subtipoPropiedad);

                return partes.join(' | ');
            },

            _escapeHtml: function (str) {
                if (!str) return '';
                return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            }

        });
    }
);