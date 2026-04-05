// estadisticas-mercado/src/controllers/main.js
define('estadisticas-mercado:controllers/main', ['controller'], function (Controller) {
    return Controller.extend({

        defaultAction: 'index',

        actionIndex: function () {
            this.main('estadisticas-mercado:views/index');
        },

        // Cada acción de reporte recibe $params (query-string de la URL)
        // y los pasa a la vista para poder restaurar filtros al volver del detalle.

        actionLadosPorTipoOperacion: function ($params) {
            this.main('estadisticas-mercado:views/reportes/lados-por-tipo-operacion', {
                params: $params || {}
            });
        },

        actionRangoPrecios: function ($params) {
            this.main('estadisticas-mercado:views/reportes/rango-precios', {
                params: $params || {}
            });
        },

        actionTiposLadoPorAsesor: function ($params) {
            this.main('estadisticas-mercado:views/reportes/tipos-lado-por-asesor', {
                params: $params || {}
            });
        },

        actionTiposLadoPorOficina: function ($params) {
            this.main('estadisticas-mercado:views/reportes/tipos-lado-por-oficina', {
                params: $params || {}
            });
        },

        actionEstadisticasM2: function ($params) {
            this.main('estadisticas-mercado:views/reportes/estadisticas-m2', {
                params: $params || {}
            });
        },

        actionEstadisticasM2Cla: function ($params) {
            this.main('estadisticas-mercado:views/reportes/estadisticas-m2-cla', {
                params: $params || {}
            });
        },

        actionPropiedadesDetalle: function ($params) {
            this.main('estadisticas-mercado:views/reportes/propiedades-detalle', {
                params: $params || {}
            });
        }

    });
});