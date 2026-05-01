// estadisticas-mercado/src/views/reportes/propiedades-detalle.js
define(
    'estadisticas-mercado:views/reportes/propiedades-detalle',
    ['view', 'estadisticas-mercado:views/modules/excel-export'],
    function (View, ExcelExport) {

        return View.extend({

            template: 'estadisticas-mercado:reportes/propiedades-detalle',

            _params:         null,
            _titulo:         '',
            _retornoUrl:     null,
            _pagina:         1,
            _porPagina:      25,
            _total:          0,
            _data:           [],
            _cargando:       false,
            _cargandoTodos:  false,
            _seleccionados:  {},

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
                'click [data-action="volver"]': function () {
                    this.getRouter().navigate(
                        this._retornoUrl || '#EstadisticasMercado',
                        { trigger: true }
                    );
                },
                'click [data-action="exportar"]': function () {
                    this._exportar();
                },
                'change #chk-todos': function (e) {
                    this._toggleTodosEnPagina($(e.currentTarget).prop('checked'));
                },
                'click [data-action="seleccionar-todos"]': function () {
                    this._seleccionarTodosDelServidor();
                },
                'change .chk-fila': function (e) {
                    var $chk   = $(e.currentTarget);
                    var ladoId = String($chk.data('lado-id'));
                    var idx    = parseInt($chk.data('idx'), 10);
                    if ($chk.prop('checked')) {
                        this._seleccionados[ladoId] = this._data[idx];
                    } else {
                        delete this._seleccionados[ladoId];
                    }
                    this._actualizarBarraSeleccion();
                    this._sincronizarChkPagina();
                },
                'click .pag-btn': function (e) {
                    var p = parseInt($(e.currentTarget).data('pagina'), 10);
                    if (!isNaN(p)) this._irAPagina(p);
                },
                'click [data-action="limpiar-seleccion"]': function () {
                    this._seleccionados = {};
                    this._renderTabla();
                }
            },

            setup: function () {
                var raw = this.options.params || {};

                this._titulo     = raw.titulo  ? decodeURIComponent(raw.titulo)  : 'Detalle';
                this._retornoUrl = raw.retorno ? decodeURIComponent(raw.retorno) : null;
                this._pagina     = raw.pagina  ? parseInt(raw.pagina, 10) : 1;

                this._params = {
                    reporte:          raw.reporte          || '',
                    seleccion:        raw.seleccion        || '',
                    identificador:    raw.identificador
                                        ? decodeURIComponent(raw.identificador) : '',
                    claId:            raw.claId            || null,
                    oficinaId:        raw.oficinaId        || null,
                    asesorId:         raw.asesorId         || null,
                    anios:            raw.anios            || null,
                    meses:            raw.meses            || null,
                    tipoOperacion:    raw.tipoOperacion    || null,
                    tipoPropiedad:    raw.tipoPropiedad    || null,
                    subtipoPropiedad: raw.subtipoPropiedad || null,
                    ciudad:           raw.ciudad           || null,
                    estado:           raw.estado           || null
                };

                this._seleccionados = {};
                this._cargandoTodos = false;
            },

            afterRender: function () {
                this.$el.find('#detalle-subtitulo').text(this._titulo);
                this._cargarPagina();
            },

            _cargarPagina: function () {
                if (this._cargando) return;
                this._cargando = true;

                this.$el.find('#detalle-container').html(
                    '<div class="em-empty">' +
                    '<div class="em-spinner" style="margin-bottom:16px;"></div>' +
                    '<h4>Cargando propiedades...</h4>' +
                    '</div>'
                );

                var queryParams = $.extend({}, this._params, {
                    pagina:    this._pagina,
                    porPagina: this._porPagina
                });
                Object.keys(queryParams).forEach(function (k) {
                    if (queryParams[k] === null || queryParams[k] === undefined || queryParams[k] === '') {
                        delete queryParams[k];
                    }
                });

                var self = this;
                Espo.Ajax.getRequest('EstadisticasMercado/action/getDetalleLados', queryParams)
                    .then(function (resp) {
                        self._cargando = false;
                        if (!resp.success) {
                            Espo.Ui.error(resp.error || 'Error al cargar el detalle.');
                            self._mostrarVacio('Error al cargar datos del servidor.');
                            return;
                        }

                        if (resp._debug) {
                            console.log('[DetalleLados] _debug:', JSON.stringify(resp._debug, null, 2));
                        }

                        self._data      = resp.data      || [];
                        self._total     = resp.total     || 0;
                        self._pagina    = resp.pagina    || self._pagina;
                        self._porPagina = resp.porPagina || self._porPagina;
                        self._renderTabla();
                    })
                    .catch(function () {
                        self._cargando = false;
                        Espo.Ui.error('Error de conexión al cargar el detalle.');
                        self._mostrarVacio('Error de conexión.');
                    });
            },

            _irAPagina: function (pagina) {
                var totalPaginas = Math.ceil(this._total / this._porPagina);
                if (pagina < 1 || pagina > totalPaginas || this._cargando) return;
                this._pagina = pagina;
                this._cargarPagina();
            },

            _seleccionarTodosDelServidor: function () {
                if (this._cargandoTodos) return;
                this._cargandoTodos = true;

                var self      = this;
                var totalPags = Math.ceil(this._total / this._porPagina);
                var promises  = [];

                this.$el.find('[data-action="seleccionar-todos"]')
                    .prop('disabled', true)
                    .html('<i class="fas fa-spinner fa-spin"></i> Cargando...');

                var baseParams = $.extend({}, this._params);
                Object.keys(baseParams).forEach(function (k) {
                    if (baseParams[k] === null || baseParams[k] === undefined || baseParams[k] === '') {
                        delete baseParams[k];
                    }
                });

                for (var p = 1; p <= totalPags; p++) {
                    var qp = $.extend({}, baseParams, {
                        pagina:    p,
                        porPagina: this._porPagina
                    });
                    promises.push(Espo.Ajax.getRequest('EstadisticasMercado/action/getDetalleLados', qp));
                }

                Promise.all(promises)
                    .then(function (resultados) {
                        self._cargandoTodos = false;
                        resultados.forEach(function (resp) {
                            if (resp.success && resp.data) {
                                resp.data.forEach(function (fila) {
                                    self._seleccionados[String(fila.lado_id)] = fila;
                                });
                            }
                        });
                        self._renderTabla();
                        Espo.Ui.success('Se seleccionaron ' +
                            Object.keys(self._seleccionados).length + ' registros.');
                    })
                    .catch(function () {
                        self._cargandoTodos = false;
                        Espo.Ui.error('Error al cargar todos los registros.');
                        self.$el.find('[data-action="seleccionar-todos"]')
                            .prop('disabled', false)
                            .html('<i class="fas fa-check-double"></i> Seleccionar todos (' +
                                  self._total + ')');
                    });
            },

            _renderTabla: function () {
                var self      = this;
                var container = this.$el.find('#detalle-container');

                if (!this._data.length) {
                    this._mostrarVacio('No se encontraron propiedades para esta selección.');
                    return;
                }

                var offsetFila    = (this._pagina - 1) * this._porPagina + 1;
                var numSel        = Object.keys(this._seleccionados).length;
                var todosMarcados = numSel >= this._total && this._total > 0;

                // Barra de selección
                var html = '';
                html += '<div id="barra-seleccion" style="' +
                        'display:flex;align-items:center;gap:12px;flex-wrap:wrap;' +
                        'background:#fff;border:1px solid #E6E6E6;' +
                        'border-left:4px solid #B8A279;border-radius:8px;' +
                        'padding:10px 16px;margin-bottom:14px;font-size:13px;color:#363438;">';

                html += '<label style="display:flex;align-items:center;gap:6px;' +
                        'font-weight:600;cursor:pointer;user-select:none;margin:0;">' +
                        '<input type="checkbox" id="chk-todos" ' +
                        'style="width:16px;height:16px;cursor:pointer;" ' +
                        (this._todosEnPaginaSeleccionados() ? 'checked' : '') +
                        '> Selec. página</label>';

                html += '<span style="color:#ddd;">|</span>';

                if (!todosMarcados) {
                    html += '<button data-action="seleccionar-todos" class="em-btn em-btn-primary" ' +
                            'style="padding:5px 12px;font-size:12px;"' +
                            (this._cargandoTodos ? ' disabled' : '') + '>' +
                            (this._cargandoTodos
                                ? '<i class="fas fa-spinner fa-spin"></i> Cargando...'
                                : '<i class="fas fa-check-double"></i> Seleccionar todos (' +
                                  this._total + ')') +
                            '</button>';
                } else {
                    html += '<span style="color:#27ae60;font-weight:600;font-size:12px;">' +
                            '<i class="fas fa-check-circle"></i> Todos seleccionados</span>';
                }

                html += '<span id="contador-sel" style="color:#B8A279;font-weight:700;">' +
                        (numSel > 0
                            ? numSel + ' seleccionado' + (numSel !== 1 ? 's' : '')
                            : 'Ninguno seleccionado') +
                        '</span>';

                if (numSel > 0) {
                    html += '<button data-action="limpiar-seleccion" class="em-btn em-btn-secondary" ' +
                            'style="padding:5px 12px;font-size:12px;">' +
                            '<i class="fas fa-times"></i> Limpiar</button>';
                    html += '<span style="color:#666;font-size:12px;">' +
                            '— Exportará los ' + numSel +
                            ' seleccionado' + (numSel !== 1 ? 's' : '') + '</span>';
                } else {
                    html += '<span style="color:#666;font-size:12px;">' +
                            '— Sin selección: exporta la página actual</span>';
                }

                html += '</div>';

                // Tabla
                html += '<div class="em-tabla-wrapper"><div class="em-tabla-scroll">';
                html += '<table class="em-tabla"><thead><tr>';
                html += '<th style="width:44px;text-align:center;">#</th>';
                html += '<th style="width:36px;text-align:center;">' +
                        '<i class="fas fa-check-square"></i></th>';
                html += '<th>ID Propiedad</th>';
                html += '<th>Dirección</th>';
                html += '<th>Tipo de Lado</th>';
                html += '<th>Tipo Operación</th>';
                html += '<th>Oficina</th>';
                html += '<th>Asesor</th>';
                html += '<th>Tipo Propiedad</th>';
                html += '<th>Subtipo</th>';
                html += '<th>Fecha Cierre</th>';
                html += '<th>Precio Inicial</th>';
                html += '<th>Precio Cierre</th>';
                html += '<th>Área m²</th>';
                html += '<th>Precio / m²</th>';
                html += '</tr></thead><tbody>';

                for (var i = 0; i < this._data.length; i++) {
                    var r         = this._data[i];
                    var ladoId    = String(r.lado_id);
                    var estaSelec = !!self._seleccionados[ladoId];

                    html += '<tr' + (estaSelec
                            ? ' style="background:rgba(184,162,121,0.12);"' : '') + '>';
                    html += '<td style="text-align:center;font-weight:600;' +
                            'color:#999;font-size:12px;">' + (offsetFila + i) + '</td>';
                    html += '<td style="text-align:center;">' +
                            '<input type="checkbox" class="chk-fila" ' +
                            'data-lado-id="' + self._esc(ladoId) + '" ' +
                            'data-idx="' + i + '" ' +
                            'style="width:15px;height:15px;cursor:pointer;" ' +
                            (estaSelec ? 'checked' : '') + '></td>';
                    html += '<td>' + self._esc(r.propiedad_id)       + '</td>';
                    html += '<td>' + self._esc(r.direccion)          + '</td>';
                    html += '<td>' + self._esc(r.tipo_lado)          + '</td>';
                    html += '<td>' + self._esc(self._transformarEtiqueta(r.tipo_operacion))     + '</td>';
                    html += '<td>' + self._esc(r.oficina_nombre)     + '</td>';
                    html += '<td>' + self._esc(r.asesor_nombre)      + '</td>';
                    html += '<td>' + self._esc(self._transformarEtiqueta(r.tipo_propiedad))     + '</td>';
                    html += '<td>' + self._esc(self._transformarEtiqueta(r.sub_tipo_propiedad)) + '</td>';
                    html += '<td>' + self._esc(r.fecha_cierre || '-') + '</td>';
                    html += '<td>' + self._precio(r.precio_inicial)  + '</td>';
                    html += '<td>' + self._precio(r.precio_cierre)   + '</td>';
                    html += '<td>' + self._m2(r.area_construccion)   + '</td>';
                    html += '<td>' + self._precio(r.precio_por_m2)   + '</td>';
                    html += '</tr>';
                }

                html += '</tbody></table></div></div>';
                html += this._renderPaginacion();

                container.html(html);
                this.$el.find('[data-action="exportar"]').prop('disabled', false);
            },

            _todosEnPaginaSeleccionados: function () {
                if (!this._data.length) return false;
                return this._data.every(function (r) {
                    return !!this._seleccionados[String(r.lado_id)];
                }, this);
            },

            _toggleTodosEnPagina: function (marcado) {
                var self = this;
                this._data.forEach(function (r) {
                    var id = String(r.lado_id);
                    if (marcado) {
                        self._seleccionados[id] = r;
                    } else {
                        delete self._seleccionados[id];
                    }
                });
                this._renderTabla();
            },

            _actualizarBarraSeleccion: function () {
                var numSel = Object.keys(this._seleccionados).length;
                var self   = this;

                this.$el.find('#contador-sel').text(
                    numSel > 0
                        ? numSel + ' seleccionado' + (numSel !== 1 ? 's' : '')
                        : 'Ninguno seleccionado'
                );

                this.$el.find('.chk-fila').each(function () {
                    var $chk   = $(this);
                    var ladoId = String($chk.data('lado-id'));
                    $chk.closest('tr').css(
                        'background',
                        self._seleccionados[ladoId] ? 'rgba(184,162,121,0.12)' : ''
                    );
                });
            },

            _sincronizarChkPagina: function () {
                this.$el.find('#chk-todos').prop(
                    'checked', this._todosEnPaginaSeleccionados()
                );
            },

            _renderPaginacion: function () {
                var totalPaginas = Math.ceil(this._total / this._porPagina);
                if (totalPaginas <= 1) return '';

                var actual = this._pagina;
                var total  = totalPaginas;
                var pages  = [];
                var rango  = 2;
                var ini    = Math.max(2, actual - rango);
                var fin    = Math.min(total - 1, actual + rango);

                pages.push(1);
                if (ini > 2)         pages.push('...');
                for (var i = ini; i <= fin; i++) pages.push(i);
                if (fin < total - 1) pages.push('...');
                if (total > 1)       pages.push(total);

                var desde = (actual - 1) * this._porPagina + 1;
                var hasta = Math.min(actual * this._porPagina, this._total);

                var html = '<div class="paginacion-container">';
                html += '<div class="paginacion-info">Mostrando ' +
                        desde + '–' + hasta + ' de ' + this._total + ' registros</div>';
                html += '<div class="paginacion-controles">';

                html += '<button class="pag-btn' + (actual <= 1 ? ' disabled' : '') + '"' +
                        ' data-pagina="' + (actual - 1) + '"' +
                        (actual <= 1 ? ' disabled' : '') + '>' +
                        '<i class="fas fa-chevron-left"></i></button>';

                pages.forEach(function (p) {
                    if (p === '...') {
                        html += '<span class="pag-ellipsis">…</span>';
                    } else {
                        html += '<button class="pag-btn' +
                                (p === actual ? ' pag-activo' : '') +
                                '" data-pagina="' + p + '">' + p + '</button>';
                    }
                });

                html += '<button class="pag-btn' + (actual >= total ? ' disabled' : '') + '"' +
                        ' data-pagina="' + (actual + 1) + '"' +
                        (actual >= total ? ' disabled' : '') + '>' +
                        '<i class="fas fa-chevron-right"></i></button>';

                html += '</div></div>';
                return html;
            },

            _exportar: function () {
                var numSel = Object.keys(this._seleccionados).length;
                var fuente = numSel > 0
                    ? Object.values(this._seleccionados)
                    : this._data;

                if (!fuente.length) return;

                var headers = [
                    '#', 'ID Propiedad', 'Dirección', 'Tipo de Lado', 'Tipo Operación',
                    'Oficina', 'Asesor', 'Tipo Propiedad', 'Subtipo',
                    'Fecha Cierre', 'Precio Inicial', 'Precio Cierre', 'Área m²', 'Precio / m²'
                ];

                var self = this;
                var filas = fuente.map(function (r, idx) {
                    return [
                        idx + 1,
                        r.propiedad_id,      r.direccion,
                        r.tipo_lado,         self._transformarEtiqueta(r.tipo_operacion),
                        r.oficina_nombre,    r.asesor_nombre,
                        self._transformarEtiqueta(r.tipo_propiedad),
                        self._transformarEtiqueta(r.sub_tipo_propiedad),
                        r.fecha_cierre || '',
                        r.precio_inicial,    r.precio_cierre,
                        r.area_construccion, r.precio_por_m2
                    ];
                });

                ExcelExport.exportar({
                    nombreArchivo: 'detalle_propiedades',
                    titulo:    'Detalle de Propiedades',
                    subtitulo: this._titulo +
                               (numSel > 0
                                    ? ' (' + numSel + ' seleccionado' +
                                      (numSel !== 1 ? 's' : '') + ')'
                                    : ' (página actual)'),
                    headers:   headers,
                    filas:     filas
                });
            },

            _mostrarVacio: function (msg) {
                this.$el.find('#detalle-container').html(
                    '<div class="em-empty">' +
                    '<div class="em-empty-icon"><i class="fas fa-inbox"></i></div>' +
                    '<h4>Sin resultados</h4>' +
                    '<p>' + (msg || 'No hay datos para esta selección.') + '</p>' +
                    '</div>'
                );
                this.$el.find('[data-action="exportar"]').prop('disabled', true);
            },

            _esc: function (str) {
                if (!str) return '';
                return String(str)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;');
            },

            _precio: function (num) {
                if (num === null || num === undefined || num === '') return '-';
                return '$ ' + parseFloat(num).toLocaleString('es-VE', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
            },

            _m2: function (num) {
                if (num === null || num === undefined || num === '') return '-';
                return parseFloat(num).toLocaleString('es-VE', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }) + ' m²';
            }
        });
    }
);