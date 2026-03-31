// estadisticas-mercado/src/controllers/main.js
define('estadisticas-mercado:controllers/main', ['controller'], function (Controller) {
    return Controller.extend({

        defaultAction: 'index',

        actionIndex: function () {
            this.main('estadisticas-mercado:views/index');
        },

        actionLadosPorTipoOperacion: function () {
            this.main('estadisticas-mercado:views/reportes/lados-por-tipo-operacion');
        }

    });
});
