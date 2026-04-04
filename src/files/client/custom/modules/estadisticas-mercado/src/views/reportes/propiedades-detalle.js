// estadisticas-mercado/src/views/reportes/propiedades-detalle.js
define('estadisticas-mercado:views/reportes/propiedades-detalle', ['view', 'estadisticas-mercado:views/modules/excel-export'], function (View, ExcelExport) {
    return View.extend({
        // Devolvemos el HTML directamente para que la vista lo use
        getTemplate: function () {
            return '<div class="em-page-header">' +
                '<div class="em-header-icon"><i class="fas fa-building"></i></div>' +
                '<div><h2 class="em-page-title">Detalle de Propiedades</h2>' +
                '<p class="em-page-sub" id="detalle-subtitulo">Cargando...</p></div></div>' +
                '<div class="em-reporte-header"><h2><i class="fas fa-table"></i> Listado de Propiedades</h2>' +
                '<div class="em-reporte-acciones"><button class="em-btn em-btn-primary" data-action="volver">' +
                '<i class="fas fa-arrow-left"></i> Volver</button>' +
                '<button class="em-btn em-btn-primary" data-action="exportar" disabled>' +
                '<i class="fas fa-file-excel"></i> Exportar Excel</button></div></div>' +
                '<div id="detalle-container"><div class="em-empty"><div class="em-spinner" style="margin-bottom:16px;"></div>' +
                '<h4>Cargando datos...</h4></div></div>';
        },

        _ladosIds: null,
        _total: 0,
        _pagina: 1,
        _porPagina: 25,
        _data: [],
        _titulo: '',
        _retornoUrl: null,
        _cargandoPagina: false,

        events: {
            'click [data-action="volver"]': function () {
                if (this._retornoUrl) {
                    this.getRouter().navigate(this._retornoUrl, { trigger: true });
                } else {
                    this.getRouter().navigate('#EstadisticasMercado', { trigger: true });
                }
            },
            'click [data-action="exportar"]': function () {
                this.exportarExcel();
            },
            'click .pag-btn': function (e) {
                var pagina = parseInt($(e.currentTarget).data('pagina'), 10);
                if (!isNaN(pagina)) this.irAPagina(pagina);
            }
        },

        setup: function () {
            console.log('🔵 setup() iniciado');
            var params = this.options.params || {};
            var dataString = params.data;
            this._retornoUrl = params.retorno ? decodeURIComponent(params.retorno) : null;

            if (!dataString) {
                Espo.Ui.error('No se recibieron datos para el detalle.');
                return;
            }

            var parts = dataString.split('|');
            if (parts.length !== 5) {
                Espo.Ui.error('Formato de datos inválido.');
                return;
            }

            this._reporte = parts[0];
            this._tipoSeleccion = parts[1];
            this._identificador = parts[2];
            this._titulo = parts[3];
            try {
                this._filtros = JSON.parse(parts[4]);
            } catch(e) {
                this._filtros = {};
            }

            // Mostramos el título en el subtítulo una vez que el DOM esté listo
            this.once('after:render', function () {
                this.$el.find('#detalle-subtitulo').text(this._titulo);
            }.bind(this));
        },

        afterRender: function () {
            console.log('🟢 afterRender() - DOM listo, cargando datos');
            this.cargarLadosIds();
        },

        cargarLadosIds: function () {
            console.log('🟠 cargarLadosIds() iniciado');
            var self = this;
            var data = {
                reporte: this._reporte,
                tipoSeleccion: this._tipoSeleccion,
                identificador: this._identificador,
                filtros: JSON.stringify(this._filtros)
            };
            Espo.Ajax.getRequest('EstadisticasMercado/action/getLadosIdsParaDetalle', data)
                .then(function (resp) {
                    console.log('✅ Respuesta getLadosIdsParaDetalle:', resp);
                    if (!resp.success) {
                        Espo.Ui.error(resp.error || 'Error al obtener los lados');
                        self.mostrarVacio();
                        return;
                    }
                    self._ladosIds = resp.ladosIds;
                    if (!self._ladosIds) {
                        self.mostrarVacio();
                        return;
                    }
                    self._total = self._ladosIds.split(',').length;
                    self._pagina = 1;
                    self.cargarPropiedades();
                })
                .catch(function (err) {
                    console.error('❌ Error en getLadosIdsParaDetalle:', err);
                    Espo.Ui.error('Error de conexión');
                    self.mostrarVacio();
                });
        },

        cargarPropiedades: function () {
            console.log('🟣 cargarPropiedades() iniciado, página:', this._pagina);
            if (this._cargandoPagina) return;
            this._cargandoPagina = true;

            var container = this.$el.find('#detalle-container');
            if (!container.length) {
                console.error('❌ #detalle-container no encontrado');
                return;
            }
            container.html('<div class="em-empty"><div class="em-spinner" style="margin-bottom:16px;"></div><h4>Cargando propiedades...</h4></div>');

            var self = this;
            var postData = {
                ladosIds: this._ladosIds,
                pagina: this._pagina,
                porPagina: this._porPagina
            };
            $.ajax({
                url: 'api/v1/EstadisticasMercado/action/getPropiedadesPorLados',
                type: 'POST',
                data: JSON.stringify(postData),
                contentType: 'application/json',
                success: function (resp) {
                    console.log('✅ Respuesta POST getPropiedadesPorLados:', resp);
                    self._cargandoPagina = false;
                    if (!resp.success) {
                        Espo.Ui.error(resp.error || 'Error al cargar propiedades');
                        self.mostrarVacio();
                        return;
                    }
                    self._data = resp.data || [];
                    self._total = resp.total;
                    self._pagina = resp.pagina;
                    self._porPagina = resp.porPagina;
                    self.renderTabla();
                },
                error: function (xhr, status, err) {
                    console.error('❌ Error en POST getPropiedadesPorLados:', err, xhr);
                    self._cargandoPagina = false;
                    Espo.Ui.error('Error de conexión');
                    self.mostrarVacio();
                }
            });
        },

        irAPagina: function (pagina) {
            if (pagina < 1 || pagina > Math.ceil(this._total / this._porPagina) || this._cargandoPagina) return;
            this._pagina = pagina;
            this.cargarPropiedades();
        },

        renderTabla: function () {
            console.log('🎨 renderTabla() iniciado');
            var container = this.$el.find('#detalle-container');
            if (!container.length) {
                console.error('❌ No se encontró #detalle-container');
                return;
            }
            if (!this._data.length) {
                container.html('<div class="em-empty"><div class="em-empty-icon"><i class="fas fa-inbox"></i></div><h4>Sin resultados</h4><p>No se encontraron propiedades para esta selección.</p></div>');
                this.$el.find('[data-action="exportar"]').prop('disabled', true);
                return;
            }

            var html = '<div class="em-tabla-wrapper"><div class="em-tabla-scroll"><table class="em-tabla"><thead><tr>';
            html += '<th>ID Propiedad</th>';
            html += '<th>Dirección</th>';
            html += '<th>Tipo de Lado</th>';
            html += '<th>Tipo Operación</th>';
            html += '<th>Oficina</th>';
            html += '<th>Asesor</th>';
            html += '<th>Tipo Propiedad</th>';
            html += '<th>Subtipo</th>';
            html += '<th>Precio Inicial</th>';
            html += '<th>Precio Cierre</th>';
            html += '<th>Área Construcción (m²)</th>';
            html += '<th>Precio por m²</th>';
            html += '</thead><tbody>';

            for (var i = 0; i < this._data.length; i++) {
                var row = this._data[i];
                html += '<tr>';
                html += '<td>' + this.escapeHtml(row.propiedad_id) + '</td>';
                html += '<td>' + this.escapeHtml(row.direccion) + '</td>';
                html += '<td>' + this.escapeHtml(row.tipo_lado) + '</td>';
                html += '<td>' + this.escapeHtml(row.tipo_operacion) + '</td>';
                html += '<td>' + this.escapeHtml(row.oficina_nombre) + '</td>';
                html += '<td>' + this.escapeHtml(row.asesor_nombre) + '</td>';
                html += '<td>' + this.escapeHtml(row.tipo_propiedad) + '</td>';
                html += '<td>' + this.escapeHtml(row.sub_tipo_propiedad) + '</td>';
                html += '<td>' + (row.precio_inicial ? '$ ' + this.formatNumber(row.precio_inicial) : '-') + '</td>';
                html += '<td>' + (row.precio_cierre ? '$ ' + this.formatNumber(row.precio_cierre) : '-') + '</td>';
                html += '<td>' + (row.area_construccion ? this.formatNumber(row.area_construccion) + ' m²' : '-') + '</td>';
                html += '<td>' + (row.precio_por_m2 ? '$ ' + this.formatNumber(row.precio_por_m2) : '-') + '</td>';
                html += '</tr>';
            }

            html += '</tbody></table></div></div>';
            html += this.renderPaginacion();
            container.html(html);
            this.$el.find('[data-action="exportar"]').prop('disabled', false);
            console.log('✅ Tabla renderizada correctamente');
        },

        renderPaginacion: function () {
            var totalPaginas = Math.ceil(this._total / this._porPagina);
            if (totalPaginas <= 1) return '';

            var actual = this._pagina;
            var total = totalPaginas;
            var pages = [];
            var rango = 2;
            var ini = Math.max(2, actual - rango);
            var fin = Math.min(total - 1, actual + rango);

            pages.push(1);
            if (ini > 2) pages.push('...');
            for (var i = ini; i <= fin; i++) pages.push(i);
            if (fin < total - 1) pages.push('...');
            if (total > 1) pages.push(total);

            var html = '<div class="paginacion-container">';
            html += '<div class="paginacion-info">Página ' + actual + ' de ' + total + '</div>';
            html += '<div class="paginacion-controles">';
            html += '<button class="pag-btn pag-nav' + (actual <= 1 ? ' disabled' : '') + '" data-pagina="' + (actual - 1) + '"' + (actual <= 1 ? ' disabled' : '') + '><i class="fas fa-chevron-left"></i></button>';
            pages.forEach(function (p) {
                if (p === '...') {
                    html += '<span class="pag-ellipsis">…</span>';
                } else {
                    html += '<button class="pag-btn' + (p === actual ? ' pag-activo' : '') + '" data-pagina="' + p + '">' + p + '</button>';
                }
            });
            html += '<button class="pag-btn pag-nav' + (actual >= total ? ' disabled' : '') + '" data-pagina="' + (actual + 1) + '"' + (actual >= total ? ' disabled' : '') + '><i class="fas fa-chevron-right"></i></button>';
            html += '</div></div>';
            return html;
        },

        exportarExcel: function () {
            var headers = ['ID Propiedad', 'Dirección', 'Tipo de Lado', 'Tipo Operación', 'Oficina', 'Asesor', 'Tipo Propiedad', 'Subtipo', 'Precio Inicial', 'Precio Cierre', 'Área Construcción (m²)', 'Precio por m²'];
            var filas = this._data.map(function (row) {
                return [
                    row.propiedad_id,
                    row.direccion,
                    row.tipo_lado,
                    row.tipo_operacion,
                    row.oficina_nombre,
                    row.asesor_nombre,
                    row.tipo_propiedad,
                    row.sub_tipo_propiedad,
                    row.precio_inicial,
                    row.precio_cierre,
                    row.area_construccion,
                    row.precio_por_m2
                ];
            });
            ExcelExport.exportar({
                nombreArchivo: 'detalle_propiedades',
                titulo: 'Detalle de Propiedades',
                subtitulo: this._titulo,
                headers: headers,
                filas: filas
            });
        },

        mostrarVacio: function () {
            this.$el.find('#detalle-container').html('<div class="em-empty"><div class="em-empty-icon"><i class="fas fa-inbox"></i></div><h4>Sin datos</h4></div>');
            this.$el.find('[data-action="exportar"]').prop('disabled', true);
        },

        formatNumber: function (num) {
            if (num === null || num === undefined) return '';
            return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        },

        escapeHtml: function (str) {
            if (!str) return '';
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }
    });
});