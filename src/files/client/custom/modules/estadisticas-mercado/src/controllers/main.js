// estadisticas-mercado/src/controllers/main.js
define('estadisticas-mercado:controllers/main', ['controller'], function (Controller) {
    return Controller.extend({

        defaultAction: 'index',

        actionIndex: function () {
            this.main('estadisticas-mercado:views/index');
        },

        actionLadosPorTipoOperacion: function () {
            this.main('estadisticas-mercado:views/reportes/lados-por-tipo-operacion');
        },

        actionRangoPrecios: function () {
            this.main('estadisticas-mercado:views/reportes/rango-precios');
        },

        actionTiposLadoPorAsesor: function () {
            this.main('estadisticas-mercado:views/reportes/tipos-lado-por-asesor');
        },

        actionTiposLadoPorOficina: function () {
            this.main('estadisticas-mercado:views/reportes/tipos-lado-por-oficina');
        },

        actionEstadisticasM2: function () {
            this.main('estadisticas-mercado:views/reportes/estadisticas-m2');
        },

        actionEstadisticasM2Cla: function () {
            this.main('estadisticas-mercado:views/reportes/estadisticas-m2-cla');
        },

        actionPropiedadesDetalle: function ($params) {
            // Los parámetros de la URL están en $params
            var params = $params || {};
            this.main('estadisticas-mercado:views/reportes/propiedades-detalle', { params: params });
        }

    });
});