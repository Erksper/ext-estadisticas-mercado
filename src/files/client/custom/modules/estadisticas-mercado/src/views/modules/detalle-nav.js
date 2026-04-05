// estadisticas-mercado/src/views/modules/detalle-nav.js
//
// Mixin que cualquier vista de reporte puede usar para navegar al detalle.
//
// INTEGRACIÓN EN CADA REPORTE:
//   1. Importar el mixin en el define()
//   2. Extender con: View.extend($.extend({}, DetalleNav, { … }))
//   3. En el click de col/fila llamar a: this._irADetalle({ … })
//
// El mixin construye la URL de retorno con los filtros activos del reporte
// de forma que al pulsar "Volver" en el detalle se restauren exactamente.
//
// CONVENIO: cada reporte debe exponer this._filtrosActuales con estas claves
// (las que apliquen, el resto pueden ser null):
//   { claId, oficinaId, asesorId, fechaInicio, fechaFin,
//     tipoOperacion, tipoPropiedad, subtipoPropiedad, ciudad }
//
// Y también debe exponer this._rutaReporte con la ruta base del hash,
// p.ej. '#EstadisticasMercado/ladosPorTipoOperacion'

define('estadisticas-mercado:views/modules/detalle-nav', [], function () {

    // Claves de filtros que se pasan como query-string en la URL de retorno
    var FILTRO_KEYS = [
        'claId', 'oficinaId', 'asesorId',
        'fechaInicio', 'fechaFin',
        'tipoOperacion', 'tipoPropiedad', 'subtipoPropiedad',
        'ciudad'
    ];

    /**
     * Construye una query-string a partir de un objeto de filtros,
     * omitiendo las claves nulas/vacías.
     */
    function filtrosAQS(filtros) {
        var partes = [];
        FILTRO_KEYS.forEach(function (k) {
            if (filtros && filtros[k]) {
                partes.push(k + '=' + encodeURIComponent(filtros[k]));
            }
        });
        return partes.join('&');
    }

    return {

        /**
         * Navega a la vista de detalle.
         *
         * @param {Object} opciones
         *   reporte        {string}   nombre del reporte ('ladosPorTipoOperacion' | …)
         *   rutaReporte    {string}   hash base del reporte, p.ej. '#EstadisticasMercado/ladosPorTipoOperacion'
         *   seleccion      {string}   'columna' | 'fila'
         *   identificador  {string}   valor que identifica la col/fila clickeada
         *   titulo         {string}   texto legible para el subtítulo de la página de detalle
         *   filtros        {Object}   filtros activos en el reporte (this._filtrosActuales)
         */
        _irADetalle: function (opciones) {
            var f       = opciones.filtros || {};
            var filtroQS = filtrosAQS(f);

            // ── URL de retorno: ruta del reporte + sus filtros activos ─────────
            // Así al volver el controlador puede restaurar el estado exacto.
            var retornoBase = opciones.rutaReporte || '#EstadisticasMercado';
            var retornoUrl  = retornoBase + (filtroQS ? '?' + filtroQS : '');

            // ── Parámetros para la página de detalle ──────────────────────────
            var params = [];
            params.push('reporte='       + encodeURIComponent(opciones.reporte       || ''));
            params.push('seleccion='     + encodeURIComponent(opciones.seleccion     || ''));
            params.push('identificador=' + encodeURIComponent(opciones.identificador || ''));
            params.push('titulo='        + encodeURIComponent(opciones.titulo        || ''));
            params.push('retorno='       + encodeURIComponent(retornoUrl));

            // Pasar también los filtros al detalle (para que el endpoint los use)
            if (filtroQS) params.push(filtroQS);

            var url = '#EstadisticasMercado/propiedadesDetalle?' + params.join('&');
            this.getRouter().navigate(url, { trigger: true });
        }
    };
});